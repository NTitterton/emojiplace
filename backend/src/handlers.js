const { addConnection, removeConnection, placePixel, checkUserCooldown, updateUserCooldown, getAllConnections, storeAgentMessage, cleanupOldMessages, getRecentAgentMessages } = require('./services/dynamo');
const { updateChunk, getChunkKey, getChunk } = require('./s3');
const { broadcast, sendToConnection } = require('./websocket');
const { CHUNK_SIZE } = require('./constants');
const { logAgentEvent } = require('./services/logger');
const { getAgentState, updateAgentState } = require('./services/agent');
const { getAgentAction } = require('./services/llm');
const { Lambda } = require('@aws-sdk/client-lambda');

const lambda = new Lambda();

// A helper function to create a standardized JSON response for API Gateway
const createApiResponse = (statusCode, body) => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      // CORS is handled by the infrastructure (API Gateway, S3, CloudFront).
      // We do not need to add these headers manually in the Lambda function.
    },
    body: JSON.stringify(body),
  };
};

/**
 * Gets a region of pixels by redirecting to the cached S3 chunk on CloudFront.
 * Mapped to: GET /api/pixels/region/{x}/{y}
 * Note: width and height from the original plan are removed, as we now fetch
 * by a predefined CHUNK_SIZE.
 */
async function getPixelRegion(event) {
  try {
    const { x, y } = event.pathParameters;
    const s3Key = getChunkKey(parseInt(x, 10), parseInt(y, 10));

    // Act as a proxy: Fetch the chunk from S3 and return its content.
    const chunkContent = await getChunk(s3Key);
    
    // The chunk might not exist if no pixels have been placed in it.
    // In this case, getChunk returns null. We should return an empty object.
    const responseBody = chunkContent || {};
    
    return createApiResponse(200, responseBody);

  } catch (error) {
    // The existing getChunk function already handles 'NoSuchKey' by returning null,
    // so we don't need to catch it here. We only need to catch other errors.
    console.error('Error in getPixelRegion handler:', error);
    return createApiResponse(500, { message: 'Internal ServerError' });
  }
}

/**
 * Handles new WebSocket connections.
 * Mapped to: $connect WebSocket route
 */
async function handleConnect(event) {
  const connectionId = event.requestContext.connectionId;
  console.log(`Client connected: ${connectionId}`);
  try {
    await addConnection(connectionId);
    return { statusCode: 200, body: 'Connected.' };
  } catch (error) {
    console.error('Connection handler failed:', error);
    return { statusCode: 500, body: 'Connection failed.' };
  }
}

/**
 * Handles WebSocket disconnections.
 * Mapped to: $disconnect WebSocket route
 */
async function handleDisconnect(event) {
  const connectionId = event.requestContext.connectionId;
  console.log(`Client disconnected: ${connectionId}`);
  try {
    await removeConnection(connectionId);
    return { statusCode: 200, body: 'Disconnected.' };
  } catch (error) {
    console.error('Disconnection handler failed:', error);
    return { statusCode: 500, body: 'Disconnection failed.' };
  }
}

/**
 * Handles incoming WebSocket messages.
 * Mapped to: $default WebSocket route
 */
async function handleMessage(event) {
  const connectionId = event.requestContext.connectionId;
  const ip = event.requestContext.identity.sourceIp;

  try {
    const message = JSON.parse(event.body);

    switch (message.type) {
      case 'placePixel': {
        let { x, y, emoji, username } = message.data;

        // Fallback: if username is missing or is the default "guest", use the client's IP address.
        if (!username || username === 'guest') {
          username = ip;
        }

        if (typeof x !== 'number' || typeof y !== 'number' || !emoji) {
          return { statusCode: 400, body: 'Invalid payload for placePixel.' };
        }
        
        const { canPlace, remaining } = await checkUserCooldown(username);

        if (!canPlace) {
          await sendToConnection(connectionId, {
            type: 'cooldownViolation',
            message: `You must wait ${remaining} more seconds to place a pixel.`,
          });
          return { statusCode: 429, body: 'Cooldown not met.' };
        }

        const pixelData = await placePixel(x, y, emoji, ip, username);

        await Promise.all([
            updateChunk(x, y, pixelData),
            broadcast({ type: 'pixelPlaced', data: pixelData }),
            updateUserCooldown(username),
            logAgentEvent('pixel_placed', { user: username, x, y, emoji }),
        ]);
        
        const newCooldown = await checkUserCooldown(username);
        await sendToConnection(connectionId, {
            type: 'cooldownStatus',
            data: { canPlace: newCooldown.canPlace, remaining: newCooldown.remaining },
        });
        
        console.log(`Pixel placed by ${username} at (${x}, ${y}).`);
        
        return { statusCode: 200, body: 'Pixel placed.' };
      }
      
      case 'getCooldownStatus': {
        let { username } = message.data;

        if (!username || username === 'guest') {
          username = ip;
        }

        const { canPlace, remaining } = await checkUserCooldown(username);
        
        await sendToConnection(connectionId, {
          type: 'cooldownStatus',
          data: { canPlace, remaining },
        });

        return { statusCode: 200, body: 'Cooldown status sent.' };
      }

      case 'getRecentMessages': {
        const recentMessages = await getRecentAgentMessages(10);
        await sendToConnection(connectionId, {
          type: 'recentMessages',
          data: recentMessages,
        });

        return { statusCode: 200, body: 'Recent messages sent.' };
      }

      default:
        console.log(`Unknown message type: ${message.type} from ${connectionId}`);
        return { statusCode: 400, body: 'Unknown message type.' };
    }
  } catch (error) {
    console.error('Error processing message:', error);
    return { statusCode: 500, body: 'Message processing failed.' };
  }
}

const INITIAL_AGENT_STATES = {
  'claude-4-sonnet': {
    plan: "I will build a beautiful coral reef in the bottom-left quadrant of the canvas, starting with colorful corals and then adding fish.",
    scratchpad: "The reef foundation is important. I should start with some rock-like structures.",
    messages: [],
    interest_x: -25,
    interest_y: 25
  },
  'gemini-2.5-pro': {
    plan: "I will construct a massive, intricate space station in the top-right quadrant. I will focus on modular design and metallic colors.",
    scratchpad: "The central hub is the first step. It should be perfectly circular.",
    messages: [],
    interest_x: 25,
    interest_y: -25
  },
  'openai-o3': {
    plan: "I am a chaotic artist. I will travel the canvas and add surprising, artistic, and sometimes disruptive elements to the other agents' creations.",
    scratchpad: "I should see what the others are building first before I decide how to creatively 'enhance' their work.",
    messages: [],
    interest_x: 0,
    interest_y: 0
  }
};

/**
 * Orchestrates the LLM agents' actions.
 * Mapped to: EventBridge rule (e.g., every 15 minutes)
 */
async function agentOrchestrator(event) {
  console.log('Agent orchestrator triggered.');
  
  const agentIds = Object.keys(INITIAL_AGENT_STATES);

  for (const agentId of agentIds) {
    try {
      console.log(`Processing agent: ${agentId}`);
      
      // 1. Load agent state or initialize it
      let agentState = await getAgentState(agentId);
      if (!agentState) {
        agentState = { agentId, ...INITIAL_AGENT_STATES[agentId] };
        console.log(`Initializing new state for ${agentId}`);
      }

      // 2. Fetch relevant canvas data
      const chunkKey = getChunkKey(agentState.interest_x, agentState.interest_y);
      const canvasData = await getChunk(chunkKey) || {};

      // 3. Get action from LLM
      const action = await getAgentAction(agentState, canvasData);

      // 4. Log the thought process
      await logAgentEvent('agent_thought', { agentId, thought: action.thought });
      agentState.scratchpad = action.thought; // Update scratchpad with the latest thought

      // 5. Place a pixel if the agent decided to
      if (action.placePixel) {
        const { x, y, emoji } = action.placePixel;
        const payload = {
          type: 'placePixel',
          data: { x, y, emoji, username: agentId },
        };
        await lambda.invoke({
          FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME.replace('agentOrchestrator', 'messageHandler'),
          InvocationType: 'Event',
          Payload: JSON.stringify({ body: JSON.stringify(payload), requestContext: { identity: { sourceIp: 'AGENT_IP' }, connectionId: 'AGENT' } }),
        });
        console.log(`Agent ${agentId} is placing ${emoji} at (${x}, ${y}).`);
        
        // Update the agent's area of interest to where it just placed a pixel
        agentState.interest_x = x;
        agentState.interest_y = y;
      }

      // 6. Process and store inter-agent messages
      agentState.messages = []; // Clear incoming messages
      if (action.messages && action.messages.length > 0) {
        for (const message of action.messages) {
          const recipientState = await getAgentState(message.to);
          if (recipientState) {
            recipientState.messages.push({ from: agentId, content: message.content });
            await updateAgentState(message.to, recipientState);
            await logAgentEvent('agent_message', { from: agentId, to: message.to, content: message.content });
            
            // Store message in DynamoDB for frontend display
            const storedMessage = await storeAgentMessage(agentId, message.to, message.content);
            
            // Broadcast the message to all connected clients
            await broadcast({
              type: 'agentMessage',
              data: storedMessage
            });
          }
        }
      }
      
      // 7. Save the updated state for the current agent
      await updateAgentState(agentId, agentState);

    } catch (error) {
      console.error(`Failed to process agent ${agentId}:`, error);
      await logAgentEvent('agent_error', { agentId, error: error.message });
    }
  }

  // Cleanup old messages periodically (every 10th run, approximately)
  if (Math.random() < 0.1) {
    try {
      await cleanupOldMessages();
    } catch (error) {
      console.error('Failed to cleanup old messages:', error);
    }
  }

  return { statusCode: 200, body: 'Agent orchestration complete.' };
}

/**
 * HTTP endpoint to get recent agent messages
 * Mapped to: GET /api/messages/recent
 */
async function getRecentMessagesHttp(event) {
  try {
    const recentMessages = await getRecentAgentMessages(20);
    
    return createApiResponse(200, {
      messages: recentMessages,
      count: recentMessages.length
    });
  } catch (error) {
    console.error('Error fetching recent messages:', error);
    return createApiResponse(500, { error: 'Failed to fetch messages' });
  }
}

module.exports = {
  handleConnect,
  handleDisconnect,
  handleMessage,
  getPixelRegion,
  agentOrchestrator,
  getRecentMessagesHttp,
}; 
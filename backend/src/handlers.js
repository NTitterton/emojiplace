const { addConnection, removeConnection, placePixel, checkUserCooldown, updateUserCooldown } = require('./services/dynamo');
const { updateChunk, getChunkKey, getChunk } = require('./s3');
const { broadcast, sendToConnection } = require('./websocket');
const { CHUNK_SIZE } = require('./constants');
const { logAgentEvent } = require('./services/logger');
const { getAgentState, updateAgentState } = require('./services/agent');
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

      default:
        console.log(`Unknown message type: ${message.type} from ${connectionId}`);
        return { statusCode: 400, body: 'Unknown message type.' };
    }
  } catch (error) {
    console.error('Error processing message:', error);
    return { statusCode: 500, body: 'Message processing failed.' };
  }
}

/**
 * Orchestrates the LLM agents' actions.
 * Mapped to: EventBridge rule (e.g., every 15 minutes)
 */
async function agentOrchestrator(event) {
  console.log('Agent orchestrator triggered.', event);
  
  const agents = [
    { id: 'gemini-2.5-pro', emoji: '🤖' },
    { id: 'claude-3-sonnet', emoji: ' Anthropic' },
    { id: 'openai-o3', emoji: ' O' },
  ];

  for (const agent of agents) {
    try {
      console.log(`Processing agent: ${agent.id}`);
      const agentState = await getAgentState(agent.id) || { x: Math.floor(Math.random() * 10), y: Math.floor(Math.random() * 10) };
      
      await logAgentEvent('agent_thought', { agentId: agent.id, thought: "It's my turn to place an emoji!" });

      const newX = agentState.x + 1;
      const newY = agentState.y + 1;

      const payload = {
        type: 'placePixel',
        data: {
          x: newX,
          y: newY,
          emoji: agent.emoji,
          username: agent.id,
        },
      };

      // Invoke the main message handler to place the pixel
      await lambda.invoke({
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME.replace('agentOrchestrator', 'messageHandler'),
        InvocationType: 'Event',
        Payload: JSON.stringify({ body: JSON.stringify(payload), requestContext: { identity: { sourceIp: '127.0.0.1' }, connectionId: 'AGENT' } }),
      });

      await updateAgentState(agent.id, { x: newX, y: newY });
      console.log(`Agent ${agent.id} decided to place a pixel at (${newX}, ${newY}).`);

    } catch (error) {
      console.error(`Failed to process agent ${agent.id}:`, error);
      await logAgentEvent('agent_error', { agentId: agent.id, error: error.message });
    }
  }

  return { statusCode: 200, body: 'Agent orchestration complete.' };
}

module.exports = {
  handleConnect,
  handleDisconnect,
  handleMessage,
  getPixelRegion,
  agentOrchestrator,
}; 
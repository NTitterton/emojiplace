const { addConnection, removeConnection, placePixel, checkUserCooldown, updateUserCooldown } = require('./services/dynamo');
const { updateChunk, getChunkKey, getChunk } = require('./s3');
const { broadcast, sendToConnection } = require('./websocket');
const { CHUNK_SIZE } = require('./constants');

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
        const { x, y, emoji, username } = message.data;

        if (typeof x !== 'number' || typeof y !== 'number' || !emoji || !username) {
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
        const { username } = message.data;
        if (!username) {
          return { statusCode: 400, body: 'Username is required for getCooldownStatus.' };
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

module.exports = {
  handleConnect,
  handleDisconnect,
  handleMessage,
  getPixelRegion,
}; 
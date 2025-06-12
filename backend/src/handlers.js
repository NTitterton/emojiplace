const { addConnection, removeConnection, placePixel, checkUserCooldown, updateUserCooldown } = require('./services/dynamo');
const { updateChunk, getChunkKey } = require('./s3');
const { broadcast, sendToConnection } = require('./websocket');
const { CHUNK_SIZE } = require('./constants');

// A helper function to create a standardized JSON response for API Gateway
const createApiResponse = (statusCode, body) => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // CORS enabled for all origins
      'Access-Control-Allow-Credentials': true,
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
    const { chunkX, chunkY } = event.pathParameters;
    
    // Pass chunk coords directly to getChunkKey
    const s3Key = getChunkKey(chunkX, chunkY);
    
    // The CloudFront URL is passed as an environment variable
    const cloudFrontUrl = process.env.CLOUDFRONT_URL;
    const redirectUrl = `https://${cloudFrontUrl}/${s3Key}`;

    return {
      statusCode: 302, // 302 Found - temporary redirect
      headers: {
        'Location': redirectUrl,
      },
    };

  } catch (error) {
    console.error('Error in getPixelRegion handler:', error);
    return createApiResponse(500, { message: 'Internal Server Error' });
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
        
        // --- Cooldown Logic ---
        const { canPlace, remaining } = await checkUserCooldown(ip);

        if (!canPlace) {
          await sendToConnection(connectionId, {
            type: 'cooldownViolation',
            message: `You must wait ${remaining} more seconds to place a pixel.`,
          });
          return { statusCode: 429, body: 'Cooldown not met.' };
        }

        const pixelData = await placePixel(x, y, emoji, ip, username);

        // Eagerly update the S3 cache, broadcast to all clients, and set the new cooldown
        await Promise.all([
            updateChunk(x, y, pixelData),
            broadcast({ type: 'pixelPlaced', data: pixelData }),
            updateUserCooldown(ip),
        ]);
        
        console.log(`Pixel placed by ${username} at (${x}, ${y}).`);
        
        return { statusCode: 200, body: 'Pixel placed.' };
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
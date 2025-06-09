const AWS = require('aws-sdk');
const { CanvasService } = require('./services/canvas');
const { UserService } = require('./services/user');
const { RedisService } = require('./services/redis');
const { DynamoDbService } = require('./services/dynamo');
const { ApiGatewayManagementApi } = require('@aws-sdk/client-apigatewaymanagementapi');
const { v4: uuidv4 } = require('uuid');

// Initialize services.
// Note: In a real serverless setup, the RedisService would be initialized
// with connection details from environment variables.
const redisService = RedisService;
const canvasService = CanvasService;
const userService = UserService;

// Initialize ApiGatewayManagementApi for sending WebSocket messages
// This is done outside the handler for potential reuse.
const getApiGatewayManagementApi = () => {
  return new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: process.env.WEBSOCKET_API_ENDPOINT,
  });
};

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
 * Gets a single pixel.
 * Mapped to: GET /api/pixels/{x}/{y}
 */
module.exports.getPixel = async (event) => {
  try {
    const { x, y } = event.pathParameters;
    const pixel = await canvasService.getPixel(parseInt(x, 10), parseInt(y, 10));
    if (!pixel) {
      return createApiResponse(404, { message: 'Pixel not found' });
    }
    return createApiResponse(200, pixel);
  } catch (error) {
    console.error('Error in getPixel handler:', error);
    return createApiResponse(500, { message: 'Internal Server Error' });
  }
};

/**
 * Gets a region of pixels.
 * Mapped to: GET /api/pixels/region/{x}/{y}/{width}/{height}
 */
module.exports.getPixelRegion = async (event) => {
  try {
    const { x, y, width, height } = event.pathParameters;
    const pixels = await CanvasService.getPixelRegion(
      parseInt(x, 10),
      parseInt(y, 10),
      parseInt(width, 10),
      parseInt(height, 10)
    );
    return createApiResponse(200, { pixels });
  } catch (error) {
    console.error('Error in getPixelRegion handler:', error);
    return createApiResponse(500, { message: 'Internal Server Error' });
  }
};

/**
 * Gets the current user's state.
 * For serverless, user identification would typically be handled via JWT,
 * custom authorizers, or other headers. For now, we'll simulate it
 * using a static IP from where the request originates.
 * Mapped to: GET /api/users/me
 */
module.exports.getUser = async (event) => {
  try {
    const userId = event.queryStringParameters?.userId;
    if (!userId) {
      return createApiResponse(400, { message: 'userId query parameter is required.' });
    }
    const user = await UserService.getUser(userId);
    const canPlace = await UserService.canPlacePixel(userId);
    return createApiResponse(200, { user, canPlace });
  } catch (error) {
    console.error('Error in getUser handler:', error);
    return createApiResponse(500, { message: 'Internal Server Error' });
  }
};

/**
 * Sets a user's username.
 * Mapped to: POST /api/users/username
 */
module.exports.setUsername = async (event) => {
  try {
    const { userId, username } = JSON.parse(event.body);
    if (!userId || !username) {
      return createApiResponse(400, { message: 'userId and username are required.' });
    }
    await UserService.setUsername(userId, username);
    const user = await UserService.getUser(userId);
    return createApiResponse(200, { user });
  } catch (error) {
    console.error('Error in setUsername handler:', error);
    return createApiResponse(500, { message: 'Internal Server Error' });
  }
};

/**
 * Handles new WebSocket connections.
 * Stores the connection ID for future use (e.g., broadcasting).
 * Mapped to: $connect WebSocket route
 */
module.exports.handleConnect = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const userId = event.queryStringParameters?.userId;
  if (!userId) {
    console.error('Connect handler failed: userId is required.');
    return { statusCode: 400, body: 'Connection failed: userId query parameter is required.' };
  }
  console.log(`Client connected: ${connectionId} with userId: ${userId}`);
  try {
    await UserService.addConnection(userId, connectionId);
    return { statusCode: 200, body: 'Connected.' };
  } catch (error) {
    console.error('Connection handler failed:', error);
    return { statusCode: 500, body: 'Connection failed.' };
  }
};

/**
 * Handles WebSocket disconnections.
 * Removes the connection ID from our store.
 * Mapped to: $disconnect WebSocket route
 */
module.exports.handleDisconnect = async (event) => {
  const connectionId = event.requestContext.connectionId;
  console.log(`Client disconnected: ${connectionId}`);
  try {
    await UserService.removeConnection(connectionId);
    return { statusCode: 200, body: 'Disconnected.' };
  } catch (error) {
    console.error('Disconnection handler failed:', error);
    return { statusCode: 500, body: 'Disconnection failed.' };
  }
};

/**
 * Broadcasts a message to multiple WebSocket connections.
 * @param {string[]} connectionIds - Array of connection IDs to send to.
 * @param {object} messageData - The data to send.
 */
const broadcastMessage = async (connectionIds, messageData) => {
  const apiGateway = getApiGatewayManagementApi();
  const postCalls = connectionIds.map(async (id) => {
    try {
      await apiGateway.postToConnection({ ConnectionId: id, Data: JSON.stringify(messageData) }).promise();
    } catch (e) {
      if (e.statusCode === 410) {
        // This connection is stale. Remove it from our store.
        console.log(`Found stale connection, deleting ${id}`);
        await userService.removeConnection(id);
      } else {
        console.error('Failed to post message to connection', id, e);
      }
    }
  });

  await Promise.all(postCalls);
};

/**
 * Handles incoming WebSocket messages.
 * This is the main router for different message types like 'place_pixel'.
 * Mapped to: $default WebSocket route
 */
module.exports.handleMessage = async (event) => {
  const connectionId = event.requestContext.connectionId;
  try {
    const message = JSON.parse(event.body);
    const userId = await UserService.getUserIdByConnection(connectionId);

    if (!userId) {
      return { statusCode: 403, body: 'Forbidden. No user associated with this connection.' };
    }

    switch (message.type) {
      case 'place_pixel': {
        const canPlace = await UserService.canPlacePixel(userId);
        if (!canPlace) {
          return { statusCode: 429, body: 'Cooldown not met.' };
        }
        
        const { x, y, emoji } = message.data;
        const user = await UserService.getUser(userId);

        const pixelData = {
          xy: `${x}:${y}`,
          x,
          y,
          emoji,
          userId,
          username: user.username,
          timestamp: new Date().toISOString(),
        };

        // Broadcast first for maximum perceived speed
        const allConnections = await UserService.getAllConnections();
        await broadcastMessage(allConnections, {
          type: 'pixel_placed',
          data: pixelData,
        });

        // Now, update Redis and the user's cooldown
        await CanvasService.placePixel(pixelData);
        await UserService.updateUserCooldown(userId);

        console.log(`Pixel placed by ${userId} at (${x}, ${y}). Redis updated.`);

        return { statusCode: 200, body: 'Pixel placed.' };
      }

      case 'subscribe_region':
        // Placeholder for region subscription logic
        console.log('Region subscription not yet implemented.');
        break;

      default:
        console.log(`Unknown message type: ${message.type}`);
        return { statusCode: 400, body: 'Unknown message type.' };
    }
  } catch (error) {
    console.error('Error processing message:', error);
    return { statusCode: 500, body: 'Message processing failed.' };
  }
}; 
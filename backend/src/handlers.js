const AWS = require('aws-sdk');
const { CanvasService } = require('./services/canvas');
const { UserService } = require('./services/user');
const { RedisService } = require('./services/redis');

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
    const pixels = await canvasService.getRegion(
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
    // In a real API Gateway setup, the source IP is available here.
    const ip = event.requestContext?.identity?.sourceIp || '127.0.0.1';
    const userState = await userService.getUserState(ip);
    return createApiResponse(200, userState);
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
    const ip = event.requestContext?.identity?.sourceIp || '127.0.0.1';
    
    if (!event.body) {
        return createApiResponse(400, { message: 'Username is required.' });
    }
    const { username } = JSON.parse(event.body);

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return createApiResponse(400, { message: 'Invalid username.' });
    }

    await userService.setUsername(ip, username.trim());
    return createApiResponse(200, { message: 'Username updated successfully.' });
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
  console.log(`Client connected: ${connectionId}`);

  try {
    await userService.addConnection(connectionId);
    return { statusCode: 200, body: 'Connected.' };
  } catch (error) {
    console.error('Failed to handle connect event:', error);
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
    await userService.removeConnection(connectionId);
    return { statusCode: 200, body: 'Disconnected.' };
  } catch (error) {
    console.error('Failed to handle disconnect event:', error);
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
        console.log(`Found stale connection, removing: ${id}`);
        await userService.removeConnection(id);
      } else {
        console.error(`Failed to post to connection ${id}:`, e);
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
  const ip = event.requestContext?.identity?.sourceIp || '127.0.0.1';
  const body = JSON.parse(event.body);
  console.log(`Received message from ${connectionId}:`, body);

  switch (body.type) {
    case 'place_pixel':
      try {
        const { x, y, emoji, username } = body.payload;
        const userState = await userService.getUserState(ip);

        if (!userState.canPlace) {
          const apiGateway = getApiGatewayManagementApi();
          await apiGateway.postToConnection({
            ConnectionId: connectionId,
            Data: JSON.stringify({
              type: 'place_error',
              message: 'Cooldown active. Please wait.',
              cooldownEnd: userState.cooldownEnd,
            }),
          }).promise();
          return { statusCode: 429 }; // Too Many Requests
        }

        // Place the pixel and set the cooldown
        const pixelData = await canvasService.placePixel(x, y, emoji, ip, username);
        await userService.setUserCooldown(ip);
        
        // Fetch the user's new state, which now includes the cooldown
        const newUserState = await userService.getUserState(ip);

        // Broadcast the new pixel to all connected clients
        const allConnections = await userService.getAllConnections();
        console.log(`Broadcasting new pixel to ${allConnections.length} clients.`);
        await broadcastMessage(allConnections, {
          type: 'pixel_placed',
          data: { x, y, ...pixelData },
        });

        // Send a success confirmation with the new user state to the original client
        const apiGateway = getApiGatewayManagementApi();
        await apiGateway.postToConnection({
            ConnectionId: connectionId,
            Data: JSON.stringify({ type: 'place_success', data: newUserState }),
        }).promise();

      } catch (error) {
        console.error('Error processing place_pixel:', error);
        // Optionally send an error message back to the sender
      }
      break;

    case 'subscribe_region':
      // Placeholder for region subscription logic
      console.log('Region subscription not yet implemented.');
      break;

    default:
      console.log(`Unknown message type: ${body.type}`);
  }

  return { statusCode: 200 };
}; 
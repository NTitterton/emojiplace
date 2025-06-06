const AWS = require('aws-sdk');
const { UserService } = require('./services/user');

// This function should be initialized outside the handler for performance.
const getApiGatewayManagementApi = () => {
  return new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: process.env.WEBSOCKET_API_ENDPOINT,
  });
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
        await UserService.removeConnection(id);
      } else {
        console.error(`Failed to post to connection ${id}:`, e);
      }
    }
  });
  await Promise.all(postCalls);
};


exports.handler = async (event) => {
  console.log('Stream processor invoked with event:', JSON.stringify(event, null, 2));
  
  const allConnections = await UserService.getAllConnections();
  if (allConnections.length === 0) {
    console.log("No active connections. Skipping broadcast.");
    return;
  }

  for (const record of event.Records) {
    // We only care about new pixels being inserted/updated
    if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
      const newPixelImage = record.dynamodb.NewImage;
      
      // The image from the stream is in DynamoDB's format, so we need to unmarshall it.
      const pixelData = AWS.DynamoDB.Converter.unmarshall(newPixelImage);

      console.log(`Broadcasting pixel update for (${pixelData.x}, ${pixelData.y}) to ${allConnections.length} clients.`);

      await broadcastMessage(allConnections, {
        type: 'pixel_placed',
        data: pixelData,
      });
    }
  }
}; 
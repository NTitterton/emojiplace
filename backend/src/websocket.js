const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");
const { getAllConnections, removeConnection } = require("./services/dynamo");

const apiGatewayClient = new ApiGatewayManagementApiClient({
  region: process.env.AWS_REGION,
  endpoint: process.env.WEBSOCKET_API_ENDPOINT,
});

/**
 * Sends a message to a specific WebSocket connection.
 * @param {string} connectionId The ID of the connection to send to.
 * @param {object} data The data to send.
 */
async function sendToConnection(connectionId, data) {
  const message = JSON.stringify(data);
  try {
    const command = new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: message,
    });
    await apiGatewayClient.send(command);
  } catch (error) {
    if (error.$metadata?.httpStatusCode === 410) {
      console.log(`Found stale connection, deleting ${connectionId}`);
      await removeConnection(connectionId);
    } else {
      console.error(`Failed to post to connection ${connectionId}:`, error);
    }
  }
}

/**
 * Broadcasts a message to all connected WebSocket clients.
 * @param {object} data The data to send to the clients.
 */
async function broadcast(data) {
  const connections = await getAllConnections();
  const message = JSON.stringify(data);

  const postPromises = connections.map(async ({ connectionId }) => {
    try {
      const command = new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: message,
      });
      await apiGatewayClient.send(command);
    } catch (error) {
      if (error.$metadata?.httpStatusCode === 410) {
        console.log(`Found stale connection during broadcast, deleting ${connectionId}`);
        await removeConnection(connectionId);
      } else {
        // We log the error but don't re-throw, so one failed connection doesn't stop the whole broadcast.
        console.error(`Failed to post to connection ${connectionId}:`, error);
      }
    }
  });

  await Promise.all(postPromises);
}

module.exports = {
  broadcast,
  sendToConnection,
}; 
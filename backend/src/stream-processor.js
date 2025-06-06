const AWS = require('aws-sdk');
const { UserService } = require('./services/user');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { RedisService } = require('./services/redis');
const { CHUNK_SIZE, getChunkKey } = require('./services/canvas');

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
  console.log('Received event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
      const newImage = record.dynamodb.NewImage;
      const pixel = unmarshall(newImage);

      const chunkX = Math.floor(pixel.x / CHUNK_SIZE);
      const chunkY = Math.floor(pixel.y / CHUNK_SIZE);
      const key = getChunkKey(chunkX, chunkY);
      
      try {
        // We need to update the chunk.
        // For simplicity and safety against race conditions, we'll use a lock.
        const lockKey = `lock:${key}`;
        const lockAquired = await RedisService.set(lockKey, '1', { NX: true, EX: 5 }); // 5-second lock

        if (!lockAquired) {
          console.log(`Could not acquire lock for ${key}. Skipping update, another process is likely handling it.`);
          continue;
        }

        try {
          const rawChunk = await RedisService.get(key);
          const chunk = rawChunk ? JSON.parse(rawChunk) : [];

          const pixelIndex = chunk.findIndex(p => p.x === pixel.x && p.y === pixel.y);

          if (pixelIndex !== -1) {
            // Modify existing pixel
            chunk[pixelIndex] = pixel;
          } else {
            // Insert new pixel
            chunk.push(pixel);
          }

          await RedisService.set(key, JSON.stringify(chunk), { EX: 3600 }); // Cache chunk for 1 hour
          console.log(`Successfully updated cache for chunk ${key}`);
        } finally {
          // Release the lock
          await RedisService.del(lockKey);
        }

      } catch (error) {
        console.error(`Error updating cache for chunk ${key}:`, error);
      }
    }
  }
}; 
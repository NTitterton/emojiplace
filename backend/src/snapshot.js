const { RedisService } = require('./services/redis');
const { DynamoDbService } = require('./services/dynamo');

exports.handler = async () => {
  console.log('Starting Redis to DynamoDB snapshot process...');
  
  try {
    const stream = RedisService.client.scanStream({
      match: 'pixels:chunk:*',
      count: 100,
    });

    let allPixels = [];

    for await (const chunkKeys of stream) {
      if (chunkKeys.length > 0) {
        const chunkData = await RedisService.mget(chunkKeys);
        chunkData.forEach(chunk => {
          if (chunk) {
            allPixels.push(...JSON.parse(chunk));
          }
        });
      }
    }

    console.log(`Found ${allPixels.length} total pixels in Redis to snapshot.`);

    if (allPixels.length > 0) {
      await DynamoDbService.batchWritePixels(allPixels);
      console.log('Successfully wrote pixels to DynamoDB.');
    }

    return {
      statusCode: 200,
      body: `Successfully snapshotted ${allPixels.length} pixels.`,
    };
  } catch (error) {
    console.error('Error during snapshot process:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Snapshot process failed.', error: error.message }),
    };
  }
}; 
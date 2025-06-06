const { CanvasService } = require('./services/canvas');
const { DynamoDbService } = require('./services/dynamo');
const { RedisService } = require('./services/redis');

const PIXEL_CACHE_KEY = 'pixels:all';

exports.handler = async () => {
  console.log('Cache warmer started.');

  try {
    console.log('Fetching all pixels from DynamoDB...');
    const pixels = await DynamoDbService.getAllPixels();
    console.log(`Found ${pixels.length} pixels to cache.`);

    if (pixels.length > 0) {
      // Store the full dataset in the cache with a 1-hour expiration.
      await RedisService.set(PIXEL_CACHE_KEY, JSON.stringify(pixels), { EX: 3600 });
      console.log('Successfully warmed up the Redis cache.');
    } else {
      console.log('No pixels found in the database. Cache not updated.');
    }
    
    return {
      statusCode: 200,
      body: `Successfully cached ${pixels.length} pixels.`,
    };
  } catch (error) {
    console.error('Error during cache warming:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to warm up cache.', error: error.message }),
    };
  }
}; 
const { RedisService } = require('./redis');
const { DynamoDbService } = require('./dynamo');

// A single key for our cache to store the entire pixel map.
const PIXEL_CACHE_KEY = 'pixels:all';

class CanvasService {
  constructor() {
    this.redis = RedisService;
    this.db = DynamoDbService;
  }

  // Placing a pixel only needs to interact with the database.
  // The database stream will handle invalidating the cache and broadcasting.
  async placePixel(x, y, emoji, ip, username) {
    await this.db.placePixel(x, y, emoji, ip, username);
    // No return needed, as the API handler doesn't need the data anymore.
  }

  // This is a direct lookup and should bypass the main cache for simplicity.
  async getPixel(x, y) {
    return this.db.getPixel(x, y);
  }

  // This is the primary method for the frontend to get canvas data.
  // It uses the cache-aside pattern for performance.
  async getRegion(startX, startY, width, height) {
    let pixels = [];
    const cachedPixels = await this.redis.get(PIXEL_CACHE_KEY);

    if (cachedPixels) {
      // CACHE HIT: Data is in Redis.
      console.log('Cache hit. Filtering pixels from cache.');
      pixels = JSON.parse(cachedPixels);
    } else {
      // CACHE MISS: Data is not in Redis.
      console.log('Cache miss. Fetching all pixels from DynamoDB.');
      pixels = await this.db.getAllPixels();
      
      // Store the full dataset in the cache with a 1-hour expiration.
      if (pixels.length > 0) {
        await this.redis.set(PIXEL_CACHE_KEY, JSON.stringify(pixels), { EX: 3600 });
        console.log(`Cached ${pixels.length} pixels.`);
      }
    }

    // Filter the full pixel list to only the requested viewport.
    const regionPixels = pixels.filter(p => 
      p.x >= startX && p.x < startX + width &&
      p.y >= startY && p.y < startY + height
    );
    
    return regionPixels;
  }

  /**
   * If not cached, it fetches all pixels from DynamoDB, caches them,
   * and then returns the requested region.
   * @returns {Promise<Pixel[]>} A promise that resolves to an array of pixels.
   */
  static async getPixelRegion(/* x, y, width, height */) {
    const cachedPixels = await RedisService.get(PIXEL_CACHE_KEY);

    let allPixels;
    if (cachedPixels) {
      console.log('Cache hit for pixel data.');
      allPixels = JSON.parse(cachedPixels);
    } else {
      console.log('Cache miss. Returning empty array. The cache warmer should populate the cache soon.');
      // If the cache is empty, we return an empty array.
      // The cache warmer is responsible for populating it.
      // The user might see an empty canvas for a moment, but this avoids timeouts.
      allPixels = [];
    }

    // Even if we have all pixels, we could still filter them by the requested region here.
    // For now, we are returning all pixels to match the previous behavior.
    return allPixels;
  }
}

module.exports = { CanvasService: new CanvasService() };
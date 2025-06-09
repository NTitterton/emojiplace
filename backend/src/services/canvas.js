const { RedisService } = require('./redis');
const { DynamoDbService } = require('./dynamo');

const CHUNK_SIZE = 100; // Each chunk will be 100x100 pixels
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 1000;

function getChunkKey(chunkX, chunkY) {
  return `pixels:chunk:${chunkX}:${chunkY}`;
}

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

  static async getPixelRegion(x, y, width, height) {
    const startX = Math.max(0, x);
    const startY = Math.max(0, y);
    const endX = Math.min(CANVAS_WIDTH, x + width);
    const endY = Math.min(CANVAS_HEIGHT, y + height);

    const startChunkX = Math.floor(startX / CHUNK_SIZE);
    const endChunkX = Math.floor((endX - 1) / CHUNK_SIZE);
    const startChunkY = Math.floor(startY / CHUNK_SIZE);
    const endChunkY = Math.floor((endY - 1) / CHUNK_SIZE);

    const chunkKeys = [];
    for (let cx = startChunkX; cx <= endChunkX; cx++) {
      for (let cy = startChunkY; cy <= endChunkY; cy++) {
        chunkKeys.push(getChunkKey(cx, cy));
      }
    }

    if (chunkKeys.length === 0) {
      return [];
    }
    
    const chunkData = await RedisService.mget(chunkKeys);

    const allPixels = [];
    chunkData.forEach(chunk => {
      if (chunk) {
        allPixels.push(...JSON.parse(chunk));
      }
    });

    return allPixels;
  }

  /**
   * Places a single pixel on the canvas.
   * This involves writing it to DynamoDB and updating the corresponding Redis cache chunk.
   * @param {object} pixel - The pixel object to place.
   * @returns {Promise<void>}
   */
  static async placePixel(pixel) {
    const chunkX = Math.floor(pixel.x / CHUNK_SIZE);
    const chunkY = Math.floor(pixel.y / CHUNK_SIZE);
    const key = getChunkKey(chunkX, chunkY);

    // This is a "read-then-write" operation. For this app, we're accepting the
    // small risk of a race condition for the sake of simplicity.
    // A locking mechanism could be added here for more critical applications.
    const rawChunk = await RedisService.get(key);
    const chunk = rawChunk ? JSON.parse(rawChunk) : [];

    const pixelIndex = chunk.findIndex(p => p.x === pixel.x && p.y === pixel.y);

    if (pixelIndex !== -1) {
      chunk[pixelIndex] = pixel; // Replace existing pixel
    } else {
      chunk.push(pixel); // Add new pixel
    }

    await RedisService.set(key, JSON.stringify(chunk), { EX: 60 * 60 * 25 }); // Cache for ~1 day
  }
}

module.exports = {
  CanvasService,
  CHUNK_SIZE,
  getChunkKey
};
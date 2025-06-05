const { RedisService } = require('./redis');

class CanvasService {
  constructor() {
    this.redis = RedisService;
  }
  
  getPixelKey(x, y) {
    return `pixel:${x}:${y}`;
  }

  async placePixel(x, y, emoji, placedBy, username = null) {
    const pixelKey = this.getPixelKey(x, y);
    const timestamp = Date.now();

    const pixelData = {
      emoji,
      placedBy,
      username: username || null,
      timestamp
    };
    
    // Using a simple JSON string to store complex data in a hash field.
    await this.redis.hSet(pixelKey, 'data', JSON.stringify(pixelData));

    return pixelData;
  }

  async getPixel(x, y) {
    const pixelKey = this.getPixelKey(x, y);
    const data = await this.redis.hGet(pixelKey, 'data');

    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse pixel data:', data);
      return null;
    }
  }

  async getRegion(startX, startY, width, height) {
    const pixels = [];

    // This is not the most efficient way for large regions, but it's simple and reliable.
    // For a production app, a more optimized approach (like using Lua scripts or different data structures in Redis) would be better.
    for (let x = startX; x < startX + width; x++) {
      for (let y = startY; y < startY + height; y++) {
        const pixel = await this.getPixel(x, y);
        if (pixel) {
          pixels.push({ x, y, ...pixel });
        }
      }
    }

    return pixels;
  }
}

module.exports = { CanvasService: new CanvasService() };
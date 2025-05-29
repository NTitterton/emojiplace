class CanvasService {
  constructor(redisService) {
    this.redis = redisService;
  }
  
  getPixelKey(x, y) {
    return `pixel:${x}:${y}`;
  }
  
  getRegionKey(regionX, regionY) {
    return `region:${regionX}:${regionY}`;
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
    
    await this.redis.hSet(pixelKey, 'data', JSON.stringify(pixelData));
    
    // Also store in region for efficient querying
    const regionX = Math.floor(x / 100);
    const regionY = Math.floor(y / 100);
    const regionKey = this.getRegionKey(regionX, regionY);
    
    await this.redis.hSet(regionKey, `${x},${y}`, JSON.stringify(pixelData));
    
    return pixelData;
  }
  
  async getPixel(x, y) {
    const pixelKey = this.getPixelKey(x, y);
    const data = await this.redis.hGet(pixelKey, 'data');
    
    if (!data) return null;
    
    return JSON.parse(data);
  }
  
  async getRegion(startX, startY, width, height) {
    const pixels = [];
    
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
  
  async getRegionEfficient(regionX, regionY) {
    const regionKey = this.getRegionKey(regionX, regionY);
    const regionData = await this.redis.hGetAll(regionKey);
    
    const pixels = [];
    for (const [coords, data] of Object.entries(regionData)) {
      const [x, y] = coords.split(',').map(Number);
      const pixelData = JSON.parse(data);
      pixels.push({ x, y, ...pixelData });
    }
    
    return pixels;
  }
}

module.exports = { CanvasService }; 
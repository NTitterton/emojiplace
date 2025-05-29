class UserService {
  constructor(redisService) {
    this.redis = redisService;
    this.COOLDOWN_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
  }
  
  getUserKey(ip) {
    return `user:${ip}`;
  }
  
  getCooldownKey(ip) {
    return `cooldown:${ip}`;
  }
  
  async setUsername(ip, username) {
    const userKey = this.getUserKey(ip);
    await this.redis.hSet(userKey, 'username', username);
    await this.redis.hSet(userKey, 'lastSeen', Date.now());
  }
  
  async getUser(ip) {
    const userKey = this.getUserKey(ip);
    const userData = await this.redis.hGetAll(userKey);
    
    if (!userData || Object.keys(userData).length === 0) {
      return { ip, username: null, lastSeen: null };
    }
    
    return {
      ip,
      username: userData.username || null,
      lastSeen: userData.lastSeen ? parseInt(userData.lastSeen) : null
    };
  }
  
  async setPixelCooldown(ip) {
    const cooldownKey = this.getCooldownKey(ip);
    await this.redis.set(cooldownKey, Date.now(), { EX: 300 }); // 5 minutes
  }
  
  async canPlacePixel(ip) {
    const cooldownKey = this.getCooldownKey(ip);
    const cooldownData = await this.redis.get(cooldownKey);
    return !cooldownData;
  }
  
  async getCooldownEnd(ip) {
    const cooldownKey = this.getCooldownKey(ip);
    const cooldownStart = await this.redis.get(cooldownKey);
    
    if (!cooldownStart) return null;
    
    return parseInt(cooldownStart) + this.COOLDOWN_DURATION;
  }
}

module.exports = { UserService }; 
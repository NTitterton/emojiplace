const { RedisService } = require('./redis');

const COOLDOWN_SECONDS = 5 * 60; // 5 minutes
const USER_EXPIRATION_SECONDS = 24 * 60 * 60; // 24 hours
const ACTIVE_CONNECTIONS_KEY = 'active_ws_connections';

class UserService {
  constructor() {
    this.redis = RedisService;
  }
  
  getUserKey(ip) {
    return `user:${ip}`;
  }
  
  getCooldownKey(ip) {
    return `cooldown:${ip}`;
  }
  
  async getUserState(ip) {
    const userKey = this.getUserKey(ip);
    const cooldownKey = this.getCooldownKey(ip);

    let user = await this.redis.hGetAll(userKey);
    if (!user || Object.keys(user).length === 0) {
      user = { ip, lastSeen: Date.now() };
      await this.redis.hSet(userKey, 'ip', ip);
      await this.redis.expire(userKey, USER_EXPIRATION_SECONDS);
    }

    const cooldownEnd = await this.redis.get(cooldownKey);
    const canPlace = !cooldownEnd || Date.now() > parseInt(cooldownEnd, 10);

    return {
      user: {
        ...user,
        username: user.username || null,
      },
      canPlace,
      cooldownEnd: cooldownEnd ? parseInt(cooldownEnd, 10) : null,
    };
  }
  
  async setUsername(ip, username) {
    const userKey = this.getUserKey(ip);
    await this.redis.hSet(userKey, 'username', username);
    await this.redis.expire(userKey, USER_EXPIRATION_SECONDS); // Refresh expiration
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
  
  async setUserCooldown(ip) {
    const cooldownKey = this.getCooldownKey(ip);
    const cooldownEnd = Date.now() + COOLDOWN_SECONDS * 1000;
    await this.redis.set(cooldownKey, cooldownEnd.toString());
    await this.redis.expire(cooldownKey, COOLDOWN_SECONDS);
  }
  
  /**
   * Adds a WebSocket connection ID to the set of active connections.
   * @param {string} connectionId The WebSocket connection ID.
   */
  async addConnection(connectionId) {
    await this.redis.sAdd(ACTIVE_CONNECTIONS_KEY, connectionId);
  }

  /**
   * Removes a WebSocket connection ID from the set of active connections.
   * @param {string} connectionId The WebSocket connection ID.
   */
  async removeConnection(connectionId) {
    await this.redis.sRem(ACTIVE_CONNECTIONS_KEY, connectionId);
  }

  /**
   * Retrieves all active WebSocket connection IDs.
   * @returns {Promise<string[]>} A promise that resolves to an array of connection IDs.
   */
  async getAllConnections() {
    return this.redis.sMembers(ACTIVE_CONNECTIONS_KEY);
  }
}

module.exports = { UserService: new UserService() }; 
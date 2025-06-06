const { RedisService } = require('./redis');

const COOLDOWN_SECONDS = 5 * 60; // 5 minutes
const USER_EXPIRATION_SECONDS = 24 * 60 * 60; // 24 hours

// Constants for Redis keys
const ACTIVE_CONNECTIONS_KEY = 'connections:active';
const USER_ID_TO_CONN_ID_KEY_PREFIX = 'user:conn:';
const CONN_ID_TO_USER_ID_KEY_PREFIX = 'conn:user:';
const USER_DETAILS_KEY_PREFIX = 'user:details:';
const USER_COOLDOWN_KEY_PREFIX = 'user:cooldown:';

class UserService {
  // --- Connection Management ---
  
  async addConnection(userId, connectionId) {
    // Map userId to connectionId and vice versa
    await RedisService.set(`${USER_ID_TO_CONN_ID_KEY_PREFIX}${userId}`, connectionId, { EX: USER_EXPIRATION_SECONDS });
    await RedisService.set(`${CONN_ID_TO_USER_ID_KEY_PREFIX}${connectionId}`, userId, { EX: USER_EXPIRATION_SECONDS });
    await RedisService.sadd(ACTIVE_CONNECTIONS_KEY, connectionId);
  }

  async removeConnection(connectionId) {
    const userId = await this.getUserIdByConnection(connectionId);
    if (userId) {
      await RedisService.del(`${USER_ID_TO_CONN_ID_KEY_PREFIX}${userId}`);
    }
    await RedisService.del(`${CONN_ID_TO_USER_ID_KEY_PREFIX}${connectionId}`);
    await RedisService.srem(ACTIVE_CONNECTIONS_KEY, connectionId);
  }

  async getAllConnections() {
    return RedisService.smembers(ACTIVE_CONNECTIONS_KEY);
  }

  async getUserIdByConnection(connectionId) {
    return RedisService.get(`${CONN_ID_TO_USER_ID_KEY_PREFIX}${connectionId}`);
  }

  // --- User State Management ---

  async getUser(userId) {
    const userKey = `${USER_DETAILS_KEY_PREFIX}${userId}`;
    const user = await RedisService.hGetAll(userKey);
    if (!user || Object.keys(user).length === 0) {
      // Create a new user if one doesn't exist
      const newUser = { userId, username: 'Anonymous' };
      await RedisService.hSet(userKey, 'username', newUser.username);
      await RedisService.expire(userKey, USER_EXPIRATION_SECONDS);
      return newUser;
    }
    return { userId, ...user };
  }

  async setUsername(userId, username) {
    const userKey = `${USER_DETAILS_KEY_PREFIX}${userId}`;
    await RedisService.hSet(userKey, 'username', username);
    await RedisService.expire(userKey, USER_EXPIRATION_SECONDS); // Refresh expiration
  }

  // --- Cooldown Management ---

  async canPlacePixel(userId) {
    const cooldownKey = `${USER_COOLDOWN_KEY_PREFIX}${userId}`;
    const cooldownEnd = await RedisService.get(cooldownKey);
    return !cooldownEnd;
  }

  async updateUserCooldown(userId) {
    const cooldownKey = `${USER_COOLDOWN_KEY_PREFIX}${userId}`;
    // Set the cooldown with an expiration equal to the cooldown duration itself.
    // When the key expires, the user can place another pixel.
    await RedisService.set(cooldownKey, '1', { EX: COOLDOWN_SECONDS });
  }
}

module.exports = { UserService: new UserService() }; 
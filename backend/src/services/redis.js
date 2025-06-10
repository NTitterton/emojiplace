const Redis = require('ioredis');

let client;
let instance;

class RedisService {
  constructor() {
    if (instance) {
      return instance;
    }

    // In a serverless environment, connection management is tricky.
    // We want to reuse the connection across function invocations if possible.
    if (!client) {
      console.log('Creating new Redis client...');
      client = new Redis({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        // The 'tls' option is required if connecting to a Redis cluster
        // with in-transit encryption enabled.
        tls: {},
        // Set a long timeout and connect eagerly.
        connectTimeout: 30000, 
      });
    }
    
    this.client = client;
    instance = this;
  }

  static getInstance() {
    if (!instance) {
      instance = new RedisService();
    }
    return instance;
  }

  // Make methods on the instance, not static
  async get(key) {
    return this.client.get(key);
  }

  async mget(keys) {
    return this.client.mget(keys);
  }

  async set(key, value, options) {
    if (options && options.EX) {
      return this.client.set(key, value, 'EX', options.EX);
    }
    if (options && options.NX) {
        return this.client.set(key, value, 'NX');
    }
    return this.client.set(key, value);
  }

  async del(key) {
    return this.client.del(key);
  }

  async sadd(key, value) {
    return this.client.sadd(key, value);
  }
  
  async srem(key, value) {
    return this.client.srem(key, value);
  }

  async smembers(key) {
    return this.client.smembers(key);
  }

  async hGet(key, field) {
    return this.client.hget(key, field);
  }
  
  async hSet(key, field, value) {
    return this.client.hset(key, field, value);
  }

  async hGetAll(key) {
    return this.client.hgetall(key);
  }

  async expire(key, seconds) {
    return this.client.expire(key, seconds);
  }
}

// Export a single instance (singleton)
module.exports = { RedisService: RedisService.getInstance() }; 
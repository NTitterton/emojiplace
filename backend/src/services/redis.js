const redis = require('redis');

class RedisService {
  constructor() {
    if (!RedisService.instance) {
      this.client = redis.createClient({
        // The url property combines host and port.
        // It will use the environment variables we set in serverless.yml
        url: `rediss://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
        socket: {
          // Add connection timeout for the Lambda environment
          // Increased to 15s to account for VPC cold start + TLS handshake.
          connectTimeout: 15000, 
        }
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error', err);
      });
      
      // Don't connect in the constructor. Connect on demand.
      // this.client.connect().catch(console.error);
      RedisService.instance = this;
    }
    return RedisService.instance;
  }
  
  // This is a more robust connection handler for serverless environments.
  // It checks if the client is ready and connects if it's not.
  async ensureConnected() {
    if (!this.client.isReady) {
      console.log('Redis client is not ready, attempting to connect...');
      try {
        await this.client.connect();
        console.log('Redis client connected successfully.');
      } catch (err) {
        console.error('Failed to connect to Redis:', err);
        // Re-throw the error to be caught by the calling function
        throw new Error('Could not connect to Redis.');
      }
    }
    return this.client;
  }

  async get(key) {
    const client = await this.ensureConnected();
    return client.get(key);
  }

  async set(key, value, options) {
    const client = await this.ensureConnected();
    return client.set(key, value, options);
  }

  async hGet(key, field) {
    const client = await this.ensureConnected();
    return client.hGet(key, field);
  }
  
  async hSet(key, field, value) {
    const client = await this.ensureConnected();
    return client.hSet(key, field, value);
  }

  async hGetAll(key) {
    const client = await this.ensureConnected();
    return client.hGetAll(key);
  }

  async expire(key, seconds) {
    const client = await this.ensureConnected();
    return client.expire(key, seconds);
  }

  async sAdd(key, value) {
    const client = await this.ensureConnected();
    return client.sAdd(key, value);
  }

  async sRem(key, value) {
    const client = await this.ensureConnected();
    return client.sRem(key, value);
  }

  async sMembers(key) {
    const client = await this.ensureConnected();
    return client.sMembers(key);
  }
}

// Export a single instance to be used across the application
module.exports = { RedisService: new RedisService() }; 
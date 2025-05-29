const { createClient } = require('redis');

class RedisService {
  constructor() {
    this.client = null;
  }
  
  async connect() {
    if (this.client) return this.client;
    
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    this.client.on('error', (err) => console.error('Redis Client Error:', err));
    await this.client.connect();
    
    console.log('Connected to Redis');
    return this.client;
  }
  
  async getClient() {
    if (!this.client) {
      await this.connect();
    }
    return this.client;
  }
  
  async get(key) {
    const client = await this.getClient();
    return await client.get(key);
  }
  
  async set(key, value, options = {}) {
    const client = await this.getClient();
    return await client.set(key, value, options);
  }
  
  async hGet(key, field) {
    const client = await this.getClient();
    return await client.hGet(key, field);
  }
  
  async hSet(key, field, value) {
    const client = await this.getClient();
    return await client.hSet(key, field, value);
  }
  
  async hGetAll(key) {
    const client = await this.getClient();
    return await client.hGetAll(key);
  }
  
  async exists(key) {
    const client = await this.getClient();
    return await client.exists(key);
  }
  
  async expire(key, seconds) {
    const client = await this.getClient();
    return await client.expire(key, seconds);
  }
}

module.exports = { RedisService }; 
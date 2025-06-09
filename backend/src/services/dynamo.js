const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

class DynamoDbService {
  constructor() {
    this.tableName = process.env.DYNAMODB_PIXEL_TABLE;
  }

  // Create a composite key for the pixel
  getPixelKey(x, y) {
    return `${x}:${y}`;
  }

  // Get a single pixel from the database
  async getPixel(x, y) {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: { xy: this.getPixelKey(x, y) },
    });
    const { Item } = await docClient.send(command);
    return Item;
  }

  // Place or update a pixel in the database
  async placePixel(x, y, emoji, ip, username) {
    const pixelData = {
      xy: this.getPixelKey(x, y),
      x,
      y,
      emoji,
      ip,
      username,
      lastModified: new Date().toISOString(),
    };
    
    const command = new PutCommand({
      TableName: this.tableName,
      Item: pixelData,
    });
    
    await docClient.send(command);
    return pixelData;
  }

  // Get all pixels from the database.
  // This is a full table scan and should only be used to populate a cache.
  async getAllPixels() {
    const command = new ScanCommand({ TableName: this.tableName });
    const { Items } = await docClient.send(command);
    return Items || [];
  }

  async putPixel(pixel) {
    const command = new PutCommand({
      TableName: this.tableName,
      Item: pixel,
    });
    return docClient.send(command);
  }

  async batchWritePixels(pixels) {
    // DynamoDB BatchWriteItem has a limit of 25 items per request.
    const chunks = [];
    for (let i = 0; i < pixels.length; i += 25) {
      chunks.push(pixels.slice(i, i + 25));
    }

    for (const chunk of chunks) {
      const putRequests = chunk.map(pixel => ({
        PutRequest: {
          Item: pixel,
        },
      }));

      const command = new BatchWriteCommand({
        RequestItems: {
          [this.tableName]: putRequests,
        },
      });

      await docClient.send(command);
    }
  }
}

module.exports = { DynamoDbService: new DynamoDbService() }; 
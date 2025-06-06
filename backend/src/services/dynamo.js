const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

class DynamoDbService {
  constructor() {
    // Initialize the DynamoDB client
    const client = new DynamoDBClient({ region: process.env.AWS_REGION });
    // Use the document client for easier data manipulation
    this.docClient = DynamoDBDocumentClient.from(client);
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
    const { Item } = await this.docClient.send(command);
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
    
    await this.docClient.send(command);
    return pixelData;
  }

  // Get all pixels from the database.
  // This is a full table scan and should only be used to populate a cache.
  async getAllPixels() {
    const command = new ScanCommand({ TableName: this.tableName });
    const { Items } = await this.docClient.send(command);
    return Items || [];
  }
}

module.exports = { DynamoDbService: new DynamoDbService() }; 
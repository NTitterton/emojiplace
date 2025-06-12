const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, ScanCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const pixelTableName = process.env.DYNAMODB_PIXEL_TABLE;
const connectionsTableName = process.env.DYNAMODB_CONNECTIONS_TABLE;
const cooldownTableName = process.env.DYNAMODB_COOLDOWN_TABLE;

const { COOLDOWN_SECONDS } = require('../constants');

// PIXEL-RELATED FUNCTIONS

function getPixelKey(x, y) {
  return `${x}:${y}`;
}

async function getPixel(x, y) {
  const command = new GetCommand({
    TableName: pixelTableName,
    Key: { xy: getPixelKey(x, y) },
  });
  const { Item } = await docClient.send(command);
  return Item;
}

async function placePixel(x, y, emoji, ip, username) {
  const pixelData = {
    xy: getPixelKey(x, y),
    x,
    y,
    emoji,
    ip,
    username,
    lastModified: new Date().toISOString(),
  };
  
  const command = new PutCommand({
    TableName: pixelTableName,
    Item: pixelData,
  });
  
  await docClient.send(command);
  return pixelData;
}

async function getAllPixels() {
  const command = new ScanCommand({ TableName: pixelTableName });
  const { Items } = await docClient.send(command);
  return Items || [];
}

async function batchWritePixels(pixels) {
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
        [pixelTableName]: putRequests,
      },
    });

    await docClient.send(command);
  }
}

// CONNECTION-RELATED FUNCTIONS

async function addConnection(connectionId) {
  const command = new PutCommand({
    TableName: connectionsTableName,
    Item: { connectionId },
  });
  return docClient.send(command);
}

async function removeConnection(connectionId) {
  const command = new DeleteCommand({
    TableName: connectionsTableName,
    Key: { connectionId },
  });
  return docClient.send(command);
}

async function getAllConnections() {
  const command = new ScanCommand({
    TableName: connectionsTableName,
    ProjectionExpression: "connectionId",
  });
  const { Items } = await docClient.send(command);
  return Items || [];
}

// COOLDOWN-RELATED FUNCTIONS

/**
 * Checks if a user is currently on cooldown.
 * @param {string} username The username to check.
 * @returns {Promise<{canPlace: boolean, remaining: number}>} An object indicating if the user can place a pixel and the remaining cooldown time in seconds.
 */
async function checkUserCooldown(username) {
  const command = new GetCommand({
    TableName: cooldownTableName,
    Key: { username },
  });

  const { Item } = await docClient.send(command);

  if (!Item || !Item.cooldownEnd) {
    return { canPlace: true, remaining: 0 };
  }

  const now = Date.now();
  const cooldownEnd = new Date(Item.cooldownEnd).getTime();

  if (now >= cooldownEnd) {
    return { canPlace: true, remaining: 0 };
  }

  return { canPlace: false, remaining: Math.ceil((cooldownEnd - now) / 1000) };
}

/**
 * Sets a user's cooldown period.
 * @param {string} username The username to set the cooldown for.
 */
async function updateUserCooldown(username) {
  const now = new Date();
  const cooldownEnd = new Date(now.getTime() + COOLDOWN_SECONDS * 1000);

  const command = new PutCommand({
    TableName: cooldownTableName,
    Item: {
      username,
      cooldownEnd: cooldownEnd.toISOString(),
    },
  });

  return docClient.send(command);
}

module.exports = { 
  getPixelKey,
  getPixel,
  placePixel,
  getAllPixels,
  batchWritePixels,
  addConnection,
  removeConnection,
  getAllConnections,
  checkUserCooldown,
  updateUserCooldown,
}; 
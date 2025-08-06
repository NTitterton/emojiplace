const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, ScanCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const pixelTableName = process.env.DYNAMODB_PIXEL_TABLE;
const connectionsTableName = process.env.DYNAMODB_CONNECTIONS_TABLE;
const cooldownTableName = process.env.DYNAMODB_COOLDOWN_TABLE;
const agentMessagesTableName = process.env.DYNAMODB_AGENT_MESSAGES_TABLE;

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

// AGENT MESSAGES-RELATED FUNCTIONS

/**
 * Stores an agent message in DynamoDB for display in the frontend
 * @param {string} from - The agent ID that sent the message
 * @param {string} to - The agent ID that received the message  
 * @param {string} content - The message content
 */
async function storeAgentMessage(from, to, content) {
  const messageId = `${Date.now()}_${from}_${to}`;
  const timestamp = Date.now();
  
  const messageData = {
    messageId,
    timestamp,
    from,
    to,
    content,
    createdAt: new Date().toISOString(),
  };
  
  const command = new PutCommand({
    TableName: agentMessagesTableName,
    Item: messageData,
  });
  
  await docClient.send(command);
  return messageData;
}

/**
 * Gets the most recent agent messages for display
 * @param {number} limit - Maximum number of messages to retrieve (default: 10)
 * @returns {Promise<Array>} Array of recent messages
 */
async function getRecentAgentMessages(limit = 10) {
  // Query using the GSI to get messages ordered by timestamp
  const command = new ScanCommand({
    TableName: agentMessagesTableName,
    Limit: limit,
  });
  
  const { Items } = await docClient.send(command);
  
  // Sort by timestamp descending and return the most recent
  const sortedMessages = (Items || []).sort((a, b) => b.timestamp - a.timestamp);
  return sortedMessages.slice(0, limit);
}

/**
 * Cleans up old messages to keep the table size manageable
 * Keeps only the last 50 messages
 */
async function cleanupOldMessages() {
  const allMessages = await getAllAgentMessages();
  
  if (allMessages.length <= 50) {
    return; // No cleanup needed
  }
  
  // Sort by timestamp and keep only the 50 most recent
  const sortedMessages = allMessages.sort((a, b) => b.timestamp - a.timestamp);
  const messagesToDelete = sortedMessages.slice(50);
  
  // Delete old messages in batches
  for (const message of messagesToDelete) {
    const deleteCommand = new DeleteCommand({
      TableName: agentMessagesTableName,
      Key: { messageId: message.messageId },
    });
    
    await docClient.send(deleteCommand);
  }
}

async function getAllAgentMessages() {
  const command = new ScanCommand({ 
    TableName: agentMessagesTableName,
    ProjectionExpression: "messageId, #ts",
    ExpressionAttributeNames: {
      "#ts": "timestamp"
    }
  });
  const { Items } = await docClient.send(command);
  return Items || [];
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
  storeAgentMessage,
  getRecentAgentMessages,
  cleanupOldMessages,
}; 
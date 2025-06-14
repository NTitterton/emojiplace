const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const db = new DynamoDB();

const AGENT_MEMORY_TABLE = process.env.DYNAMODB_AGENT_MEMORY_TABLE;

async function getAgentState(agentId) {
  const params = {
    TableName: AGENT_MEMORY_TABLE,
    Key: marshall({ agentId }),
  };
  const { Item } = await db.getItem(params);
  return Item ? unmarshall(Item) : null;
}

async function updateAgentState(agentId, state) {
  const params = {
    TableName: AGENT_MEMORY_TABLE,
    Item: marshall({ agentId, ...state }),
  };
  await db.putItem(params);
}

module.exports = {
  getAgentState,
  updateAgentState,
}; 
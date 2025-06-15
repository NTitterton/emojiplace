const { CloudWatchLogs } = require('@aws-sdk/client-cloudwatch-logs');

const logs = new CloudWatchLogs();
const LOG_GROUP_NAME = process.env.AGENT_EVENT_LOG_GROUP;

async function logAgentEvent(eventType, eventData) {
  const logStreamName = new Date().toISOString().split('T')[0]; // One log stream per day
  const timestamp = Date.now();

  try {
    // Attempt to create the log group.
    await logs.createLogGroup({ logGroupName: LOG_GROUP_NAME });
  } catch (error) {
    // Ignore error if the log group already exists.
    if (error.name !== 'ResourceAlreadyExistsException') {
      console.error('Failed to create log group:', error);
      // We don't re-throw here, as we can still attempt to write to the log stream.
    }
  }

  try {
    // Attempt to create the log stream.
    await logs.createLogStream({ logGroupName: LOG_GROUP_NAME, logStreamName });
  } catch (error) {
    // Ignore error if the log stream already exists.
    if (error.name !== 'ResourceAlreadyExistsException') {
      console.error('Failed to create log stream:', error);
      throw error; // If we can't create the stream, we can't log.
    }
  }

  const logEvent = {
    logGroupName: LOG_GROUP_NAME,
    logStreamName,
    logEvents: [
      {
        timestamp,
        message: JSON.stringify({
          eventType,
          ...eventData,
        }),
      },
    ],
  };

  try {
    await logs.putLogEvents(logEvent);
  } catch (error) {
    console.error('Failed to put log events:', error);
    throw error;
  }
}

module.exports = { logAgentEvent }; 
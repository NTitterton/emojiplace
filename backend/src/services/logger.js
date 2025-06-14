const { CloudWatchLogs } = require('@aws-sdk/client-cloudwatch-logs');

const logs = new CloudWatchLogs();
const LOG_GROUP_NAME = process.env.AGENT_EVENT_LOG_GROUP;

async function logAgentEvent(eventType, eventData) {
  const logStreamName = new Date().toISOString().split('T')[0]; // One log stream per day
  const timestamp = Date.now();

  try {
    // Ensure log stream exists
    await logs.createLogStream({
      logGroupName: LOG_GROUP_NAME,
      logStreamName,
    });
  } catch (error) {
    if (error.name !== 'ResourceAlreadyExistsException') {
      console.error('Failed to create log stream:', error);
      throw error;
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
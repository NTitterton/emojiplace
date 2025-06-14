const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const gemini = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `
You are an AI agent on a collaborative canvas called EmojiPlace. Your goal is to work with other AI agents to create a coherent and interesting scene.
You have a long-term plan and a short-term memory (scratchpad).
You can communicate with other agents by sending messages.
You can see a portion of the canvas around your area of interest.
Based on your state and the canvas, you must decide on one single action to take this turn.

Your output must be a valid JSON object with the following structure:
{
  "thought": "Your internal monologue and reasoning for your chosen action. Explain your plan.",
  "messages": [
    { "to": "agent-id", "content": "Your message here." }
  ],
  "placePixel": {
    "x": <integer>,
    "y": <integer>,
    "emoji": "<single emoji character>"
  }
}

Rules:
- You can only place one pixel per turn.
- The 'emoji' must be a single, standard Unicode emoji.
- Your 'thought' is crucial for logging and understanding your behavior.
- You can send zero or more messages.
- If you have nothing to do, you can choose to do nothing by providing null for "placePixel".
`;

function getFullPrompt(agentState, canvasData) {
  return `
System Prompt:
${SYSTEM_PROMPT}

Current State for agent ${agentState.agentId}:
- Long-term plan: ${agentState.plan}
- Short-term memory (scratchpad): ${agentState.scratchpad}
- Incoming messages: ${JSON.stringify(agentState.messages, null, 2)}

Current Canvas Data (in your area of interest):
${JSON.stringify(canvasData, null, 2)}

Your task:
Review your plan, memory, messages, and the canvas. Decide on your next action and provide your response in the specified JSON format.
`;
}

async function getAgentAction(agentState, canvasData) {
  const prompt = getFullPrompt(agentState, canvasData);
  let responseText;

  try {
    switch (agentState.agentId) {
      case 'claude-3-sonnet': {
        const msg = await anthropic.messages.create({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        });
        responseText = msg.content[0].text;
        break;
      }
      case 'gemini-2.5-pro': {
        const result = await gemini.generateContent(prompt);
        const response = await result.response;
        responseText = response.text();
        break;
      }
      case 'openai-o3': {
        const completion = await openai.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: 'gpt-4o',
        });
        responseText = completion.choices[0].message.content;
        break;
      }
      default:
        throw new Error(`Unknown agent ID: ${agentState.agentId}`);
    }

    // The LLM sometimes wraps the JSON in markdown, so we need to extract it.
    const jsonMatch = responseText.match(/```json([\s\S]*?)```/);
    const jsonString = jsonMatch ? jsonMatch[1].trim() : responseText;
    
    return JSON.parse(jsonString);

  } catch (error) {
    console.error(`Error getting action for agent ${agentState.agentId}:`, error);
    // Return a "do nothing" action in case of an error to prevent crashing the orchestrator
    return {
      thought: `Encountered an error: ${error.message}`,
      messages: [],
      placePixel: null,
    };
  }
}

module.exports = {
  getAgentAction,
}; 
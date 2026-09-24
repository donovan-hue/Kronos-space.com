const { GoogleGenAI } = require("@google/genai");
const {
  getAIProviderConfig
} = require("../../../config/aiProviders");

let gemini = null;
const MAX_MODEL_MESSAGE_LENGTH = 4000;
const MAX_MODEL_PROMPT_LENGTH = 24000;
const MAX_OUTPUT_TOKENS = 2048;

function getGemini() {
  if (!gemini) {
    const provider = getAIProviderConfig("chat");

    if (!provider.configured) {
      throw new Error("GEMINI_API_KEY_NOT_CONFIGURED");
    }

    gemini = new GoogleGenAI({
      apiKey: provider.apiKey,
      // HttpOptions del SDK: milisegundos y total de intentos (incluye el
      // original). No dejar retries implícitos en una generación facturable.
      httpOptions: { timeout: 45_000, retryOptions: { attempts: 1 } }
    });
  }

  return gemini;
}

async function generateResponse({
  message,
  history = [],
  model
}) {
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("MESSAGE_REQUIRED");
  }
  const normalizedMessage = message.trim();
  if (normalizedMessage.length > MAX_MODEL_MESSAGE_LENGTH) {
    throw new Error("MESSAGE_TOO_LONG");
  }

  const client = getGemini();
  const provider = getAIProviderConfig("chat");
  const selectedModel = model || provider.model;

  const normalizedHistory = Array.isArray(history)
    ? history.filter(
        item =>
          item &&
          ["user", "assistant", "system"].includes(item.role) &&
          typeof item.content === "string" &&
          item.content.trim()
      )
    : [];

  const systemMessages = normalizedHistory
    .filter(item => item.role === "system")
    .map(item => item.content.trim());

  const conversation = normalizedHistory
    .filter(item => item.role !== "system")
    .map(item => {
      const role =
        item.role === "assistant"
          ? "Modelo"
          : "Usuario";

      return `${role}: ${item.content.trim()}`;
    });

  conversation.push(`Usuario: ${normalizedMessage}`);

  const prompt = [
    systemMessages.length
      ? `INSTRUCCIONES DEL SISTEMA:\n${systemMessages.join("\n\n")}`
      : "",
    conversation.join("\n\n"),
    "Modelo:"
  ]
    .filter(Boolean)
    .join("\n\n");

  if (prompt.length > MAX_MODEL_PROMPT_LENGTH) {
    throw new Error("PROMPT_TOO_LONG");
  }

  const response = await client.models.generateContent({
    model: selectedModel,
    contents: prompt,
    config: { maxOutputTokens: MAX_OUTPUT_TOKENS }
  });

  return {
    text: response.text || "",
    model: selectedModel,
    usage: response.usageMetadata || null
  };
}

module.exports = {
  generateResponse
};

const { generateResponse } = require("./model.service");
const { normalizePersonality, personalitySystemPrompt } = require("./personality.service");

const MAX_CHAT_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_ITEMS = 30;
const MAX_HISTORY_ITEM_LENGTH = 4000;
const MAX_HISTORY_LENGTH = 16000;
const HISTORY_ROLES = new Set(["user", "assistant"]);

function normalizeChatHistory(history) {
  if (history === undefined) return [];
  if (!Array.isArray(history)) throw new Error("HISTORY_INVALID");
  if (history.length > MAX_HISTORY_ITEMS) throw new Error("HISTORY_TOO_LONG");

  const normalized = [];
  let totalLength = 0;
  for (const item of history) {
    // The HTTP route rejects malformed entries before reaching the provider;
    // this second boundary keeps direct service callers safe as well.
    if (!item || !HISTORY_ROLES.has(item.role) || typeof item.content !== "string") {
      throw new Error("HISTORY_INVALID");
    }
    const content = item.content.trim();
    if (!content) throw new Error("HISTORY_INVALID");
    if (content.length > MAX_HISTORY_ITEM_LENGTH) throw new Error("HISTORY_ITEM_TOO_LONG");
    totalLength += content.length;
    if (totalLength > MAX_HISTORY_LENGTH) throw new Error("HISTORY_TOO_LONG");
    normalized.push({ role: item.role, content });
  }
  return normalized;
}

async function chat({ message, history = [], personality = "normal", language = "es-MX" }) {
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("MESSAGE_REQUIRED");
  }
  const normalizedMessage = message.trim();
  if (normalizedMessage.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new Error("MESSAGE_TOO_LONG");
  }

  const selectedPersonality = normalizePersonality(personality);
  const normalizedHistory = normalizeChatHistory(history);

  const response = await generateResponse({
    message: normalizedMessage,
    history: [
      {
        role: "system",
        content: personalitySystemPrompt(selectedPersonality, language)
      },
      ...normalizedHistory
    ]
  });

  return { ...response, personality: selectedPersonality };
}

module.exports = {
  chat,
  normalizeChatHistory,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_HISTORY_ITEMS,
  MAX_HISTORY_ITEM_LENGTH,
  MAX_HISTORY_LENGTH
};

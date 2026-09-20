const { generateResponse } = require("./model.service");
const { normalizePersonality, personalitySystemPrompt } = require("./personality.service");

async function chat({ message, history = [], personality = "normal", language = "es-MX" }) {
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("MESSAGE_REQUIRED");
  }

  const selectedPersonality = normalizePersonality(personality);
  const normalizedHistory = [
    {
      role: "system",
      content: personalitySystemPrompt(selectedPersonality, language)
    },
    ...history
      .filter(
        item =>
          item &&
          ["user", "assistant"].includes(item.role) &&
          typeof item.content === "string"
      )
      .map(item => ({
        role: item.role,
        content: item.content
      }))
  ];

  const response = await generateResponse({
    message: message.trim(),
    history: normalizedHistory
  });

  return { ...response, personality: selectedPersonality };
}

module.exports = { chat };

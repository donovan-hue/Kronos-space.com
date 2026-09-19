const { generateResponse } = require("./model.service");

async function chat({
  message,
  history = [],
  system = "Eres Kronos AI, un asistente inteligente integrado en Kronos Space."
}) {
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("MESSAGE_REQUIRED");
  }

  const normalizedHistory = [
    {
      role: "system",
      content: system
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

  return generateResponse({
    message: message.trim(),
    history: normalizedHistory
  });
}

module.exports = {
  chat
};

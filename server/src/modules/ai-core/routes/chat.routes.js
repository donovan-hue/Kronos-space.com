const express = require("express");
const { chat, MAX_CHAT_MESSAGE_LENGTH, MAX_HISTORY_ITEMS, MAX_HISTORY_ITEM_LENGTH, MAX_HISTORY_LENGTH } = require("../services/chat.service");
const auth = require("../../../middleware/auth");
const { requireUser } = require("../../../middleware/permissions");
const aiLimiter = require("../../../middleware/aiLimiter");
const User = require("../../users/User");
const {
  getAIErrorResponse
} = require("../../../middleware/aiError");

const router = express.Router();
const HISTORY_ROLES = new Set(["user", "assistant"]);

function validateChatPayload(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "El cuerpo de la solicitud no es válido", code: "INVALID_CHAT_BODY" };
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return { error: "El mensaje es obligatorio", code: "MESSAGE_REQUIRED" };
  if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
    return {
      error: `El mensaje no puede superar ${MAX_CHAT_MESSAGE_LENGTH} caracteres`,
      code: "MESSAGE_TOO_LONG"
    };
  }

  const history = body.history === undefined ? [] : body.history;
  if (!Array.isArray(history)) {
    return { error: "El historial debe ser una lista", code: "HISTORY_INVALID" };
  }
  if (history.length > MAX_HISTORY_ITEMS) {
    return {
      error: `El historial no puede superar ${MAX_HISTORY_ITEMS} mensajes`,
      code: "HISTORY_TOO_LONG"
    };
  }

  let historyLength = 0;
  for (const item of history) {
    if (!item || !HISTORY_ROLES.has(item.role) || typeof item.content !== "string") {
      return { error: "Cada entrada del historial debe tener role y content válidos", code: "HISTORY_INVALID" };
    }
    const content = item.content.trim();
    if (!content) return { error: "El historial contiene un mensaje vacío", code: "HISTORY_INVALID" };
    if (content.length > MAX_HISTORY_ITEM_LENGTH) {
      return {
        error: `Cada mensaje del historial no puede superar ${MAX_HISTORY_ITEM_LENGTH} caracteres`,
        code: "HISTORY_ITEM_TOO_LONG"
      };
    }
    historyLength += content.length;
    if (historyLength > MAX_HISTORY_LENGTH) {
      return {
        error: `El historial no puede superar ${MAX_HISTORY_LENGTH} caracteres`,
        code: "HISTORY_TOO_LONG"
      };
    }
  }

  return {
    value: {
      message,
      history: history.map((item) => ({ role: item.role, content: item.content.trim() }))
    }
  };
}

router.post("/chat", auth, requireUser, aiLimiter, async (req, res) => {
  const parsed = validateChatPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ success: false, error: parsed.error, code: parsed.code });
  }

  try {
    const { message, history } = parsed.value;
    const user = await User.findById(req.user.id)
      .select("preferences.aiPersonality preferences.language")
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado", code: "USER_NOT_FOUND" });
    }

    const result = await chat({
      message,
      history,
      personality: user.preferences?.aiPersonality,
      language: user.preferences?.language
    });

    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("Kronos AI chat error:", error);

    const aiError = getAIErrorResponse(error);

    return res.status(aiError.status).json({
      success: false,
      error: aiError.message,
      code: aiError.code
    });
  }
});

module.exports = router;
module.exports.validateChatPayload = validateChatPayload;

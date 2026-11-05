const express = require("express");
const mongoose = require("mongoose");
const { chat, MAX_CHAT_MESSAGE_LENGTH, MAX_HISTORY_ITEMS, MAX_HISTORY_ITEM_LENGTH, MAX_HISTORY_LENGTH } = require("../services/chat.service");
const ChatConversation = require("../ChatConversation");
const { recordUsage, monthlyUsage } = require("../aiUsage.service");
const { isFeatureEnabled } = require("../../../config/featureFlags");

const isAiComposerEnabled = () => isFeatureEnabled("aiComposer");
const auth = require("../../../middleware/auth");
const { requireUser } = require("../../../middleware/permissions");
const { aiLimiterFor } = require("../../../middleware/aiLimiter");
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

router.post("/chat", auth, requireUser, aiLimiterFor("chat"), async (req, res) => {
  const parsed = validateChatPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ success: false, error: parsed.error, code: parsed.code });
  }

  // `aiComposer` protege SOLO la reescritura suelta del compositor (la llamada
  // sin `conversationId`). El chat conversacional comparte ruta y no debe
  // apagarse con ese flag: son dos funciones distintas detrás del mismo POST.
  if (!req.body?.conversationId && !isAiComposerEnabled()) {
    return res.status(404).json({
      error: "Esta función no está disponible.",
      code: "FEATURE_DISABLED",
      flag: "aiComposer"
    });
  }

  try {
    const { message, history } = parsed.value;
    const user = await User.findById(req.user.id)
      .select("preferences.aiPersonality preferences.language")
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado", code: "USER_NOT_FOUND" });
    }

    // La conversación es opcional: con `conversationId` se escribe en el hilo
    // y el historial sale de la base; sin él la llamada sigue siendo suelta
    // (el compositor que reescribe un borrador no quiere un hilo).
    let conversation = null;
    if (req.body?.conversationId !== undefined) {
      if (!validId(req.body.conversationId)) {
        return res.status(400).json({ success: false, error: "ID de conversación inválido", code: "CONVERSATION_INVALID" });
      }
      conversation = await ChatConversation.findOne({
        _id: req.body.conversationId,
        user: req.user.id
      });
      if (!conversation) {
        return res.status(404).json({ success: false, error: "Conversación no encontrada", code: "CONVERSATION_NOT_FOUND" });
      }
    }

    if (conversation && conversation.messages.length >= ChatConversation.MAX_MESSAGES) {
      return res.status(409).json({
        success: false,
        error: "Esta conversación llegó a su límite. Abre una nueva para seguir.",
        code: "CONVERSATION_FULL"
      });
    }

    // Con hilo persistente, el historial que manda el cliente se ignora: la
    // fuente de verdad es la base, y así no se puede inyectar contexto ajeno.
    const effectiveHistory = conversation
      ? conversation.messages
        .filter((item) => item.estado === "ok" && item.content)
        .slice(-MAX_HISTORY_ITEMS)
        .map((item) => ({ role: item.role, content: item.content }))
      : history;

    const personality = conversation?.personality || user.preferences?.aiPersonality;
    const language = conversation?.language || user.preferences?.language;

    let result;
    let persisted = null;
    try {
      result = await chat({ message, history: effectiveHistory, personality, language });
    } catch (error) {
      // El mensaje del usuario no se pierde por un fallo del proveedor: queda
      // guardado junto con el error, para leerlo y reintentar sin reescribirlo.
      if (conversation) {
        conversation.messages.push({ role: "user", content: message });
        conversation.messages.push({
          role: "assistant",
          content: "",
          estado: "error",
          error: String(getAIErrorResponse(error).message || "Error del proveedor").slice(0, 500)
        });
        if (!conversation.title) conversation.title = titleFrom(message);
        conversation.lastMessageAt = new Date();
        await conversation.save();
        persisted = { conversationId: String(conversation._id) };
      }
      throw error;
    }

    if (conversation) {
      conversation.messages.push({ role: "user", content: message });
      conversation.messages.push({
        role: "assistant",
        content: typeof result.text === "string" ? result.text : "",
        model: typeof result.model === "string" ? result.model : "",
        estado: "ok"
      });
      if (!conversation.title) conversation.title = titleFrom(message);
      conversation.lastMessageAt = new Date();
      await conversation.save();
      persisted = { conversationId: String(conversation._id), conversation: presentConversation(conversation.toObject()) };
    }

    // Consumo imputado a la cuenta: un mensaje de chat es una operación. Se
    // anota solo cuando el proveedor respondió; el fallo se anota en el catch.
    await recordUsage({ userId: req.user.id, capability: "chat", units: 1 });

    return res.json({
      success: true,
      ...result,
      ...(persisted || {})
    });
  } catch (error) {
    console.error("Kronos AI chat error:", error);

    // Una llamada que el proveedor rechazó no consume cuota de producto, pero
    // queda en el libro como error para poder ver los fallos del mes.
    await recordUsage({
      userId: req.user?.id,
      capability: "chat",
      units: 0,
      estado: "error",
      error: error?.message || "CHAT_ERROR"
    });

    const aiError = getAIErrorResponse(error);

    return res.status(aiError.status).json({
      success: false,
      error: aiError.message,
      code: aiError.code
    });
  }
});

/* ============================================================
   Conversaciones persistentes

   El chat existía solo como una llamada sin memoria: el cliente mandaba el
   historial en cada petición y al cerrar la pestaña la conversación se
   perdía. Estas rutas la guardan y permiten seguir donde se quedó.

   La respuesta de `POST /api/ai/chat` con `conversationId` escribe en el
   hilo; sin ese campo el comportamiento anterior no cambia (sigue siendo una
   llamada suelta, la que usa el compositor para reescribir un borrador).
   ============================================================ */

const CONVERSATION_LIST_LIMIT = 50;
const MAX_TITLE_LENGTH = 120;

function validId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/** Proyección de la conversación para la bandeja: sin los mensajes. */
function presentConversation(conversation) {
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const last = messages[messages.length - 1] || null;
  return {
    _id: conversation._id,
    title: conversation.title || "",
    personality: conversation.personality,
    language: conversation.language,
    messagesCount: messages.length,
    lastMessageAt: conversation.lastMessageAt,
    preview: last ? String(last.content || "").slice(0, 160) : "",
    lastRole: last ? last.role : ""
  };
}

function presentMessage(message) {
  return {
    _id: message._id,
    role: message.role,
    content: message.content || "",
    estado: message.estado || "ok",
    error: message.error || "",
    model: message.model || "",
    createdAt: message.createdAt
  };
}

/** Título por defecto: el primer mensaje del usuario, recortado. */
function titleFrom(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > MAX_TITLE_LENGTH ? `${clean.slice(0, MAX_TITLE_LENGTH - 1)}…` : clean;
}

router.get("/chat/conversations", auth, requireUser, async (req, res) => {
  try {
    const conversations = await ChatConversation.find({ user: req.user.id })
      .select("title personality language lastMessageAt messages.role messages.content")
      .sort({ lastMessageAt: -1 })
      .limit(CONVERSATION_LIST_LIMIT)
      .lean();

    return res.json({ conversations: conversations.map(presentConversation) });
  } catch (error) {
    console.error("CHAT_LIST_ERROR:", error);
    return res.status(500).json({ success: false, error: "No se pudieron cargar tus conversaciones" });
  }
});

router.post("/chat/conversations", auth, requireUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("preferences.aiPersonality preferences.language")
      .lean();
    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado", code: "USER_NOT_FOUND" });
    }

    const title = typeof req.body?.title === "string" ? titleFrom(req.body.title) : "";

    const conversation = await ChatConversation.create({
      user: req.user.id,
      title,
      personality: user.preferences?.aiPersonality || "normal",
      language: user.preferences?.language || "es-MX"
    });

    return res.status(201).json({ conversation: presentConversation(conversation.toObject()) });
  } catch (error) {
    console.error("CHAT_CREATE_ERROR:", error);
    return res.status(500).json({ success: false, error: "No se pudo crear la conversación" });
  }
});

router.get("/chat/conversations/:id", auth, requireUser, async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ success: false, error: "ID de conversación inválido" });
    }

    const conversation = await ChatConversation.findOne({
      _id: req.params.id,
      user: req.user.id
    }).lean();

    // 404 también para conversaciones ajenas: el id no revela que existan.
    if (!conversation) {
      return res.status(404).json({ success: false, error: "Conversación no encontrada" });
    }

    return res.json({
      conversation: presentConversation(conversation),
      messages: (conversation.messages || []).map(presentMessage)
    });
  } catch (error) {
    console.error("CHAT_GET_ERROR:", error);
    return res.status(500).json({ success: false, error: "No se pudo abrir la conversación" });
  }
});

router.patch("/chat/conversations/:id", auth, requireUser, async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ success: false, error: "ID de conversación inválido" });
    }

    if (typeof req.body?.title !== "string") {
      return res.status(400).json({ success: false, error: "Indica el nuevo título" });
    }

    const title = titleFrom(req.body.title);

    const conversation = await ChatConversation.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { $set: { title } },
      { new: true }
    ).lean();

    if (!conversation) {
      return res.status(404).json({ success: false, error: "Conversación no encontrada" });
    }

    return res.json({ conversation: presentConversation(conversation) });
  } catch (error) {
    console.error("CHAT_RENAME_ERROR:", error);
    return res.status(500).json({ success: false, error: "No se pudo renombrar la conversación" });
  }
});

router.delete("/chat/conversations/:id", auth, requireUser, async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ success: false, error: "ID de conversación inválido" });
    }

    const result = await ChatConversation.deleteOne({ _id: req.params.id, user: req.user.id });
    if (!result.deletedCount) {
      return res.status(404).json({ success: false, error: "Conversación no encontrada" });
    }

    return res.json({ deleted: true });
  } catch (error) {
    console.error("CHAT_DELETE_ERROR:", error);
    return res.status(500).json({ success: false, error: "No se pudo eliminar la conversación" });
  }
});

/**
 * GET /api/ai/usage — consumo del mes por capacidad.
 *
 * Es la respuesta a «cuánto he usado» que antes no existía: el limitador dice
 * cuántos intentos quedan en 15 minutos, no lo que la cuenta lleva gastado.
 */
router.get("/usage", auth, requireUser, async (req, res) => {
  try {
    const capabilities = await monthlyUsage(req.user.id);
    return res.json({
      desde: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString(),
      capacidades: capabilities
    });
  } catch (error) {
    console.error("AI_USAGE_SUMMARY_ERROR:", error);
    return res.status(500).json({ error: "No se pudo leer el consumo de IA" });
  }
});

module.exports = router;
module.exports.validateChatPayload = validateChatPayload;
module.exports.titleFrom = titleFrom;

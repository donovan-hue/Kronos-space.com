const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { chat, MAX_CHAT_MESSAGE_LENGTH, MAX_HISTORY_ITEMS, MAX_HISTORY_ITEM_LENGTH, MAX_HISTORY_LENGTH } = require("../services/chat.service");
const ChatConversation = require("../ChatConversation");
const { recordUsage, monthlyUsage } = require("../aiUsage.service");
const { isFeatureEnabled } = require("../../../config/featureFlags");

const isAiComposerEnabled = () => isFeatureEnabled("aiComposer");
const auth = require("../../../middleware/auth");
const { requireUser } = require("../../../middleware/permissions");
const { aiLimiterFor } = require("../../../middleware/aiLimiter");
const cuotaIA = require("../../../middleware/cuotaIA");
const { handleChatUpload } = require("../../../middleware/upload");
const { saveBuffer, respondUploadError, SUBDIRS } = require("../../../config/storage");
const User = require("../../users/User");
const {
  getAIErrorResponse
} = require("../../../middleware/aiError");

const router = express.Router();
const HISTORY_ROLES = new Set(["user", "assistant"]);

/**
 * Normaliza los adjuntos que llegan en el mensaje.
 *
 * Solo se aceptan referencias del almacén propio (`/uploads/chat/…`): una URL
 * externa convertiría el chat en un proxy para que el proveedor cargue lo que
 * el cliente quiera. Lo que no cumple se descarta con su motivo en vez de
 * romper el envío entero; el mensaje de texto sigue valiendo.
 */
function normalizarAdjuntos(raw) {
  if (raw === undefined) return { adjuntos: [], descartados: [] };
  if (!Array.isArray(raw)) {
    return { error: "Los adjuntos deben ser una lista", code: "ATTACHMENTS_INVALID" };
  }
  if (raw.length > ChatConversation.MAX_ADJUNTOS) {
    return {
      error: `Un mensaje puede llevar hasta ${ChatConversation.MAX_ADJUNTOS} adjuntos`,
      code: "ATTACHMENTS_TOO_MANY"
    };
  }

  const adjuntos = [];
  const descartados = [];

  for (const item of raw) {
    const url = typeof item?.url === "string" ? item.url.trim() : "";
    const nombre = String(item?.nombre || "").trim().slice(0, 200);
    const mimeType = String(item?.mimeType || "").trim().slice(0, 100);

    if (!url.startsWith("/uploads/chat/")) {
      descartados.push({ nombre, motivo: "El adjunto no está en el almacén del chat." });
      continue;
    }

    const esImagen = mimeType.startsWith("image/");
    adjuntos.push({
      url,
      nombre,
      mimeType,
      size: Math.max(0, Number(item?.size) || 0),
      kind: esImagen ? "image" : "text"
    });
  }

  return { adjuntos, descartados };
}

/**
 * Texto que el modelo puede leer de los adjuntos de texto.
 *
 * Las imágenes no se transcriben (no hay modelo de visión cableado): se dice
 * que llegó un archivo y su nombre, en vez de fingir que Kairos la vio. El
 * texto sí se incluye, recortado, porque es información real.
 */
const MAX_TEXTO_ADJUNTO = 4000;
// Raíz de los adjuntos, tomada del almacenamiento (no una ruta inventada aquí):
// si mañana cambia la carpeta, cambia en un solo sitio.
const UPLOADS_ROOT = path.resolve(SUBDIRS.chat, "..");

async function contextoDeAdjuntos(adjuntos) {
  const partes = [];
  for (const adjunto of adjuntos) {
    if (adjunto.kind === "image") {
      partes.push(`[Adjunto de imagen: ${adjunto.nombre || "sin nombre"} (${adjunto.mimeType})]`);
      continue;
    }
    try {
      const ruta = path.join(UPLOADS_ROOT, adjunto.url.replace(/^\/uploads\//, ""));
      // Nunca fuera de uploads, aunque la URL llegue manipulada.
      if (!ruta.startsWith(UPLOADS_ROOT)) continue;
      const contenido = await fs.promises.readFile(ruta, "utf8");
      partes.push(
        `[Archivo adjunto: ${adjunto.nombre || "sin nombre"}]\n${contenido.slice(0, MAX_TEXTO_ADJUNTO)}`
      );
    } catch {
      partes.push(`[Archivo adjunto: ${adjunto.nombre || "sin nombre"} (no se pudo leer)]`);
    }
  }
  return partes.join("\n\n");
}

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

/**
 * POST /api/ai/chat/attachments — sube UN adjunto y devuelve su referencia.
 *
 * El archivo se sube aparte del mensaje a propósito: así el compositor puede
 * mostrar la miniatura y quitar el adjunto antes de enviar, y el envío queda
 * como un JSON normal en vez de un multipart que mezcle texto y binarios.
 * La referencia se valida al enviar (ver `normalizarAdjuntos`), no aquí, para
 * que un cliente no pueda inventarse una URL externa.
 */
router.post(
  "/chat/attachments",
  auth,
  requireUser,
  aiLimiterFor("chat"),
  handleChatUpload("adjunto"),
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: "No se recibió ningún archivo" });
      }

      const guardado = await saveBuffer({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
        subdir: "chat",
        ownerId: req.user?.id || null
      });

      if (!guardado?.url?.startsWith("/uploads/chat/")) {
        return res.status(500).json({ error: "El adjunto debe guardarse en el almacén propio" });
      }

      const esImagen = String(req.file.mimetype || "").startsWith("image/");
      return res.status(201).json({
        adjunto: {
          url: guardado.url,
          nombre: String(req.file.originalname || "").slice(0, 200),
          mimeType: req.file.mimetype,
          size: guardado.size,
          kind: esImagen ? "image" : "text"
        }
      });
    } catch (error) {
      console.error("CHAT_ATTACHMENT_ERROR:", error);
      return respondUploadError(res, error, "No se pudo guardar el adjunto");
    }
  }
);

router.post("/chat", auth, requireUser, aiLimiterFor("chat"), cuotaIA("chat"), async (req, res) => {
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

  const adjuntos = normalizarAdjuntos(req.body?.adjuntos);
  if (adjuntos.error) {
    return res.status(400).json({ success: false, error: adjuntos.error, code: adjuntos.code });
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

    // El proveedor no ve archivos: ve el texto del mensaje. Los adjuntos de
    // texto se incluyen aquí, recortados; las imágenes se anuncian por nombre
    // en vez de fingir que Kairos las miró. Un mensaje puede ser solo adjunto.
    const contextoAdjuntos = adjuntos.adjuntos.length
      ? await contextoDeAdjuntos(adjuntos.adjuntos)
      : "";
    const messageParaModelo = contextoAdjuntos
      ? `${message}\n\n${contextoAdjuntos}`.trim()
      : message;

    let result;
    let persisted = null;
    try {
      result = await chat({ message: messageParaModelo, history: effectiveHistory, personality, language });
    } catch (error) {
      // El mensaje del usuario no se pierde por un fallo del proveedor: queda
      // guardado junto con el error, para leerlo y reintentar sin reescribirlo.
      if (conversation) {
        conversation.messages.push({ role: "user", content: message, adjuntos: adjuntos.adjuntos });
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
      conversation.messages.push({ role: "user", content: message, adjuntos: adjuntos.adjuntos });
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
      ...(persisted || {}),
      // Un adjunto descartado se dice: el usuario creyó mandarlo.
      ...(adjuntos.descartados.length ? { adjuntosDescartados: adjuntos.descartados } : {})
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
    preview: last
      ? String(last.content || "").slice(0, 160) ||
        (Array.isArray(last.adjuntos) && last.adjuntos.length
          ? `📎 ${last.adjuntos.length === 1 ? (last.adjuntos[0].nombre || "adjunto") : `${last.adjuntos.length} adjuntos`}`
          : "")
      : "",
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
    // Sin esto, al recargar el hilo los adjuntos desaparecían de la pantalla
    // aunque siguieran guardados.
    adjuntos: (Array.isArray(message.adjuntos) ? message.adjuntos : []).map((adjunto) => ({
      url: adjunto.url,
      nombre: adjunto.nombre || "",
      mimeType: adjunto.mimeType || "",
      size: Number(adjunto.size) || 0,
      kind: adjunto.kind || "image"
    })),
    createdAt: message.createdAt
  };
}

/** Título por defecto: el primer mensaje del usuario, recortado. */
function titleFrom(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > MAX_TITLE_LENGTH ? `${clean.slice(0, MAX_TITLE_LENGTH - 1)}…` : clean;
}

/**
 * GET /api/ai/chat/conversations?page=1&limit=50&q=…
 *
 * Antes devolvía **siempre** las 50 más recientes y cortaba en silencio: un
 * hilo de hace dos meses era inalcanzable, y la lista no decía que hubiera más.
 * Ahora pagina con `page`/`limit`, declara `total` y `hayMas`, y acepta `q`
 * para buscar por título sin recorrer la lista a ojo.
 */
router.get("/chat/conversations", auth, requireUser, async (req, res) => {
  try {
    const pagina = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limite = Math.min(
      CONVERSATION_LIST_LIMIT,
      Math.max(1, Number.parseInt(req.query.limit, 10) || CONVERSATION_LIST_LIMIT)
    );
    const consulta = String(req.query.q || "").trim().slice(0, 80);

    const filtro = { user: req.user.id };
    if (consulta) {
      // Igual que en la búsqueda del hilo: el patrón se escapa para que un
      // `.*` del usuario no se convierta en comodín.
      filtro.title = new RegExp(escaparRegex(consulta), "i");
    }

    const [conversations, total] = await Promise.all([
      ChatConversation.find(filtro)
        .select("title personality language lastMessageAt messages.role messages.content")
        .sort({ lastMessageAt: -1 })
        .skip((pagina - 1) * limite)
        .limit(limite)
        .lean(),
      ChatConversation.countDocuments(filtro)
    ]);

    return res.json({
      conversations: conversations.map(presentConversation),
      total,
      page: pagina,
      limit: limite,
      hayMas: pagina * limite < total
    });
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

/**
 * POST /api/ai/chat/conversations/:id/retry
 *
 * Reintenta la última respuesta que falló. Sin esto, un fallo del proveedor
 * dejaba el hilo con un mensaje en `estado: "error"` y la única salida era
 * reescribir el mensaje a mano —que además lo duplicaba en la base—.
 *
 * Reglas:
 * - Solo se reintenta el **último** mensaje del hilo y solo si es un error:
 *   reintentar algo que ya respondió gastaría cuota para decir lo mismo.
 * - No se añade otro mensaje del usuario: ya está guardado y sigue siendo el
 *   mismo turno.
 * - La respuesta se escribe en el hueco del error en vez de crear otro, para
 *   que el hilo no acumule intentos fallidos.
 */
router.post("/chat/conversations/:id/retry", auth, requireUser, aiLimiterFor("chat"), cuotaIA("chat"), async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ success: false, error: "ID de conversación inválido" });
    }

    const conversation = await ChatConversation.findOne({ _id: req.params.id, user: req.user.id });
    if (!conversation) {
      return res.status(404).json({ success: false, error: "Conversación no encontrada", code: "CONVERSATION_NOT_FOUND" });
    }

    const mensajes = conversation.messages || [];
    const ultimo = mensajes[mensajes.length - 1];
    if (!ultimo || ultimo.estado !== "error") {
      return res.status(409).json({
        success: false,
        error: "No hay una respuesta fallida que reintentar.",
        code: "NOTHING_TO_RETRY"
      });
    }

    // El turno del usuario es el mensaje anterior; si no hay, no hay nada que
    // preguntar (un error sin pregunta no se puede rehacer).
    const pregunta = [...mensajes].reverse().find((item) => item.role === "user");
    if (!pregunta) {
      return res.status(409).json({ success: false, error: "No hay un mensaje que reintentar.", code: "NOTHING_TO_RETRY" });
    }

    const user = await User.findById(req.user.id).select("preferences.aiPersonality preferences.language").lean();
    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado", code: "USER_NOT_FOUND" });
    }

    const history = mensajes
      .filter((item) => item.estado === "ok" && item.content && item !== ultimo)
      .slice(-MAX_HISTORY_ITEMS)
      .map((item) => ({ role: item.role, content: item.content }));

    const personality = conversation.personality || user.preferences?.aiPersonality;
    const language = conversation.language || user.preferences?.language;

    let result;
    try {
      result = await chat({ message: pregunta.content || "", history, personality, language });
    } catch (error) {
      // El hueco del error se actualiza con el motivo nuevo: el anterior ya no
      // describe lo que pasó.
      ultimo.error = String(getAIErrorResponse(error).message || "Error del proveedor").slice(0, 500);
      await conversation.save();
      await recordUsage({
        userId: req.user?.id,
        capability: "chat",
        units: 0,
        estado: "error",
        error: error?.message || "CHAT_RETRY_ERROR"
      });
      const aiError = getAIErrorResponse(error);
      return res.status(aiError.status).json({ success: false, error: aiError.message, code: aiError.code });
    }

    ultimo.role = "assistant";
    ultimo.content = typeof result.text === "string" ? result.text : "";
    ultimo.model = typeof result.model === "string" ? result.model : "";
    ultimo.estado = "ok";
    ultimo.error = "";
    conversation.lastMessageAt = new Date();
    await conversation.save();

    await recordUsage({ userId: req.user.id, capability: "chat", units: 1 });

    return res.json({
      success: true,
      ...result,
      conversationId: String(conversation._id),
      conversation: presentConversation(conversation.toObject()),
      messages: conversation.messages.map(presentMessage)
    });
  } catch (error) {
    console.error("CHAT_RETRY_ERROR:", error);
    const aiError = getAIErrorResponse(error);
    return res.status(aiError.status).json({ success: false, error: aiError.message, code: aiError.code });
  }
});

/**
 * GET /api/ai/chat/conversations/:id/search?q=...
 *
 * Búsqueda dentro de un hilo. Antes solo se podía recorrer a ojo, y un hilo de
 * cien mensajes no se recorre.
 *
 * Reglas:
 * - la consulta se escapa antes de entrar al `$regex`: sin eso, un `.*` o un
 *   `(a+)+` del usuario se convierte en una consulta catastrófica contra Mongo;
 * - mínimo dos caracteres: una letra devuelve todo y no es una búsqueda;
 * - se devuelve el índice dentro de `messages` para que el cliente pueda
 *   resaltar y saltar al mensaje sin reenviar el hilo entero.
 */
const BUSQUEDA_MINIMA = 2;

function escaparRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/chat/conversations/:id/search", auth, requireUser, async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ success: false, error: "ID de conversación inválido" });
    }

    const consulta = String(req.query?.q || "").trim();
    if (consulta.length < BUSQUEDA_MINIMA) {
      return res.status(400).json({
        success: false,
        error: `Escribe al menos ${BUSQUEDA_MINIMA} caracteres para buscar`,
        code: "BUSQUEDA_CORTA"
      });
    }

    const conversacion = await ChatConversation.findOne({
      _id: req.params.id,
      user: req.user.id
    }).lean();

    if (!conversacion) {
      return res.status(404).json({ success: false, error: "Conversación no encontrada" });
    }

    const patron = new RegExp(escaparRegex(consulta.slice(0, 80)), "i");
    const coincidencias = [];

    (conversacion.messages || []).forEach((mensaje, indice) => {
      const contenido = String(mensaje?.content || "");
      const posicion = contenido.search(patron);
      if (posicion === -1) return;

      // Un extracto alrededor de la coincidencia: devolver el mensaje entero
      // multiplica el tamaño de la respuesta sin añadir información útil.
      const desde = Math.max(0, posicion - 40);
      const hasta = Math.min(contenido.length, posicion + consulta.length + 60);
      coincidencias.push({
        indice,
        role: mensaje.role,
        createdAt: mensaje.createdAt || null,
        extracto: `${desde > 0 ? "…" : ""}${contenido.slice(desde, hasta)}${hasta < contenido.length ? "…" : ""}`
      });
    });

    return res.json({
      consulta,
      total: coincidencias.length,
      mensajes: coincidencias.slice(0, 50)
    });
  } catch (error) {
    console.error("CHAT_SEARCH_ERROR:", error);
    return res.status(500).json({ success: false, error: "No se pudo buscar en el hilo" });
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

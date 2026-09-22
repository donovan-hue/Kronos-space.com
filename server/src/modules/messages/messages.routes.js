const express = require("express");
const mongoose = require("mongoose");
const Message = require("./Message");
const User = require("../users/User");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const moderation = require("../moderation/moderation.service");
const { handleUpload } = require("../../middleware/upload");
const { saveUploadedFile } = require("../../config/storage");
const { isOnline } = require("./presence");
const {
  parseMessageMedia,
  parseClientMessageId
} = require("./messageMedia");

const router = express.Router();

const MAX_MESSAGE_LENGTH = 5000;

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function populateDMMessage(message) {
  await message.populate("sender", "username displayName avatar");
  await message.populate("receiver", "username displayName avatar");
  return message;
}

// ---------------------------------------------------------------
// KRONOS-UI-019 — upload de adjuntos.
// Mismo contrato que POST /api/posts/media/upload (AUDIT-005):
// multipart, campo `media`, respuesta { url, mimeType, size }.
// ---------------------------------------------------------------
router.post(
  "/media/upload",
  auth,
  requireUser,
  handleUpload("media"),
  async (req, res) => {
    try {
      if (!req.file || !req.file.path) {
        return res.status(400).json({ error: "No se recibió ninguna imagen" });
      }

      const { url, size } = await saveUploadedFile({
        tmpPath: req.file.path,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
        subdir: "media"
      });

      return res.status(201).json({ url, mimeType: req.file.mimetype, size });
    } catch (error) {
      console.error("UPLOAD_MESSAGE_MEDIA_ERROR:", error);
      return res.status(500).json({ error: "Error subiendo imagen" });
    }
  }
);

// ---------------------------------------------------------------
// Lista de conversaciones 1-a-1 (contrato AUDIT-004, extendido).
// Cambios de este bloque: `latestMessage.hasMedia` (019) y
// `user.online` (020).
// ---------------------------------------------------------------
router.get("/", auth, requireUser, async (req, res) => {
  try {
    const currentUserId = new mongoose.Types.ObjectId(req.user.id);

    const conversations = await Message.aggregate([
      {
        // Solo conversaciones 1-a-1: los mensajes de grupo llevan
        // `conversation` y no deben aparecer aquí.
        $match: {
          conversation: null,
          $or: [
            { sender: currentUserId },
            { receiver: currentUserId }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$sender", currentUserId] },
              "$receiver",
              "$sender"
            ]
          },
          latestMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$receiver", currentUserId] },
                    { $eq: ["$read", false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: { "latestMessage.createdAt": -1 }
      },
      {
        $limit: 100
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: "$user"
      },
      {
        $project: {
          _id: 0,
          user: {
            _id: "$user._id",
            username: "$user.username",
            displayName: "$user.displayName",
            avatar: "$user.avatar"
          },
          latestMessage: {
            _id: "$latestMessage._id",
            text: "$latestMessage.text",
            sender: "$latestMessage.sender",
            receiver: "$latestMessage.receiver",
            createdAt: "$latestMessage.createdAt",
            read: "$latestMessage.read",
            delivered: "$latestMessage.delivered",
            mediaUrl: "$latestMessage.media.url"
          },
          unreadCount: 1
        }
      }
    ]);

    // 019/020: derivados en JS (sin expresiones exóticas en la agregación).
    for (const item of conversations) {
      item.user.online = await isOnline(item.user._id);
      item.latestMessage.hasMedia = Boolean(item.latestMessage?.mediaUrl);
      delete item.latestMessage.mediaUrl;
    }

    return res.json({ conversations });
  } catch (error) {
    console.error("GET_CONVERSATIONS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo conversaciones" });
  }
});

// ---------------------------------------------------------------
// Mensajes de una conversación 1-a-1 (contrato AUDIT-004).
// Cambio de este bloque: respuesta añade presencia y perfil del interlocutor.
// ---------------------------------------------------------------
router.get("/:userId", auth, requireUser, async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ error: "ID de usuario inválido" });
    }

    if (userId === req.user.id) {
      return res.status(400).json({
        error: "No puedes abrir una conversación contigo mismo"
      });
    }

    const user = await User.findById(userId)
      .select("_id username displayName avatar")
      .lean();

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    if (await moderation.isBlockedBetween(req.user.id, userId)) {
      return res.status(403).json({
        error: "No puedes ver esta conversación por un bloqueo",
        code: "BLOCKED_RELATION"
      });
    }

    const messages = await Message.find({
      $or: [
        { sender: req.user.id, receiver: userId },
        { sender: userId, receiver: req.user.id }
      ]
    })
      .populate("sender", "username displayName avatar")
      .populate("receiver", "username displayName avatar")
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    const online = await isOnline(userId);
    return res.json({
      messages,
      online,
      user
    });
  } catch (error) {
    console.error("GET_MESSAGES_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo mensajes" });
  }
});

// ---------------------------------------------------------------
// Enviar mensaje 1-a-1 (contrato AUDIT-004, extendido).
// 019: `media` opcional (solo URLs de /uploads/media).
// 021: `clientMessageId` opcional; el mismo reenvío devuelve el
//      mensaje original (200 + deduplicated) sin duplicar.
// ---------------------------------------------------------------
router.post("/:userId", auth, requireUser, async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ error: "ID de usuario inválido" });
    }

    if (userId === req.user.id) {
      return res.status(400).json({
        error: "No puedes enviarte mensajes a ti mismo"
      });
    }

    const user = await User.exists({ _id: userId });

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    if (await moderation.isBlockedBetween(req.user.id, userId)) {
      return res.status(403).json({
        error: "No puedes enviar mensajes por un bloqueo",
        code: "BLOCKED_RELATION"
      });
    }

    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";

    if (text.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: "El mensaje no puede superar 5000 caracteres"
      });
    }

    const media = parseMessageMedia(req.body);

    if (media.error) {
      return res.status(400).json({ error: media.error });
    }

    const clientId = parseClientMessageId(req.body);

    if (clientId.error) {
      return res.status(400).json({ error: clientId.error });
    }

    if (!text && !media.value) {
      return res.status(400).json({ error: "El mensaje está vacío" });
    }

    // 021: reenvío idempotente. Si el cliente ya envió este mismo
    // mensaje (misma clientMessageId), se devuelve el original.
    if (clientId.value) {
      const existing = await Message.findOne({
        sender: req.user.id,
        receiver: userId,
        clientMessageId: clientId.value
      }).lean();

      if (existing) {
        const original = await Message.findById(existing._id).populate(
          "sender",
          "username displayName avatar"
        );
        await original.populate("receiver", "username displayName avatar");
        return res.status(200).json({ message: original, deduplicated: true });
      }
    }

    const message = await Message.create({
      sender: req.user.id,
      receiver: userId,
      text,
      media: media.value,
      clientMessageId: clientId.value
    });

    await populateDMMessage(message);

    const io = req.app.get("io");

    if (io) {
      io.to(`user:${userId}`).emit("message:new", message);
    }

    return res.status(201).json({ message, deduplicated: false });
  } catch (error) {
    console.error("SEND_MESSAGE_ERROR:", error);
    return res.status(500).json({ error: "Error enviando mensaje" });
  }
});

// ---------------------------------------------------------------
// KRONOS-UI-021 — marcar como entregados los mensajes recibidos de
// `:userId` (el cliente lo invoca al abrir la conversación).
// ---------------------------------------------------------------
router.patch("/:userId/delivered", auth, requireUser, async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ error: "ID de usuario inválido" });
    }

    if (await moderation.isBlockedBetween(req.user.id, userId)) {
      return res.status(403).json({
        error: "Conversación no disponible por un bloqueo",
        code: "BLOCKED_RELATION"
      });
    }

    const result = await Message.updateMany(
      {
        sender: userId,
        receiver: req.user.id,
        delivered: false
      },
      { $set: { delivered: true } }
    );

    return res.json({ ok: true, marked: result.modifiedCount });
  } catch (error) {
    console.error("MARK_MESSAGES_DELIVERED_ERROR:", error);
    return res.status(500).json({
      error: "Error actualizando mensajes"
    });
  }
});

// ---------------------------------------------------------------
// Marcar como leídos (contrato AUDIT-004).
// Cambio de este bloque: leer implica entregado (021).
// ---------------------------------------------------------------
router.patch(
  "/:userId/read",
  auth,
  requireUser,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      if (!isValidObjectId(userId)) {
        return res.status(400).json({ error: "ID de usuario inválido" });
      }

      if (await moderation.isBlockedBetween(req.user.id, userId)) {
        return res.status(403).json({
          error: "Conversación no disponible por un bloqueo",
          code: "BLOCKED_RELATION"
        });
      }

      await Message.updateMany(
        {
          sender: userId,
          receiver: req.user.id,
          read: false
        },
        { $set: { read: true, delivered: true } }
      );

      return res.json({ ok: true });
    } catch (error) {
      console.error("MARK_MESSAGES_READ_ERROR:", error);
      return res.status(500).json({ error: "Error actualizando mensajes" });
    }
  }
);

module.exports = router;

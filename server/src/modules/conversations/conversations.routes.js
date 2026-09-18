const express = require("express");
const mongoose = require("mongoose");
const Conversation = require("./Conversation");
const Message = require("../messages/Message");
const User = require("../users/User");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const {
  parseMessageMedia,
  parseClientMessageId
} = require("../messages/messageMedia");
const { isOnline } = require("../messages/presence");

const router = express.Router();

const MAX_MESSAGE_LENGTH = 5000;
const MIN_MEMBERS = 2;
const MAX_MEMBERS = 10;
const USER_FIELDS = "username displayName avatar";

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function getConversationAsMember(conversationId, userId) {
  if (!isValidObjectId(conversationId)) {
    return { error: { status: 400, body: { error: "ID de conversación inválido" } } };
  }

  const conversation = await Conversation.findById(conversationId).lean();

  if (!conversation) {
    return {
      error: { status: 404, body: { error: "Conversación no encontrada" } }
    };
  }

  const isMember = (conversation.members || []).some(
    (member) => String(member) === String(userId)
  );

  if (!isMember) {
    return {
      error: {
        status: 403,
        body: {
          error: "No eres miembro de esta conversación",
          code: "CONVERSATION_NOT_MEMBER"
        }
      }
    };
  }

  return { conversation };
}

// ---------------------------------------------------------------
// Crear grupo. Body: { name?, memberIds: [id, ...] }
// El creador se agrega solo; el grupo queda con 2-10 miembros.
// ---------------------------------------------------------------
router.post("/", auth, requireUser, async (req, res) => {
  try {
    const rawIds = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];

    if (rawIds.length === 0) {
      return res.status(400).json({
        error: "Indica al menos un usuario más para el grupo",
        code: "MEMBERS_REQUIRED"
      });
    }

    const memberIds = [...new Set(rawIds.map((value) => String(value)))];

    if (memberIds.some((id) => !isValidObjectId(id))) {
      return res.status(400).json({ error: "ID de usuario inválido" });
    }

    // El creador siempre pertenece al grupo.
    if (!memberIds.includes(req.user.id)) {
      memberIds.push(req.user.id);
    }

    if (
      memberIds.length < MIN_MEMBERS ||
      memberIds.length > MAX_MEMBERS
    ) {
      return res.status(400).json({
        error: `Un grupo debe tener entre ${MIN_MEMBERS} y ${MAX_MEMBERS} miembros`,
        code: "MEMBER_COUNT"
      });
    }

    const existingUsers = await User.find({ _id: { $in: memberIds } }).select(
      "_id"
    );

    if (existingUsers.length !== memberIds.length) {
      return res.status(400).json({
        error: "Un o más usuarios no existen",
        code: "USERS_NOT_FOUND"
      });
    }

    const name =
      typeof req.body.name === "string" ? req.body.name.trim().slice(0, 60) : "";

    // Mismo conjunto de miembros = mismo grupo (evita dobles visibles).
    const duplicate = await Conversation.findOne({
      members: { $size: memberIds.length, $all: memberIds }
    }).lean();

    if (duplicate) {
      return res.status(409).json({
        error: "Ya existe un grupo con exactamente esos mismos miembros",
        code: "CONVERSATION_EXISTS"
      });
    }

    const conversation = await Conversation.create({
      name,
      members: memberIds,
      createdBy: req.user.id
    });

    await conversation.populate("members", USER_FIELDS);
    await conversation.populate("createdBy", USER_FIELDS);

    return res.status(201).json({ conversation });
  } catch (error) {
    console.error("CREATE_CONVERSATION_ERROR:", error);
    return res.status(500).json({ error: "Error creando conversación" });
  }
});

// ---------------------------------------------------------------
// Mis grupos: últimos mensajes y no leídos por conversación.
// ---------------------------------------------------------------
router.get("/", auth, requireUser, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const conversations = await Conversation.find({
      members: currentUserId
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(100)
      .populate("members", USER_FIELDS)
      .lean();

    const ids = conversations.map((conversation) => conversation._id);

    let latestById = {};
    let unreadById = {};

    if (ids.length > 0) {
      const latest = await Message.aggregate([
        {
          $match: {
            conversation: { $in: ids }
          }
        },
        {
          $sort: { createdAt: -1 }
        },
        {
          $group: {
            _id: "$conversation",
            latestMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$sender", new mongoose.Types.ObjectId(currentUserId)] },
                    {
                      $not: {
                        $in: [
                          new mongoose.Types.ObjectId(currentUserId),
                          { $ifNull: ["$readBy", []] }
                        ]
                      }
                    }
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
          $project: {
            _id: 1,
            latestMessage: {
              _id: "$latestMessage._id",
              text: "$latestMessage.text",
              sender: "$latestMessage.sender",
              createdAt: "$latestMessage.createdAt",
              hasMedia: {
                $gt: [
                  {
                    $ifNull: [
                      { $trim: { input: { $ifNull: ["$latestMessage.media.url", ""] } } },
                      ""
                    ]
                  },
                  ""
                ]
              }
            },
            unreadCount: 1
          }
        }
      ]);

      for (const item of latest) {
        latestById[String(item._id)] = item.latestMessage;
        unreadById[String(item._id)] = item.unreadCount;
      }
    }

    const result = conversations.map((conversation) => ({
      ...conversation,
      latestMessage: latestById[String(conversation._id)] || null,
      unreadCount: unreadById[String(conversation._id)] || 0
    }));

    return res.json({ conversations: result });
  } catch (error) {
    console.error("GET_CONVERSATIONS_LIST_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo conversaciones" });
  }
});

// ---------------------------------------------------------------
// Mensajes de un grupo (solo miembros).
// ---------------------------------------------------------------
router.get("/:conversationId/messages", auth, requireUser, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const membership = await getConversationAsMember(conversationId, req.user.id);

    if (membership.error) {
      return res.status(membership.error.status).json(membership.error.body);
    }

    const messages = await Message.find({
      conversation: new mongoose.Types.ObjectId(conversationId)
    })
      .populate("sender", USER_FIELDS)
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    const conversation = await Conversation.findById(conversationId)
      .populate("members", USER_FIELDS)
      .lean();

    // 020: presencia inicial para la UI (el socket repone cambios luego).
    const members = (conversation.members || []).map((member) => ({
      ...member,
      online: isOnline(member._id)
    }));

    return res.json({
      conversation: {
        _id: conversation._id,
        name: conversation.name,
        members
      },
      messages
    });
  } catch (error) {
    console.error("GET_CONVERSATION_MESSAGES_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo mensajes" });
  }
});

// ---------------------------------------------------------------
// Enviar a un grupo (solo miembros). Mismas reglas de contenido que
// el mensaje 1-a-1: texto (<=5000) y/o media de /uploads/media, y
// reintentos idempotentes por clientMessageId (021).
// ---------------------------------------------------------------
router.post("/:conversationId/messages", auth, requireUser, async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ error: "ID de conversación inválido" });
    }

    const membership = await getConversationAsMember(conversationId, req.user.id);

    if (membership.error) {
      return res.status(membership.error.status).json(membership.error.body);
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

    const conversationObjectId = new mongoose.Types.ObjectId(conversationId);

    if (clientId.value) {
      const existing = await Message.findOne({
        sender: req.user.id,
        conversation: conversationObjectId,
        clientMessageId: clientId.value
      }).lean();

      if (existing) {
        const original = await Message.findById(existing._id).populate(
          "sender",
          USER_FIELDS
        );
        return res.status(200).json({ message: original, deduplicated: true });
      }
    }

    const message = await Message.create({
      sender: req.user.id,
      conversation: conversationObjectId,
      text,
      media: media.value,
      clientMessageId: clientId.value
    });

    await message.populate("sender", USER_FIELDS);

    const io = req.app.get("io");

    if (io) {
      io.to(`conversation:${conversationId}`).emit("message:new", message);
    }

    return res.status(201).json({ message, deduplicated: false });
  } catch (error) {
    console.error("SEND_CONVERSATION_MESSAGE_ERROR:", error);
    return res.status(500).json({ error: "Error enviando mensaje" });
  }
});

// ---------------------------------------------------------------
// Marcar leídos en un grupo: agrega al lector a `readBy` de los
// mensajes de los demás (y los marca entregados de paso).
// ---------------------------------------------------------------
router.patch("/:conversationId/read", auth, requireUser, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const membership = await getConversationAsMember(conversationId, req.user.id);

    if (membership.error) {
      return res.status(membership.error.status).json(membership.error.body);
    }

    const currentUserId = new mongoose.Types.ObjectId(req.user.id);

    const result = await Message.updateMany(
      {
        conversation: new mongoose.Types.ObjectId(conversationId),
        sender: { $ne: currentUserId }
      },
      {
        $addToSet: { readBy: currentUserId },
        $set: { delivered: true }
      }
    );

    return res.json({ ok: true, marked: result.modifiedCount });
  } catch (error) {
    console.error("MARK_CONVERSATION_READ_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando mensajes" });
  }
});

// ---------------------------------------------------------------
// Miembros: solo el creador puede añadir o quitar.
// Body: { add: [id], remove: [id] }
// ---------------------------------------------------------------
router.patch("/:conversationId/members", auth, requireUser, async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ error: "ID de conversación inválido" });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: "Conversación no encontrada" });
    }

    if (String(conversation.createdBy) !== String(req.user.id)) {
      return res.status(403).json({
        error: "Solo el creador puede modificar los miembros",
        code: "NOT_CREATOR"
      });
    }

    const add = [...new Set((Array.isArray(req.body.add) ? req.body.add : []).map((value) => String(value)))];
    const remove = [...new Set((Array.isArray(req.body.remove) ? req.body.remove : []).map((value) => String(value)))];

    if (add.some((id) => !isValidObjectId(id)) || remove.some((id) => !isValidObjectId(id))) {
      return res.status(400).json({ error: "ID de usuario inválido" });
    }

    const currentMembers = conversation.members.map((member) => String(member));

    const alreadyMembers = add.filter((id) => currentMembers.includes(id));

    if (alreadyMembers.length > 0) {
      return res.status(409).json({
        error: "Uno o más usuarios ya son miembros",
        code: "MEMBER_EXISTS"
      });
    }

    const creatorId = String(conversation.createdBy);

    if (remove.includes(creatorId)) {
      return res.status(400).json({
        error: "El creador no puede quitarse de su propio grupo",
        code: "CREATOR_LOCKED"
      });
    }

    if (add.length > 0) {
      const existingUsers = await User.find({ _id: { $in: add } }).select("_id");

      if (existingUsers.length !== add.length) {
        return res.status(400).json({
          error: "Un o más usuarios no existen",
          code: "USERS_NOT_FOUND"
        });
      }
    }

    const nextMembers = [
      ...currentMembers.filter((id) => !remove.includes(id)),
      ...add
    ];

    if (nextMembers.length < MIN_MEMBERS) {
      return res.status(400).json({
        error: `Un grupo no puede quedar con menos de ${MIN_MEMBERS} miembros`,
        code: "MEMBER_COUNT"
      });
    }

    if (nextMembers.length > MAX_MEMBERS) {
      return res.status(400).json({
        error: `Un grupo no puede superar ${MAX_MEMBERS} miembros`,
        code: "MEMBER_COUNT"
      });
    }

    conversation.members = nextMembers;
    await conversation.save();
    await conversation.populate("members", USER_FIELDS);

    return res.json({
      conversation: {
        _id: conversation._id,
        name: conversation.name,
        members: conversation.members
      }
    });
  } catch (error) {
    console.error("UPDATE_CONVERSATION_MEMBERS_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando miembros" });
  }
});

// ---------------------------------------------------------------
// Eliminar grupo (solo creador). Los mensajes quedan en la base sin
// conversación accesible (límite declarado en el documento del bloque).
// ---------------------------------------------------------------
router.delete("/:conversationId", auth, requireUser, async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ error: "ID de conversación inválido" });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: "Conversación no encontrada" });
    }

    if (String(conversation.createdBy) !== String(req.user.id)) {
      return res.status(403).json({
        error: "Solo el creador puede eliminar el grupo",
        code: "NOT_CREATOR"
      });
    }

    await conversation.deleteOne();

    return res.json({ deleted: true });
  } catch (error) {
    console.error("DELETE_CONVERSATION_ERROR:", error);
    return res.status(500).json({ error: "Error eliminando conversación" });
  }
});

module.exports = router;

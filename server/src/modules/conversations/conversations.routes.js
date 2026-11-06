const express = require("express");
const mongoose = require("mongoose");
const Conversation = require("./Conversation");
const Message = require("../messages/Message");
const { deleteMessageByAuthor } = require("../messages/deleteMessage");
const User = require("../users/User");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const {
  parseMessageMedia,
  parseClientMessageId
} = require("../messages/messageMedia");
const { isOnlineAsync } = require("../messages/presence");

const router = express.Router();

const MAX_MESSAGE_LENGTH = 5000;
const MIN_MEMBERS = 2;
const MAX_MEMBERS = 10;
const USER_FIELDS = "username displayName avatar";

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Roles del grupo (bloque 1.4).
 *
 * Antes el rol era binario: creador o nada. Si el creador desaparecía, nadie
 * más podía añadir, quitar ni renombrar, y el grupo quedaba congelado. Ahora
 * hay administradores delegados (`admins`) y transferencia de propiedad
 * (`createdBy`), y ese es el único camino para que un grupo cambie de dueño
 * sin perder su historia de mensajes.
 */
function esAdministrador(conversation, userId) {
  const id = String(userId || "");
  if (!id) return false;
  if (String(conversation?.createdBy?._id || conversation?.createdBy) === id) return true;
  return (conversation?.admins || []).some((admin) => String(admin?._id || admin) === id);
}

function rolEnGrupo(conversation, userId) {
  const id = String(userId || "");
  if (!id) return "none";
  if (String(conversation?.createdBy?._id || conversation?.createdBy) === id) return "owner";
  if ((conversation?.admins || []).some((admin) => String(admin?._id || admin) === id)) return "admin";
  if ((conversation?.members || []).some((member) => String(member?._id || member) === id)) return "member";
  return "none";
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
      // Solo operadores de agregación muy estándar: el conteo de no leídos
      // se resuelve como (mensajes de otros) - (mensajes de otros que ya leí),
      // y `hasMedia` se deriva en JS para no depender de expresiones exóticas.
      const viewerId = new mongoose.Types.ObjectId(currentUserId);

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
            othersCount: {
              $sum: { $cond: [{ $ne: ["$sender", viewerId] }, 1, 0] }
            },
            readByMeCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$sender", viewerId] },
                      {
                        $gt: [
                          {
                            $size: {
                              $filter: {
                                input: { $ifNull: ["$readBy", []] },
                                as: "rb",
                                cond: { $eq: ["$$rb", viewerId] }
                              }
                            }
                          },
                          0
                        ]
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
              mediaUrl: "$latestMessage.media.url"
            },
            othersCount: 1,
            readByMeCount: 1
          }
        }
      ]);

      for (const item of latest) {
        latestById[String(item._id)] = {
          ...item.latestMessage,
          hasMedia: Boolean(item.latestMessage?.mediaUrl)
        };
        delete latestById[String(item._id)].mediaUrl;
        unreadById[String(item._id)] = Math.max(
          0,
          (item.othersCount || 0) - (item.readByMeCount || 0)
        );
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
// Buscar en los mensajes de un grupo (bloque 1.4).
//   GET /:conversationId/messages/search?q=...&limit=
// Solo miembros. Busca en el texto y devuelve el contexto mínimo: remitente,
// texto y fecha. Los mensajes borrados (lápida) no aparecen: su texto ya no
// existe y mostrarlos vacíos solo confundiría.
// ---------------------------------------------------------------
const MIN_BUSQUEDA = 2;
const MAX_RESULTADOS_BUSQUEDA = 50;

function escaparRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/:conversationId/messages/search", auth, requireUser, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const membership = await getConversationAsMember(conversationId, req.user.id);
    if (membership.error) {
      return res.status(membership.error.status).json(membership.error.body);
    }

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < MIN_BUSQUEDA) {
      return res.status(400).json({
        error: `Escribe al menos ${MIN_BUSQUEDA} caracteres para buscar`,
        code: "QUERY_TOO_SHORT"
      });
    }

    const pedido = Number(req.query.limit);
    const limit = Number.isFinite(pedido) && pedido > 0
      ? Math.min(Math.trunc(pedido), MAX_RESULTADOS_BUSQUEDA)
      : 20;

    // `$regex` escapado y no `$text`: son grupos de 2-10 personas con pocos
    // mensajes, y el índice de texto exigiría una migración de pesos para
    // ganar poco. El escape impide que un `.*` del usuario se convierta en
    // un comodín.
    const filtro = {
      conversation: new mongoose.Types.ObjectId(conversationId),
      text: { $regex: escaparRegex(q), $options: "i" },
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
    };

    const [mensajes, total] = await Promise.all([
      Message.find(filtro)
        .populate("sender", USER_FIELDS)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Message.countDocuments(filtro)
    ]);

    return res.json({
      query: q,
      total,
      limit,
      // `hayMas` evita que la UI diga «estos son todos» cuando no lo son.
      hayMas: total > mensajes.length,
      results: mensajes.map((mensaje) => ({
        _id: mensaje._id,
        text: mensaje.text || "",
        createdAt: mensaje.createdAt,
        sender: mensaje.sender || null
      }))
    });
  } catch (error) {
    console.error("SEARCH_CONVERSATION_MESSAGES_ERROR:", error);
    return res.status(500).json({ error: "Error buscando en los mensajes" });
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
    const members = await Promise.all((conversation.members || []).map(async (member) => ({
      ...member,
      // Presencia compartida (bloque 1.4): si la persona está conectada en
      // otra instancia, aquí también cuenta como en línea.
      online: await isOnlineAsync(member._id)
    })));

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

    let message;
    try {
      message = await Message.create({
        sender: req.user.id,
        conversation: conversationObjectId,
        text,
        media: media.value,
        clientMessageId: clientId.value
      });
    } catch (error) {
      // Concurrent retries may both miss the initial lookup. The scoped
      // unique index makes one loser; return the existing message instead of
      // exposing a duplicate-key 500.
      if (error?.code === 11000 && clientId.value) {
        const existing = await Message.findOne({
          sender: req.user.id,
          conversation: conversationObjectId,
          clientMessageId: clientId.value
        }).lean();
        if (existing) {
          const original = await Message.findById(existing._id).populate("sender", USER_FIELDS);
          return res.status(200).json({ message: original, deduplicated: true });
        }
      }
      throw error;
    }

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
// Miembros: los gestiona quien manda en el grupo (dueño o administrador).
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

    if (!esAdministrador(conversation, req.user.id)) {
      return res.status(403).json({
        error: "Solo el creador o un administrador pueden modificar los miembros",
        code: "NOT_ADMIN"
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
    // Un administrador que deja de ser miembro deja de administrar: si no,
    // conservaría permisos sobre un grupo al que ya no pertenece.
    conversation.admins = (conversation.admins || []).filter((admin) =>
      nextMembers.includes(String(admin))
    );
    await conversation.save();
    await conversation.populate("members", USER_FIELDS);
    await conversation.populate("admins", USER_FIELDS);

    return res.json({
      conversation: {
        _id: conversation._id,
        name: conversation.name,
        members: conversation.members,
        admins: conversation.admins,
        role: rolEnGrupo(conversation, req.user.id),
        // El cliente necesita saber quién manda para ofrecer renombrar,
        // añadir o eliminar. Sin esto, `isCreator` quedaba indefinido tras
        // cualquier cambio de miembros y el panel perdía sus botones.
        createdBy: conversation.createdBy
      }
    });
  } catch (error) {
    console.error("UPDATE_CONVERSATION_MEMBERS_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando miembros" });
  }
});

// ---------------------------------------------------------------
// Renombrar grupo. Solo el creador, igual que añadir o quitar miembros.
// `Conversation.name` existía desde el principio y la UI lo pintaba, pero
// nada lo escribía: el grupo nacía con el nombre que le diera el creador y
// se quedaba así para siempre.
// ---------------------------------------------------------------
router.patch("/:conversationId", auth, requireUser, async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ error: "ID de conversación inválido" });
    }

    if (typeof req.body?.name !== "string") {
      return res.status(400).json({ error: "Indica el nuevo nombre del grupo" });
    }

    // El esquema recorta a 60; aquí se rechaza en vez de truncar en silencio,
    // para que el usuario sepa que su nombre no cabía.
    const name = req.body.name.trim();
    if (name.length > 60) {
      return res.status(400).json({ error: "El nombre no puede superar 60 caracteres" });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: "Conversación no encontrada" });
    }

    if (!esAdministrador(conversation, req.user.id)) {
      return res.status(403).json({
        error: "Solo el creador o un administrador pueden cambiar el nombre del grupo",
        code: "NOT_ADMIN"
      });
    }

    conversation.name = name;
    await conversation.save();
    await conversation.populate("members", USER_FIELDS);

    return res.json({
      conversation: {
        _id: conversation._id,
        name: conversation.name,
        members: conversation.members,
        admins: conversation.admins || [],
        createdBy: conversation.createdBy,
        role: rolEnGrupo(conversation, req.user.id)
      }
    });
  } catch (error) {
    console.error("RENAME_CONVERSATION_ERROR:", error);
    return res.status(500).json({ error: "Error cambiando el nombre del grupo" });
  }
});

// ---------------------------------------------------------------
// Administradores y propiedad del grupo (bloque 1.4).
//   PATCH /:conversationId/admins  { add: [id], remove: [id] }  — solo el dueño
//   PATCH /:conversationId/owner   { userId }                    — transferir
// ---------------------------------------------------------------
router.patch("/:conversationId/admins", auth, requireUser, async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ error: "ID de conversación inválido" });
    }
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });

    // Nombrar administradores es una decisión del dueño, no de otro admin:
    // si un admin pudiera nombrar admins, el dueño perdería el control del
    // grupo sin darse cuenta.
    if (String(conversation.createdBy) !== String(req.user.id)) {
      return res.status(403).json({
        error: "Solo el creador puede nombrar administradores",
        code: "NOT_OWNER"
      });
    }

    const add = [...new Set((Array.isArray(req.body?.add) ? req.body.add : []).map(String))];
    const remove = [...new Set((Array.isArray(req.body?.remove) ? req.body.remove : []).map(String))];
    if ([...add, ...remove].some((id) => !isValidObjectId(id))) {
      return res.status(400).json({ error: "ID de usuario inválido" });
    }

    const memberIds = conversation.members.map((member) => String(member));
    const fueraDelGrupo = add.filter((id) => !memberIds.includes(id));
    if (fueraDelGrupo.length) {
      return res.status(400).json({
        error: "Solo un miembro del grupo puede ser administrador",
        code: "ADMIN_NOT_MEMBER"
      });
    }

    const actuales = new Set((conversation.admins || []).map(String));
    for (const id of remove) actuales.delete(id);
    for (const id of add) actuales.add(id);

    conversation.admins = [...actuales];
    await conversation.save();
    await conversation.populate("members", USER_FIELDS);
    await conversation.populate("admins", USER_FIELDS);

    return res.json({
      conversation: {
        _id: conversation._id,
        name: conversation.name,
        members: conversation.members,
        admins: conversation.admins,
        createdBy: conversation.createdBy,
        role: rolEnGrupo(conversation, req.user.id)
      }
    });
  } catch (error) {
    console.error("UPDATE_ADMINS_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando administradores" });
  }
});

router.patch("/:conversationId/owner", auth, requireUser, async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ error: "ID de conversación inválido" });
    }
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });

    if (String(conversation.createdBy) !== String(req.user.id)) {
      return res.status(403).json({
        error: "Solo el creador puede transferir la propiedad del grupo",
        code: "NOT_OWNER"
      });
    }

    const nuevoDueno = String(req.body?.userId || "");
    if (!isValidObjectId(nuevoDueno)) return res.status(400).json({ error: "ID de usuario inválido" });

    const memberIds = conversation.members.map((member) => String(member));
    if (!memberIds.includes(nuevoDueno)) {
      return res.status(400).json({
        error: "El nuevo dueño debe ser miembro del grupo",
        code: "OWNER_NOT_MEMBER"
      });
    }
    if (nuevoDueno === String(req.user.id)) {
      return res.status(400).json({ error: "Ya eres el dueño del grupo", code: "ALREADY_OWNER" });
    }

    // El dueño anterior se queda como administrador: sigue en el grupo y no
    // pierde la moderación de golpe por haber delegado la propiedad.
    const anteriores = (conversation.admins || []).map(String).filter((id) => id !== nuevoDueno);
    anteriores.push(String(req.user.id));
    conversation.createdBy = nuevoDueno;
    conversation.admins = [...new Set(anteriores)];

    await conversation.save();
    await conversation.populate("members", USER_FIELDS);
    await conversation.populate("admins", USER_FIELDS);

    return res.json({
      conversation: {
        _id: conversation._id,
        name: conversation.name,
        members: conversation.members,
        admins: conversation.admins,
        createdBy: conversation.createdBy,
        role: rolEnGrupo(conversation, req.user.id)
      }
    });
  } catch (error) {
    console.error("TRANSFER_OWNER_ERROR:", error);
    return res.status(500).json({ error: "Error transfiriendo la propiedad del grupo" });
  }
});

// ---------------------------------------------------------------
// Salir de un grupo. Cualquier miembro puede irse; el creador no, porque
// su salida dejaría el grupo sin responsable de miembros y borrado (el
// contrato ya lo protegía en `PATCH /members` y aquí se repite).
// Devuelve `deleted: true` si el grupo quedó vacío y se eliminó.
// ---------------------------------------------------------------
router.delete("/:conversationId/members/me", auth, requireUser, async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ error: "ID de conversación inválido" });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: "Conversación no encontrada" });
    }

    const members = conversation.members.map((member) => String(member));

    if (!members.includes(String(req.user.id))) {
      return res.status(404).json({ error: "No perteneces a este grupo" });
    }

    if (String(conversation.createdBy) === String(req.user.id)) {
      return res.status(400).json({
        error: "El creador no puede salir de su propio grupo. Puedes eliminarlo.",
        code: "CREATOR_LOCKED"
      });
    }

    const nextMembers = members.filter((id) => id !== String(req.user.id));

    if (nextMembers.length < MIN_MEMBERS) {
      // Sólo queda el creador: el grupo ya no es un grupo.
      await conversation.deleteOne();
      return res.json({ left: true, deleted: true });
    }

    conversation.members = nextMembers;
    await conversation.save();

    return res.json({ left: true, deleted: false });
  } catch (error) {
    console.error("LEAVE_CONVERSATION_ERROR:", error);
    return res.status(500).json({ error: "Error saliendo del grupo" });
  }
});

// ---------------------------------------------------------------
// Borrar un mensaje de grupo. Mismas reglas que el 1-a-1: solo el autor.
// ---------------------------------------------------------------
router.delete("/:conversationId/messages/:messageId", auth, requireUser, async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ error: "ID de conversación inválido" });
    }

    const membership = await getConversationAsMember(conversationId, req.user.id);

    if (membership.error) {
      return res.status(membership.error.status).json(membership.error.body);
    }

    // La pertenencia al grupo se comprueba ANTES de tocar nada: si el
    // mensaje fuera de otra conversación, el borrado ya habría ocurrido y no
    // hay vuelta atrás.
    if (!isValidObjectId(messageId)) {
      return res.status(400).json({ error: "ID de mensaje inválido" });
    }

    const target = await Message.findById(messageId).select("conversation sender").lean();

    if (!target || String(target.conversation) !== String(conversationId)) {
      return res.status(404).json({ error: "El mensaje no existe en este grupo" });
    }

    if (String(target.sender) !== String(req.user.id)) {
      return res.status(403).json({
        error: "Solo puedes eliminar tus propios mensajes",
        code: "NOT_SENDER"
      });
    }

    const result = await deleteMessageByAuthor({
      messageId,
      userId: req.user.id,
      io: req.app.get("io")
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("DELETE_GROUP_MESSAGE_ERROR:", error);
    return res.status(500).json({ error: "Error eliminando el mensaje" });
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

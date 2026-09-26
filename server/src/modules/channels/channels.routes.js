const express = require("express");
const mongoose = require("mongoose");

const Channel = require("./Channel");
const ChannelMessage = require("./ChannelMessage");
const Orbit = require("../orbits/Orbit");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");

const { validId } = require("../../utils/queryHelpers");

const router = express.Router();
const MAX_NAME = 80;
const MAX_DESCRIPTION = 300;
const MAX_MESSAGE = 2000;
const MAX_LIMIT = 50;

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "channel";
}

function memberEntry(orbit, userId) {
  return (orbit.members || []).find((member) => String(member.user?._id || member.user) === String(userId));
}

function canManage(orbit, channel, userId) {
  const member = memberEntry(orbit, userId);
  return String(orbit.owner) === String(userId)
    || String(channel.owner) === String(userId)
    || member?.role === "moderator";
}

function isSubscriber(channel, userId) {
  return (channel.subscribers || []).some((subscriber) => String(subscriber.user?._id || subscriber.user) === String(userId));
}

async function getAccessibleChannel(channelId, userId) {
  if (!validId(channelId)) return null;
  const channel = await Channel.findById(channelId).lean();
  if (!channel) return null;
  const orbit = await Orbit.findOne({
    _id: channel.orbit,
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      { $or: [{ visibility: "public" }, { owner: userId }, { "members.user": userId }] }
    ]
  }).lean();
  if (!orbit) return null;
  return { channel, orbit };
}

function presentChannel(channel, orbit, userId) {
  const member = memberEntry(orbit, userId);
  return {
    _id: channel._id,
    orbit: { _id: orbit._id, name: orbit.name, slug: orbit.slug },
    owner: String(channel.owner),
    name: channel.name,
    slug: channel.slug,
    description: channel.description || "",
    type: channel.type,
    subscribersCount: Array.isArray(channel.subscribers) ? channel.subscribers.length : 0,
    subscribed: isSubscriber(channel, userId),
    manageable: canManage(orbit, channel, userId),
    orbitRole: member?.role || (String(orbit.owner) === String(userId) ? "owner" : null),
    lastMessageAt: channel.lastMessageAt || null,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt
  };
}

function presentMessage(message) {
  return {
    _id: message._id,
    channel: String(message.channel),
    author: message.author?._id ? {
      _id: message.author._id,
      username: message.author.username,
      displayName: message.author.displayName || "",
      avatar: message.author.avatar || ""
    } : String(message.author),
    text: message.text,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt
  };
}

function parseChannelPayload(body = {}) {
  const orbitId = typeof body.orbitId === "string" ? body.orbitId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const type = body.type === "discussion" ? "discussion" : body.type === "announcement" ? "announcement" : "";
  if (!validId(orbitId)) return { error: "Órbita inválida" };
  if (!name || name.length > MAX_NAME) return { error: "El canal necesita un nombre de hasta 80 caracteres" };
  if (description.length > MAX_DESCRIPTION) return { error: "La descripción no puede superar 300 caracteres" };
  if (!type) return { error: "Tipo de canal no válido" };
  return { orbitId, name, description, type };
}

router.get("/", auth, requireUser, async (req, res) => {
  try {
    const orbitFilter = req.query.orbitId ? { orbit: req.query.orbitId } : {};
    if (req.query.orbitId && !validId(req.query.orbitId)) return res.status(400).json({ error: "Órbita inválida" });
    const channels = await Channel.find(orbitFilter).sort({ lastMessageAt: -1, updatedAt: -1 }).lean();
    const visible = await Promise.all(channels.map(async (channel) => {
      const access = await getAccessibleChannel(channel._id, req.user.id);
      return access ? presentChannel(channel, access.orbit, req.user.id) : null;
    }));
    return res.json({ channels: visible.filter(Boolean) });
  } catch (error) {
    console.error("LIST_CHANNELS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo canales" });
  }
});

router.post("/", auth, requireUser, async (req, res) => {
  try {
    const parsed = parseChannelPayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const orbit = await Orbit.findOne({
      _id: parsed.orbitId,
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
        { $or: [{ owner: req.user.id }, { "members.user": req.user.id }] }
      ]
    });
    if (!orbit) return res.status(403).json({ error: "Debes pertenecer a la órbita para crear un canal" });
    const orbitMember = memberEntry(orbit, req.user.id);
    if (String(orbit.owner) !== String(req.user.id) && orbitMember?.role !== "moderator") return res.status(403).json({ error: "Solo el propietario o moderadores pueden crear canales" });
    const channel = await Channel.create({
      orbit: orbit._id,
      owner: req.user.id,
      name: parsed.name,
      slug: `${slugify(parsed.name)}-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
      description: parsed.description,
      type: parsed.type,
      subscribers: [{ user: req.user.id }]
    });
    return res.status(201).json({ channel: presentChannel(channel.toObject(), orbit.toObject(), req.user.id) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "Ya existe un canal con ese nombre en la órbita" });
    console.error("CREATE_CHANNEL_ERROR:", error);
    return res.status(500).json({ error: "Error creando canal" });
  }
});

router.get("/:channelId", auth, requireUser, async (req, res) => {
  try {
    const access = await getAccessibleChannel(req.params.channelId, req.user.id);
    if (!access) return res.status(404).json({ error: "Canal no encontrado" });
    return res.json({ channel: presentChannel(access.channel, access.orbit, req.user.id) });
  } catch (error) {
    console.error("GET_CHANNEL_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo canal" });
  }
});

router.post("/:channelId/subscribe", auth, requireUser, async (req, res) => {
  try {
    const access = await getAccessibleChannel(req.params.channelId, req.user.id);
    if (!access) return res.status(404).json({ error: "Canal no encontrado" });
    if (!isSubscriber(access.channel, req.user.id)) {
      await Channel.updateOne({ _id: access.channel._id }, { $push: { subscribers: { user: req.user.id } } });
    }
    const updated = await Channel.findById(access.channel._id).lean();
    return res.json({ channel: presentChannel(updated, access.orbit, req.user.id), subscribed: true });
  } catch (error) {
    console.error("SUBSCRIBE_CHANNEL_ERROR:", error);
    return res.status(500).json({ error: "Error suscribiéndote al canal" });
  }
});

router.delete("/:channelId/subscribe", auth, requireUser, async (req, res) => {
  try {
    const access = await getAccessibleChannel(req.params.channelId, req.user.id);
    if (!access) return res.status(404).json({ error: "Canal no encontrado" });
    if (String(access.channel.owner) === String(req.user.id)) return res.status(400).json({ error: "El propietario no puede dejar su canal" });
    await Channel.updateOne({ _id: access.channel._id }, { $pull: { subscribers: { user: req.user.id } } });
    const updated = await Channel.findById(access.channel._id).lean();
    return res.json({ channel: presentChannel(updated, access.orbit, req.user.id), subscribed: false });
  } catch (error) {
    console.error("UNSUBSCRIBE_CHANNEL_ERROR:", error);
    return res.status(500).json({ error: "Error cancelando la suscripción" });
  }
});

router.get("/:channelId/messages", auth, requireUser, async (req, res) => {
  try {
    const access = await getAccessibleChannel(req.params.channelId, req.user.id);
    if (!access) return res.status(404).json({ error: "Canal no encontrado" });
    let limit = Number.parseInt(req.query.limit, 10);
    if (!Number.isInteger(limit) || limit < 1) limit = 30;
    limit = Math.min(limit, MAX_LIMIT);
    let page = Number.parseInt(req.query.page, 10);
    if (!Number.isInteger(page) || page < 1) page = 1;
    const filter = { channel: access.channel._id };
    const [messages, total] = await Promise.all([
      ChannelMessage.find(filter).populate("author", "username displayName avatar").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ChannelMessage.countDocuments(filter)
    ]);
    return res.json({ messages: messages.reverse().map(presentMessage), total, page, limit, hasMore: page * limit < total });
  } catch (error) {
    console.error("LIST_CHANNEL_MESSAGES_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo mensajes del canal" });
  }
});

router.post("/:channelId/messages", auth, requireUser, async (req, res) => {
  try {
    const access = await getAccessibleChannel(req.params.channelId, req.user.id);
    if (!access) return res.status(404).json({ error: "Canal no encontrado" });
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > MAX_MESSAGE) return res.status(400).json({ error: "El mensaje debe tener entre 1 y 2000 caracteres" });
    const manager = canManage(access.orbit, access.channel, req.user.id);
    if (access.channel.type === "announcement" && !manager) return res.status(403).json({ error: "Este canal solo permite publicaciones de sus responsables" });
    if (!manager && !isSubscriber(access.channel, req.user.id)) return res.status(403).json({ error: "Suscríbete al canal para participar" });
    const message = await ChannelMessage.create({ channel: access.channel._id, author: req.user.id, text });
    await Channel.updateOne({ _id: access.channel._id }, { $set: { lastMessageAt: message.createdAt } });
    await message.populate("author", "username displayName avatar");
    return res.status(201).json({ message: presentMessage(message.toObject()) });
  } catch (error) {
    console.error("CREATE_CHANNEL_MESSAGE_ERROR:", error);
    return res.status(500).json({ error: "Error publicando en el canal" });
  }
});

module.exports = router;
module.exports.parseChannelPayload = parseChannelPayload;

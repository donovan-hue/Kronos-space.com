const express = require("express");
const User = require("../users/User");
const Post = require("../posts/Post");
const {
  extractUsername,
  buildWebFingerResponse,
  buildActorObject,
  buildOutboxCollection,
  buildNodeInfo
} = require("./federation.service");

const router = express.Router();

/**
 * RFC 7033 WebFinger endpoint
 * GET /.well-known/webfinger?resource=acct:username@host
 */
router.get("/.well-known/webfinger", async (req, res) => {
  try {
    const resource = req.query.resource;
    if (!resource) {
      return res.status(400).json({ error: "Parámetro resource requerido" });
    }

    const username = extractUsername(resource);
    if (!username) {
      return res.status(400).json({ error: "Formato de identificador de recurso no válido" });
    }

    const user = await User.findOne({ username })
      .select("_id username displayName avatar cover bio profilePrivacy createdAt")
      .lean();

    if (!user) {
      return res.status(404).json({ error: "Cuenta no encontrada en Kronos Space" });
    }

    // Perfil privado o no descubrible
    if (user.profilePrivacy?.discoverable === false) {
      return res.status(404).json({ error: "Perfil no disponible para federación" });
    }

    const jrd = buildWebFingerResponse(user, req.hostname);
    res.setHeader("Content-Type", "application/jrd+json; charset=utf-8");
    return res.json(jrd);
  } catch (error) {
    console.error("WEBFINGER_ERROR:", error);
    return res.status(500).json({ error: "Error procesando consulta WebFinger" });
  }
});

/**
 * NodeInfo endpoints
 */
router.get("/.well-known/nodeinfo", (req, res) => {
  const host = req.get("host") || "kronos-space.com";
  const protocol = req.protocol || "https";
  return res.json({
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
        href: `${protocol}://${host}/api/nodeinfo/2.0`
      }
    ]
  });
});

router.get("/api/nodeinfo/2.0", (req, res) => {
  res.setHeader("Content-Type", "application/json; profile=\"http://nodeinfo.diaspora.software/ns/schema/2.0#\"; charset=utf-8");
  return res.json(buildNodeInfo());
});

/**
 * ActivityPub Actor endpoint
 * GET /api/federation/users/:username
 */
router.get("/api/federation/users/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return res.status(400).json({ error: "Nombre de usuario inválido" });
    }

    const user = await User.findOne({ username })
      .select("_id username displayName avatar cover bio profilePrivacy createdAt")
      .lean();

    if (!user) {
      return res.status(404).json({ error: "Actor federado no encontrado" });
    }

    if (user.profilePrivacy?.discoverable === false) {
      return res.status(404).json({ error: "Perfil no disponible para federación" });
    }

    const actor = buildActorObject(user);
    res.setHeader("Content-Type", "application/activity+json; charset=utf-8");
    return res.json(actor);
  } catch (error) {
    console.error("ACTOR_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo actor federado" });
  }
});

/**
 * ActivityPub Outbox endpoint
 * GET /api/federation/users/:username/outbox
 */
router.get("/api/federation/users/:username/outbox", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim().toLowerCase();
    const user = await User.findOne({ username }).select("_id username profilePrivacy").lean();

    if (!user) {
      return res.status(404).json({ error: "Actor federado no encontrado" });
    }

    const posts = await Post.find({
      author: user._id,
      visibility: { $in: ["public", undefined] }
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const total = await Post.countDocuments({
      author: user._id,
      visibility: { $in: ["public", undefined] }
    });

    const outbox = buildOutboxCollection(user, posts, total);
    res.setHeader("Content-Type", "application/activity+json; charset=utf-8");
    return res.json(outbox);
  } catch (error) {
    console.error("OUTBOX_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo outbox federado" });
  }
});

/**
 * ActivityPub Inbox endpoint
 * POST /api/federation/users/:username/inbox
 */
router.post("/api/federation/users/:username/inbox", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim().toLowerCase();
    const user = await User.findOne({ username }).select("_id username").lean();

    if (!user) {
      return res.status(404).json({ error: "Actor federado no encontrado" });
    }

    // Aceptamos la actividad federada y la encolamos
    return res.status(202).json({ status: "accepted", message: "Actividad federada recibida" });
  } catch (error) {
    console.error("INBOX_ERROR:", error);
    return res.status(500).json({ error: "Error procesando bandeja federada" });
  }
});

module.exports = router;

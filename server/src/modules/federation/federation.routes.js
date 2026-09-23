const express = require("express");
const mongoose = require("mongoose");
const User = require("../users/User");
const Post = require("../posts/Post");
const { publicAudienceFilter } = require("../posts/audience.service");
const {
  extractUsername,
  buildWebFingerResponse,
  buildActorObject,
  buildOutboxCollection,
  buildNodeInfo,
  federationOrigins
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

    const origins = federationOrigins();
    const jrd = buildWebFingerResponse(user, origins.canonicalHost, origins);
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
  const origins = federationOrigins();
  return res.json({
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
        href: `${origins.apiOrigin}/api/nodeinfo/2.0`
      }
    ]
  });
});

router.get("/api/nodeinfo/2.0", async (req, res) => {
  res.setHeader("Content-Type", "application/json; profile=\"http://nodeinfo.diaspora.software/ns/schema/2.0#\"; charset=utf-8");
  let totalUsers;

  if (mongoose.connection.readyState === 1) {
    try {
      totalUsers = await User.countDocuments({});
    } catch (error) {
      console.error("NODEINFO_COUNT_ERROR:", error?.message || error);
    }
  }

  return res.json(buildNodeInfo({ totalUsers }));
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

    const actor = buildActorObject(user, federationOrigins());
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

    if (user.profilePrivacy?.discoverable === false) {
      return res.status(404).json({ error: "Perfil no disponible para federación" });
    }

    // Las publicaciones usan `audience.type`, no un campo `visibility`.
    // El filtro anterior no coincidía con ningún documento y, si algún
    // registro antiguo lo tuviera, habría podido sacar contenido no público.
    const publicPosts = {
      author: user._id,
      "moderation.hidden": { $ne: true },
      ...publicAudienceFilter()
    };

    const posts = await Post.find(publicPosts)
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const total = await Post.countDocuments(publicPosts);

    const outbox = buildOutboxCollection(user, posts, total, federationOrigins());
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

    // No se acepta ni se encola: no hay verificación de firma ni procesamiento.
    // Un 202 hacía parecer que la actividad se había guardado.
    return res.status(501).json({
      error: "La bandeja federada de entrada todavía no procesa actividades.",
      code: "FEDERATION_INBOX_NOT_IMPLEMENTED"
    });
  } catch (error) {
    console.error("INBOX_ERROR:", error);
    return res.status(500).json({ error: "Error procesando bandeja federada" });
  }
});

module.exports = router;

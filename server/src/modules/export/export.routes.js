const express = require("express");
const mongoose = require("mongoose");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const User = require("../users/User");
const Post = require("../posts/Post");
const Orbit = require("../orbits/Orbit");
const Circle = require("../circles/Circle");

const router = express.Router();

// Registro en memoria de últimas solicitudes de exportación por usuario
const lastExportRequests = new Map();
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

router.get("/status", auth, requireUser, async (req, res) => {
  try {
    const lastRequest = lastExportRequests.get(req.user.id);
    const now = Date.now();
    const canExport = !lastRequest || now - lastRequest >= SEVEN_DAYS_MS;
    const nextAvailableDate = lastRequest ? new Date(lastRequest + SEVEN_DAYS_MS).toISOString() : null;

    return res.json({
      eligible: canExport,
      canExport,
      lastExportDate: lastRequest ? new Date(lastRequest).toISOString() : null,
      nextAvailableDate
    });
  } catch (error) {
    console.error("EXPORT_STATUS_ERROR:", error);
    return res.status(500).json({ error: "Error consultando estado de exportación" });
  }
});

router.post("/request", auth, requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const lastRequest = lastExportRequests.get(userId);
    const now = Date.now();

    if (lastRequest && now - lastRequest < SEVEN_DAYS_MS) {
      const nextDate = new Date(lastRequest + SEVEN_DAYS_MS).toISOString();
      return res.status(429).json({
        error: `Solo puedes solicitar una exportación por semana. Próxima disponible: ${nextDate}`,
        code: "EXPORT_RATE_LIMIT",
        nextAvailableDate: nextDate
      });
    }

    lastExportRequests.set(userId, now);

    return res.json({
      ok: true,
      message: "Exportación lista para descarga.",
      downloadUrl: "/api/export/download"
    });
  } catch (error) {
    console.error("EXPORT_REQUEST_ERROR:", error);
    return res.status(500).json({ error: "Error procesando solicitud de exportación" });
  }
});

router.get("/download", auth, requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select("-passwordHash -password -emailVerificationTokenHash -passwordResetTokenHash").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    // Recopilación de todos los datos creados por el usuario
    const [authoredPosts, postsWithComments, postsWithReactions, orbits, circles] = await Promise.all([
      Post.find({ author: userId }).lean().catch(() => []),
      Post.find({ "comments.user": userId }).select("_id comments").lean().catch(() => []),
      Post.find({ "reactions.user": userId }).select("_id reactions").lean().catch(() => []),
      Orbit.find({ "members.user": userId }).lean().catch(() => []),
      Circle.find({ user: userId }).lean().catch(() => [])
    ]);

    const userComments = [];
    for (const p of postsWithComments) {
      if (Array.isArray(p.comments)) {
        for (const c of p.comments) {
          if (String(c.user) === String(userId)) {
            userComments.push({
              id: c._id,
              postId: p._id,
              content: c.content,
              createdAt: c.createdAt
            });
          }
        }
      }
    }

    const userReactions = [];
    for (const p of postsWithReactions) {
      if (Array.isArray(p.reactions)) {
        for (const r of p.reactions) {
          if (String(r.user) === String(userId)) {
            userReactions.push({
              postId: p._id,
              type: r.type
            });
          }
        }
      }
    }

    const exportData = {
      version: "1.0",
      platform: "Kronos Space",
      exportedAt: new Date().toISOString(),
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
        cover: user.cover,
        preferences: user.preferences,
        profilePrivacy: user.profilePrivacy,
        createdAt: user.createdAt
      },
      posts: authoredPosts.map((p) => ({
        id: p._id,
        content: p.content,
        media: p.media,
        mediaItems: p.mediaItems,
        poll: p.poll,
        event: p.event,
        audience: p.audience,
        createdAt: p.createdAt
      })),
      comments: userComments,
      reactions: userReactions,
      orbits: orbits.map((o) => ({
        id: o._id,
        name: o.name,
        description: o.description,
        visibility: o.visibility,
        createdAt: o.createdAt
      })),
      circles: circles.map((c) => ({
        id: c._id,
        name: c.name,
        description: c.description,
        memberCount: Array.isArray(c.members) ? c.members.length : 0,
        createdAt: c.createdAt
      }))
    };

    const filename = `kronos-export-${user.username}-${Date.now()}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");

    return res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error("EXPORT_DOWNLOAD_ERROR:", error);
    return res.status(500).json({ error: "Error descargando exportación de datos" });
  }
});

module.exports = router;

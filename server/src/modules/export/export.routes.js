const express = require("express");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const User = require("../users/User");
const Post = require("../posts/Post");
const Orbit = require("../orbits/Orbit");
const Circle = require("../circles/Circle");

const router = express.Router();

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function exportWindow(requestedAt, now = Date.now()) {
  const last = requestedAt ? new Date(requestedAt).getTime() : 0;
  const valid = Number.isFinite(last) && last > 0;
  const eligible = !valid || now - last >= SEVEN_DAYS_MS;

  return {
    eligible,
    canDownload: valid && now >= last && now - last < SEVEN_DAYS_MS,
    lastExportDate: valid ? new Date(last).toISOString() : null,
    nextAvailableDate: valid ? new Date(last + SEVEN_DAYS_MS).toISOString() : null
  };
}

router.get("/status", auth, requireUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("+dataExportRequestedAt").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    const window = exportWindow(user.dataExportRequestedAt);

    return res.json({
      eligible: window.eligible,
      canExport: window.eligible,
      canDownload: window.canDownload,
      lastExportDate: window.lastExportDate,
      nextAvailableDate: window.eligible ? null : window.nextAvailableDate
    });
  } catch (error) {
    console.error("EXPORT_STATUS_ERROR:", error);
    return res.status(500).json({ error: "Error consultando estado de exportación" });
  }
});

router.post("/request", auth, requireUser, async (req, res) => {
  try {
    // La comprobación y la reserva deben ser atómicas: dos peticiones
    // concurrentes no pueden abrir dos ventanas de exportación distintas.
    const now = new Date();
    const cutoff = new Date(now.getTime() - SEVEN_DAYS_MS);
    const reserved = await User.findOneAndUpdate(
      {
        _id: req.user.id,
        $or: [
          { dataExportRequestedAt: null },
          { dataExportRequestedAt: { $lte: cutoff } }
        ]
      },
      { $set: { dataExportRequestedAt: now } },
      { new: true }
    ).select("_id").lean();

    if (reserved) {
      return res.json({
        ok: true,
        message: "Exportación lista para descarga.",
        downloadUrl: "/api/export/download"
      });
    }

    const user = await User.findById(req.user.id).select("+dataExportRequestedAt").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    const window = exportWindow(user.dataExportRequestedAt);

    return res.status(429).json({
      error: `Solo puedes solicitar una exportación por semana. Próxima disponible: ${window.nextAvailableDate}`,
      code: "EXPORT_RATE_LIMIT",
      nextAvailableDate: window.nextAvailableDate
    });
  } catch (error) {
    console.error("EXPORT_REQUEST_ERROR:", error);
    return res.status(500).json({ error: "Error procesando solicitud de exportación" });
  }
});

router.get("/download", auth, requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId)
      .select("-passwordHash -password -emailVerificationTokenHash -passwordResetTokenHash +dataExportRequestedAt")
      .lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    if (!exportWindow(user.dataExportRequestedAt).canDownload) {
      return res.status(403).json({
        error: "Solicita la exportación antes de descargarla.",
        code: "EXPORT_NOT_REQUESTED"
      });
    }

    // Recopilación de todos los datos creados por el usuario
    const [authoredPosts, postsWithComments, postsWithReactions, orbits, circles] = await Promise.all([
      Post.find({ author: userId }).lean(),
      Post.find({ "comments.user": userId }).select("_id comments").lean(),
      Post.find({ "reactions.user": userId }).select("_id reactions").lean(),
      Orbit.find({ "members.user": userId }).lean(),
      Circle.find({ owner: userId }).lean()
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

    const safeUsername = String(user.username || "user").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "user";
    const filename = `kronos-export-${safeUsername}-${Date.now()}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");

    return res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error("EXPORT_DOWNLOAD_ERROR:", error);
    return res.status(500).json({ error: "Error descargando exportación de datos" });
  }
});

module.exports = router;
module.exports.exportWindow = exportWindow;

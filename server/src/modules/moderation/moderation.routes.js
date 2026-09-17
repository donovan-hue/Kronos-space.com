const express = require("express");
const mongoose = require("mongoose");

const User = require("../users/User");
const Post = require("../posts/Post");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { publicUser } = require("../users/profilePrivacy");
const normalizePost = require("../posts/normalizePost");
const Block = require("./Block");
const Mute = require("./Mute");
const HiddenPost = require("./HiddenPost");
const {
  Report,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES
} = require("./Report");
const {
  isModerator,
  getBlockedUserIds,
  getMutedUserIds
} = require("./moderation.service");
const { createNotification } = require("../notifications/notification.service");

const router = express.Router();

const MAX_DETAILS_LENGTH = 1000;
const MAX_NOTE_LENGTH = 500;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;
const USER_FIELDS = "_id username displayName avatar cover bio profilePrivacy followers following createdAt";

function parsePagination(query) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_PAGE_LIMIT;
  if (limit > MAX_PAGE_LIMIT) limit = MAX_PAGE_LIMIT;

  return { page, limit, skip: (page - 1) * limit };
}

function validId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

async function requireModerator(req, res, next) {
  try {
    const user = await User.findById(req.user.id)
      .select("role")
      .lean();

    if (!isModerator(user)) {
      return res.status(403).json({
        error: "Solo moderadores pueden revisar reportes",
        code: "ADMIN_ONLY"
      });
    }

    req.moderator = user;

    return next();
  } catch (error) {
    console.error("MODERATOR_CHECK_ERROR:", error);

    return res.status(503).json({
      error: "No se pudo verificar el rol. Inténtalo nuevamente.",
      code: "MODERATION_UNAVAILABLE"
    });
  }
}

// ---------------------------------------------------------------
// Bloqueos
// ---------------------------------------------------------------

router.get("/blocks", auth, requireUser, async (req, res) => {
  try {
    const blockedIds = await getBlockedUserIds(req.user.id);
    const users = await User.find({ _id: { $in: blockedIds } })
      .select(USER_FIELDS)
      .lean();

    return res.json({
      users: users.map((user) => publicUser(user, req.user.id)),
      total: blockedIds.length
    });
  } catch (error) {
    console.error("LIST_BLOCKS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo bloqueos" });
  }
});

router.post("/blocks/:userId", auth, requireUser, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!validId(userId)) {
      return res.status(400).json({ error: "ID de usuario inválido" });
    }

    if (String(userId) === String(req.user.id)) {
      return res.status(400).json({ error: "No puedes bloquearte a ti mismo" });
    }

    const target = await User.findById(userId).select("_id").lean();

    if (!target) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    await Block.updateOne(
      { blocker: req.user.id, blocked: userId },
      { $setOnInsert: { blocker: req.user.id, blocked: userId } },
      { upsert: true }
    );

    // Un bloqueo termina el seguimiento en ambas direcciones para que
    // no queden relaciones incoherentes (seguir a quien bloqueaste).
    await Promise.all([
      User.updateOne(
        { _id: req.user.id },
        { $pull: { following: userId, followers: userId } }
      ),
      User.updateOne(
        { _id: userId },
        { $pull: { following: req.user.id, followers: req.user.id } }
      )
    ]);

    return res.json({ userId: String(userId), blocked: true });
  } catch (error) {
    console.error("BLOCK_USER_ERROR:", error);
    return res.status(500).json({ error: "Error bloqueando usuario" });
  }
});

router.delete("/blocks/:userId", auth, requireUser, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!validId(userId)) {
      return res.status(400).json({ error: "ID de usuario inválido" });
    }

    await Block.deleteOne({
      blocker: req.user.id,
      blocked: userId
    });

    return res.json({ userId: String(userId), blocked: false });
  } catch (error) {
    console.error("UNBLOCK_USER_ERROR:", error);
    return res.status(500).json({ error: "Error desbloqueando usuario" });
  }
});

// ---------------------------------------------------------------
// Silencios
// ---------------------------------------------------------------

router.get("/mutes", auth, requireUser, async (req, res) => {
  try {
    const mutedIds = await getMutedUserIds(req.user.id);
    const users = await User.find({ _id: { $in: mutedIds } })
      .select(USER_FIELDS)
      .lean();

    return res.json({
      users: users.map((user) => publicUser(user, req.user.id)),
      total: mutedIds.length
    });
  } catch (error) {
    console.error("LIST_MUTES_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo silenciados" });
  }
});

router.post("/mutes/:userId", auth, requireUser, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!validId(userId)) {
      return res.status(400).json({ error: "ID de usuario inválido" });
    }

    if (String(userId) === String(req.user.id)) {
      return res.status(400).json({ error: "No puedes silenciarte a ti mismo" });
    }

    const target = await User.findById(userId).select("_id").lean();

    if (!target) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    await Mute.updateOne(
      { muter: req.user.id, muted: userId },
      { $setOnInsert: { muter: req.user.id, muted: userId } },
      { upsert: true }
    );

    return res.json({ userId: String(userId), muted: true });
  } catch (error) {
    console.error("MUTE_USER_ERROR:", error);
    return res.status(500).json({ error: "Error silenciando usuario" });
  }
});

router.delete("/mutes/:userId", auth, requireUser, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!validId(userId)) {
      return res.status(400).json({ error: "ID de usuario inválido" });
    }

    await Mute.deleteOne({ muter: req.user.id, muted: userId });

    return res.json({ userId: String(userId), muted: false });
  } catch (error) {
    console.error("UNMUTE_USER_ERROR:", error);
    return res.status(500).json({ error: "Error quitando silencio" });
  }
});

// ---------------------------------------------------------------
// Publicaciones ocultas
// ---------------------------------------------------------------

router.get("/hidden", auth, requireUser, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const [records, total] = await Promise.all([
      HiddenPost.find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      HiddenPost.countDocuments({ user: req.user.id })
    ]);

    const posts = await Post.find({
      _id: { $in: records.map((record) => record.post) }
    })
      .populate("author", "username displayName avatar")
      .lean();

    const byId = new Map(
      posts.map((post) => [String(post._id), post])
    );

    const normalized = records
      .map((record) => byId.get(String(record.post)))
      .filter(Boolean)
      .map((post) => normalizePost(post, req.user.id));

    return res.json({
      posts: normalized,
      total,
      page,
      limit,
      hasMore: skip + records.length < total
    });
  } catch (error) {
    console.error("LIST_HIDDEN_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo ocultas" });
  }
});

router.post("/hidden/:postId", auth, requireUser, async (req, res) => {
  try {
    const { postId } = req.params;

    if (!validId(postId)) {
      return res.status(400).json({ error: "ID de publicación inválido" });
    }

    const post = await Post.findById(postId).select("_id").lean();

    if (!post) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }

    await HiddenPost.updateOne(
      { user: req.user.id, post: postId },
      { $setOnInsert: { user: req.user.id, post: postId } },
      { upsert: true }
    );

    return res.json({ postId: String(postId), hidden: true });
  } catch (error) {
    console.error("HIDE_POST_ERROR:", error);
    return res.status(500).json({ error: "Error ocultando publicación" });
  }
});

router.delete("/hidden/:postId", auth, requireUser, async (req, res) => {
  try {
    const { postId } = req.params;

    if (!validId(postId)) {
      return res.status(400).json({ error: "ID de publicación inválido" });
    }

    await HiddenPost.deleteOne({ user: req.user.id, post: postId });

    return res.json({ postId: String(postId), hidden: false });
  } catch (error) {
    console.error("UNHIDE_POST_ERROR:", error);
    return res.status(500).json({ error: "Error restaurando publicación" });
  }
});

// ---------------------------------------------------------------
// Reportes
// ---------------------------------------------------------------

router.post("/reports", auth, requireUser, async (req, res) => {
  try {
    const targetType =
      typeof req.body?.targetType === "string"
        ? req.body.targetType.trim()
        : "";
    const targetId =
      typeof req.body?.targetId === "string"
        ? req.body.targetId.trim()
        : "";
    const reason =
      typeof req.body?.reason === "string"
        ? req.body.reason.trim()
        : "";
    const details =
      typeof req.body?.details === "string"
        ? req.body.details.trim()
        : "";

    if (!REPORT_TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({ error: "Tipo de reporte no válido" });
    }

    if (!validId(targetId)) {
      return res.status(400).json({ error: "ID reportado no válido" });
    }

    if (!REPORT_REASONS.includes(reason)) {
      return res.status(400).json({ error: "Motivo de reporte no válido" });
    }

    if (details.length > MAX_DETAILS_LENGTH) {
      return res.status(400).json({
        error: `Los detalles no pueden superar ${MAX_DETAILS_LENGTH} caracteres`
      });
    }

    let targetOwner = null;

    if (targetType === "user") {
      const user = await User.findById(targetId).select("_id").lean();

      if (!user) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      targetOwner = user._id;
    } else if (targetType === "post") {
      const post = await Post.findById(targetId).select("author").lean();

      if (!post) {
        return res.status(404).json({ error: "Publicación no encontrada" });
      }

      targetOwner = post.author;
    } else {
      const post = await Post.findOne({ "comments._id": targetId })
        .select("author comments")
        .lean();

      if (!post) {
        return res.status(404).json({ error: "Comentario no encontrado" });
      }

      const comment = (post.comments || []).find(
        (item) => String(item._id) === String(targetId)
      );

      targetOwner = comment ? comment.user : post.author;
    }

    if (String(targetOwner) === String(req.user.id)) {
      return res.status(400).json({ error: "No puedes reportarte a ti mismo" });
    }

    const existing = await Report.findOne({
      reporter: req.user.id,
      targetType,
      targetId,
      status: { $in: ["pending", "reviewing"] }
    })
      .select("_id")
      .lean();

    if (existing) {
      return res.status(409).json({
        error: "Ya reportaste este contenido y está en revisión",
        code: "REPORT_DUPLICATE",
        reportId: String(existing._id)
      });
    }

    const report = await Report.create({
      reporter: req.user.id,
      targetType,
      targetId,
      targetOwner,
      reason,
      details
    });

    return res.status(201).json({
      report: {
        _id: report._id,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt
      }
    });
  } catch (error) {
    console.error("CREATE_REPORT_ERROR:", error);
    return res.status(500).json({ error: "Error enviando el reporte" });
  }
});

router.get("/reports", auth, requireUser, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { reporter: req.user.id };
    const [reports, total] = await Promise.all([
      Report.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Report.countDocuments(filter)
    ]);

    return res.json({
      reports,
      total,
      page,
      limit,
      hasMore: skip + reports.length < total
    });
  } catch (error) {
    console.error("LIST_REPORTS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo reportes" });
  }
});

router.get(
  "/reports/queue",
  auth,
  requireUser,
  requireModerator,
  async (req, res) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const status =
        typeof req.query.status === "string" && req.query.status.trim()
          ? req.query.status.trim()
          : "";

      if (status && !REPORT_STATUSES.includes(status)) {
        return res.status(400).json({ error: "Estado no válido" });
      }

      const filter = status ? { status } : {};
      const [reports, total] = await Promise.all([
        Report.find(filter)
          .sort({ status: 1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate("reporter", "username displayName avatar")
          .populate("targetOwner", "username displayName avatar")
          .lean(),
        Report.countDocuments(filter)
      ]);

      return res.json({
        reports,
        total,
        page,
        limit,
        hasMore: skip + reports.length < total
      });
    } catch (error) {
      console.error("REPORT_QUEUE_ERROR:", error);
      return res.status(500).json({ error: "Error obteniendo la cola" });
    }
  }
);

router.patch(
  "/reports/:reportId",
  auth,
  requireUser,
  requireModerator,
  async (req, res) => {
    try {
      const { reportId } = req.params;

      if (!validId(reportId)) {
        return res.status(400).json({ error: "ID de reporte inválido" });
      }

      const status =
        typeof req.body?.status === "string" ? req.body.status.trim() : "";
      const note =
        typeof req.body?.resolutionNote === "string"
          ? req.body.resolutionNote.trim()
          : "";

      if (!REPORT_STATUSES.includes(status)) {
        return res.status(400).json({ error: "Estado no válido" });
      }

      if (note.length > MAX_NOTE_LENGTH) {
        return res.status(400).json({
          error: `La nota no puede superar ${MAX_NOTE_LENGTH} caracteres`
        });
      }

      const update = {
        status,
        resolvedBy: req.user.id,
        resolutionNote: note
      };

      if (status === "resolved" || status === "dismissed") {
        update.resolvedAt = new Date();
      }

      const report = await Report.findByIdAndUpdate(reportId, update, {
        new: true
      }).lean();

      if (!report) {
        return res.status(404).json({ error: "Reporte no encontrado" });
      }

      return res.json({ report });
    } catch (error) {
      console.error("UPDATE_REPORT_ERROR:", error);
      return res.status(500).json({ error: "Error actualizando el reporte" });
    }
  }
);

// ---------------------------------------------------------------
// Moderación global de publicaciones (solo moderadores)
// ---------------------------------------------------------------

router.post(
  "/posts/:postId/hide",
  auth,
  requireUser,
  requireModerator,
  async (req, res) => {
    try {
      const { postId } = req.params;

      if (!validId(postId)) {
        return res.status(400).json({ error: "ID de publicación inválido" });
      }

      const reason =
        typeof req.body?.reason === "string"
          ? req.body.reason.trim().slice(0, 500)
          : "";

      const post = await Post.findByIdAndUpdate(
        postId,
        {
          $set: {
            "moderation.hidden": true,
            "moderation.reason": reason,
            "moderation.hiddenBy": req.user.id,
            "moderation.hiddenAt": new Date()
          }
        },
        { new: true }
      )
        .select("_id author moderation")
        .lean();

      if (!post) {
        return res.status(404).json({ error: "Publicación no encontrada" });
      }

      if (String(post.author) !== String(req.user.id)) {
        await createNotification({
          recipient: post.author,
          actor: req.user.id,
          type: "moderation",
          post: post._id,
          io: req.app.get("io")
        }).catch(() => {});
      }

      return res.json({
        postId: String(postId),
        hidden: true,
        moderation: post.moderation
      });
    } catch (error) {
      console.error("MODERATE_HIDE_POST_ERROR:", error);
      return res
        .status(500)
        .json({ error: "Error ocultando la publicación" });
    }
  }
);

router.delete(
  "/posts/:postId/hide",
  auth,
  requireUser,
  requireModerator,
  async (req, res) => {
    try {
      const { postId } = req.params;

      if (!validId(postId)) {
        return res.status(400).json({ error: "ID de publicación inválido" });
      }

      const post = await Post.findByIdAndUpdate(
        postId,
        {
          $set: {
            "moderation.hidden": false,
            "moderation.reason": "",
            "moderation.hiddenBy": null,
            "moderation.hiddenAt": null
          }
        },
        { new: true }
      )
        .select("_id moderation")
        .lean();

      if (!post) {
        return res.status(404).json({ error: "Publicación no encontrada" });
      }

      return res.json({
        postId: String(postId),
        hidden: false,
        moderation: post.moderation
      });
    } catch (error) {
      console.error("MODERATE_RESTORE_POST_ERROR:", error);
      return res
        .status(500)
        .json({ error: "Error restaurando la publicación" });
    }
  }
);

/** Resumen para la pantalla de moderación. */
router.get("/overview", auth, requireUser, async (req, res) => {
  try {
    const [blocks, mutes, hidden, reports] = await Promise.all([
      Block.countDocuments({ blocker: req.user.id }),
      Mute.countDocuments({ muter: req.user.id }),
      HiddenPost.countDocuments({ user: req.user.id }),
      Report.countDocuments({ reporter: req.user.id })
    ]);

    const user = await User.findById(req.user.id).select("role").lean();

    return res.json({
      blocks,
      mutes,
      hidden,
      reports,
      isModerator: isModerator(user)
    });
  } catch (error) {
    console.error("MODERATION_OVERVIEW_ERROR:", error);
    return res
      .status(500)
      .json({ error: "Error obteniendo el resumen de moderación" });
  }
});

module.exports = router;

const express = require("express");
const mongoose = require("mongoose");

const SeenPost = require("./SeenPost");
const FeedSignal = require("./FeedSignal");
const Post = require("../posts/Post");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { feedConstraints } = require("../moderation/moderation.service");
const { withAudienceFilter } = require("../posts/audience.service");
const {
  getFeedPreferences,
  applyFeedPreferences,
  normalizeFeedPosts
} = require("../posts/posts.routes");

const router = express.Router();

const DEFAULT_SESSION = 8;
const MAX_SESSION = 20;

function validId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

/**
 * PULSO — sesión finita (Fase 6).
 *
 * Alternativa al scroll infinito: una sesión entrega hasta `limit`
 * publicaciones NO vistas, elegidas con las preferencias del usuario,
 * priorizando las señales "more" y excluyendo las "less". El cliente
 * marca cada publicación como vista al consumirla; la sesión termina
 * cuando no queda nada pendiente.
 */
router.get("/", auth, requireUser, async (req, res) => {
  try {
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_SESSION;
    if (limit > MAX_SESSION) limit = MAX_SESSION;

    const preferences = await getFeedPreferences(req.user.id);
    const [seen, signals] = await Promise.all([
      SeenPost.find({ user: req.user.id }).select("post").lean(),
      FeedSignal.find({ user: req.user.id }).lean()
    ]);
    const seenIds = seen.map((item) => item.post);
    const lessTags = signals.filter((signal) => signal.direction === "less").map((signal) => signal.tag);
    const moreTags = signals.filter((signal) => signal.direction === "more").map((signal) => signal.tag);

    const base = applyFeedPreferences(await feedConstraints(req.user.id), req.user.id, preferences);
    const pulsoFilter = {
      ...base,
      ...(seenIds.length ? { _id: { $nin: seenIds } } : {}),
      ...(lessTags.length ? { hashtags: { $nin: lessTags } } : {})
    };
    const visibleFilter = await withAudienceFilter(pulsoFilter, req.user.id);

    // Las señales "more" encabenzan la sesión cuando existen candidatos.
    const prioritized = moreTags.length
      ? await Post.find({ ...visibleFilter, hashtags: { $in: moreTags } })
        .populate("author", "username displayName avatar")
        .populate("comments.user", "username displayName avatar")
        .populate({ path: "lineage.derivedFrom", select: "author", populate: { path: "author", select: "username displayName" } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
      : [];

    const remaining = limit - prioritized.length;
    let rest = [];
    if (remaining > 0) {
      const excludeIds = [
        ...seenIds,
        ...prioritized.map((post) => post._id)
      ];
      const restFilter = await withAudienceFilter({
        ...base,
        ...(lessTags.length ? { hashtags: { $nin: lessTags } } : {}),
        ...(excludeIds.length ? { _id: { $nin: excludeIds } } : {})
      }, req.user.id);
      rest = await Post.find(restFilter)
        .populate("author", "username displayName avatar")
        .populate("comments.user", "username displayName avatar")
        .populate({ path: "lineage.derivedFrom", select: "author", populate: { path: "author", select: "username displayName" } })
        .sort({ createdAt: -1 })
        .limit(remaining)
        .lean();
    }

    const posts = [...prioritized, ...rest];

    return res.status(200).json({
      posts: normalizeFeedPosts(posts, req.user.id, preferences),
      sessionSize: posts.length,
      limit,
      // `completed` es real: no hay nada más elegible sin repetir.
      completed: posts.length === 0,
      moreTags,
      lessTags
    });
  } catch (error) {
    console.error("GET_PULSE_ERROR:", error);
    return res.status(500).json({ error: "Error construyendo tu Pulso" });
  }
});

// ---------- Marcar como vista (idempotente) ----------

router.post("/seen/:postId", auth, requireUser, async (req, res) => {
  try {
    if (!validId(req.params.postId)) return res.status(400).json({ error: "ID de publicación inválido" });
    const post = await Post.exists({ _id: req.params.postId });
    if (!post) return res.status(404).json({ error: "La publicación no existe" });
    await SeenPost.updateOne(
      { user: req.user.id, post: req.params.postId },
      { $setOnInsert: { user: req.user.id, post: req.params.postId, seenAt: new Date() } },
      { upsert: true }
    );
    return res.json({ seen: true });
  } catch (error) {
    console.error("PULSE_SEEN_ERROR:", error);
    return res.status(500).json({ error: "Error marcando la publicación como vista" });
  }
});

// ---------- Señal más/menos de esto ----------

router.post("/signal", auth, requireUser, async (req, res) => {
  try {
    const postId = typeof req.body?.postId === "string" ? req.body.postId.trim() : "";
    const direction = req.body?.direction === "more" ? "more" : req.body?.direction === "less" ? "less" : "";
    if (!validId(postId)) return res.status(400).json({ error: "ID de publicación inválido" });
    if (!direction) return res.status(400).json({ error: "La señal debe ser more o less" });

    const post = await Post.findById(postId).select("hashtags").lean();
    if (!post) return res.status(404).json({ error: "La publicación no existe" });
    const tags = (Array.isArray(post.hashtags) ? post.hashtags : []).filter((tag) => typeof tag === "string" && tag.trim());
    if (!tags.length) {
      return res.status(409).json({ error: "Esta publicación no tiene temas para calificar" });
    }

    for (const tag of tags) {
      await FeedSignal.updateOne(
        { user: req.user.id, tag: tag.toLowerCase() },
        { $set: { direction } },
        { upsert: true }
      );
    }

    return res.json({ signaled: true, tags, direction });
  } catch (error) {
    console.error("PULSE_SIGNAL_ERROR:", error);
    return res.status(500).json({ error: "Error guardando tu preferencia" });
  }
});

// ---------- Mis señales (transparencia) ----------

router.get("/signals", auth, requireUser, async (req, res) => {
  try {
    const signals = await FeedSignal.find({ user: req.user.id }).sort({ createdAt: -1 }).lean();
    return res.json({ signals });
  } catch (error) {
    console.error("PULSE_SIGNALS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo tus preferencias" });
  }
});

module.exports = router;
module.exports.DEFAULT_SESSION = DEFAULT_SESSION;
module.exports.MAX_SESSION = MAX_SESSION;

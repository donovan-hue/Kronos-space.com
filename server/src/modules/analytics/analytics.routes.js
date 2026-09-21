const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const User = require("../users/User");
const Post = require("../posts/Post");

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;
const TIMELINE_DAYS = 14;
const TOP_POSTS_LIMIT = 5;

function parseWindowDays(raw) {
  const value = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_WINDOW_DAYS;
  return Math.min(value, MAX_WINDOW_DAYS);
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function excerpt(text, length = 120) {
  const value = typeof text === "string" ? text.trim() : "";
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

/**
 * FASE 8 — analítica PRIVADA de creador.
 *
 * Cada persona ve únicamente las métricas de su propia obra: la ventana
 * por defecto son 30 días y las interacciones se cuentan sobre las
 * publicaciones creadas dentro de la ventana (documentado en la UI).
 * No hay rutas públicas ni de administrador: la analítica no es un
 * ranking, es un espejo.
 */
router.get("/creator", auth, requireUser, async (req, res) => {
  try {
    const days = parseWindowDays(req.query.days);
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const [user, posts] = await Promise.all([
      User.findById(req.user.id).select("followers").lean(),
      Post.find({ author: req.user.id, createdAt: { $gte: from, $lte: to } })
        .select("content media likes comments savedBy createdAt")
        .sort({ createdAt: -1 })
        .lean()
    ]);

    const postIds = posts.map((post) => post._id);
    const remixesReceived = postIds.length
      ? await Post.countDocuments({ "lineage.derivedFrom": { $in: postIds } })
      : 0;

    const totals = {
      posts: posts.length,
      likes: 0,
      comments: 0,
      saves: 0,
      remixes: remixesReceived
    };

    const ranked = posts.map((post) => {
      const likes = Array.isArray(post.likes) ? post.likes.length : 0;
      const comments = Array.isArray(post.comments) ? post.comments.length : 0;
      const saves = Array.isArray(post.savedBy) ? post.savedBy.length : 0;
      totals.likes += likes;
      totals.comments += comments;
      totals.saves += saves;
      return {
        _id: post._id,
        content: excerpt(post.content),
        mediaUrl: post.media?.url || "",
        likes,
        comments,
        saves,
        interactions: likes + comments + saves,
        createdAt: post.createdAt
      };
    });

    // Serie de los últimos TIMELINE_DAYS días (independiente de la
    // ventana): publicaciones e interacciones por día.
    const timelineFrom = new Date(to.getTime() - (TIMELINE_DAYS - 1) * 24 * 60 * 60 * 1000);
    timelineFrom.setUTCHours(0, 0, 0, 0);
    const timeline = [];
    const byDay = new Map();
    for (let index = 0; index < TIMELINE_DAYS; index += 1) {
      const date = new Date(timelineFrom.getTime() + index * 24 * 60 * 60 * 1000);
      const key = dayKey(date);
      const bucket = { date: key, posts: 0, interactions: 0 };
      timeline.push(bucket);
      byDay.set(key, bucket);
    }
    for (const post of ranked) {
      const key = dayKey(new Date(post.createdAt));
      const bucket = byDay.get(key);
      if (!bucket) continue;
      bucket.posts += 1;
      bucket.interactions += post.interactions;
    }

    const topPosts = [...ranked]
      .sort((a, b) => b.interactions - a.interactions || new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, TOP_POSTS_LIMIT);

    return res.json({
      window: { from: from.toISOString(), to: to.toISOString(), days },
      followers: Array.isArray(user?.followers) ? user.followers.length : 0,
      totals,
      timeline,
      topPosts,
      scope: "Publicaciones creadas en la ventana; interacciones contadas sobre esas publicaciones."
    });
  } catch (error) {
    console.error("CREATOR_ANALYTICS_ERROR:", error);
    return res.status(500).json({ error: "Error calculando tu analítica" });
  }
});

module.exports = router;
module.exports.DEFAULT_WINDOW_DAYS = DEFAULT_WINDOW_DAYS;
module.exports.MAX_WINDOW_DAYS = MAX_WINDOW_DAYS;
module.exports.TIMELINE_DAYS = TIMELINE_DAYS;
module.exports.TOP_POSTS_LIMIT = TOP_POSTS_LIMIT;

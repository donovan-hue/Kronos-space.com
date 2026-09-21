const mongoose = require("mongoose");
const User = require("../users/User");

const AUDIENCE_TYPES = ["public", "followers", "private"];

function normalizeAudience(value) {
  const rawType = typeof value === "string" ? value : value?.type;
  const type = typeof rawType === "string" ? rawType.trim().toLowerCase() : "";
  if (!AUDIENCE_TYPES.includes(type)) return null;
  return { type };
}

function publicAudienceFilter() {
  return {
    $or: [
      { "audience.type": { $exists: false } },
      { "audience.type": "public" }
    ]
  };
}

async function viewerFollowing(viewerId) {
  // Contract tests and health-only processes intentionally run without Mongo;
  // audience queries must not buffer for ten seconds there. In production the
  // app connects before serving authenticated data.
  if (mongoose.connection.readyState !== 1) return [];
  const viewer = await User.findById(viewerId).select("following").lean();
  return Array.isArray(viewer?.following) ? viewer.following : [];
}

/**
 * Añade al filtro únicamente publicaciones que el visor puede descubrir.
 * Los documentos históricos sin audience siguen siendo públicos.
 */
async function withAudienceFilter(filter, viewerId) {
  const following = await viewerFollowing(viewerId);
  const viewer = new mongoose.Types.ObjectId(viewerId);
  return {
    ...filter,
    $and: [
      ...(Array.isArray(filter.$and) ? filter.$and : []),
      {
        $or: [
          ...publicAudienceFilter().$or,
          { author: viewer },
          {
            $and: [
              { "audience.type": "followers" },
              { author: { $in: following } }
            ]
          }
        ]
      }
    ]
  };
}

async function canViewPost(post, viewerId) {
  const authorId = post?.author?._id || post?.author;
  if (String(authorId) === String(viewerId)) return true;
  const type = post?.audience?.type || "public";
  if (type === "public") return true;
  if (type === "private") return false;
  if (type !== "followers") return false;
  const following = await viewerFollowing(viewerId);
  return following.some((id) => String(id) === String(authorId));
}

module.exports = {
  AUDIENCE_TYPES,
  normalizeAudience,
  publicAudienceFilter,
  withAudienceFilter,
  canViewPost
};

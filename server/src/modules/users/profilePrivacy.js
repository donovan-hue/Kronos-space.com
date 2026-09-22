const PRIVACY_KEYS = ["showBio", "showFollowCounts", "discoverable"];

function normalizePrivacy(value = {}) {
  return Object.fromEntries(PRIVACY_KEYS.map(key => [key, value?.[key] !== false]));
}

function privacyUpdates(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (!keys.length || keys.some(key => !PRIVACY_KEYS.includes(key) || typeof body[key] !== "boolean")) return null;
  return Object.fromEntries(keys.map(key => [`profilePrivacy.${key}`, body[key]]));
}

function publicUser(user, viewerId, flags = {}) {
  const privacy = normalizePrivacy(user.profilePrivacy);
  const owner = String(user._id) === String(viewerId);
  const followers = Array.isArray(user.followers) ? user.followers : [];
  const following = Array.isArray(user.following) ? user.following : [];
  const countsVisible = owner || privacy.showFollowCounts;
  return {
    _id: user._id, username: user.username,
    displayName: user.displayName || "",
    avatar: user.avatar || "",
    cover: user.cover || "",
    bio: owner || privacy.showBio ? user.bio || "" : "",
    createdAt: user.createdAt,
    followersCount: countsVisible ? followers.length : null,
    followingCount: countsVisible ? following.length : null,
    isFollowing: followers.some(id => String(id) === String(viewerId)),
    // KRONOS-UI-011 — estado de moderación relativo al visitante.
    blockedByMe: Boolean(flags.blockedByMe),
    mutedByMe: Boolean(flags.mutedByMe)
  };
}

/**
 * Conteos de seguimiento SIN cargar los arrays completos.
 *
 * `followers`/`following` crecen sin cota: traerlos enteros para contar
 * rompe con usuarios grandes (documentos de MBs, respuestas pesadas).
 * Esta agregación calcula tamaños + `isFollowing` en la base con una
 * sola consulta para N usuarios.
 *
 * @returns {Map<string, { followersCount: number, followingCount: number, isFollowing: boolean }>}
 */
async function getFollowStats(UserModel, userIds, viewerId) {
  const ids = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
  const stats = new Map();
  for (const id of ids) {
    stats.set(id, { followersCount: 0, followingCount: 0, isFollowing: false });
  }
  if (!ids.length) return stats;

  const mongoose = require("mongoose");
  const objectIds = ids
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!objectIds.length) return stats;

  let viewerObjectId = null;
  try {
    if (viewerId && mongoose.isValidObjectId(viewerId)) {
      viewerObjectId = new mongoose.Types.ObjectId(viewerId);
    }
  } catch {
    viewerObjectId = null;
  }

  const rows = await UserModel.aggregate([
    { $match: { _id: { $in: objectIds } } },
    {
      $project: {
        followersCount: { $size: { $ifNull: ["$followers", []] } },
        followingCount: { $size: { $ifNull: ["$following", []] } },
        isFollowing: viewerObjectId
          ? { $in: [viewerObjectId, { $ifNull: ["$followers", []] }] }
          : { $literal: false }
      }
    }
  ]);

  for (const row of rows) {
    stats.set(String(row._id), {
      followersCount: row.followersCount || 0,
      followingCount: row.followingCount || 0,
      isFollowing: Boolean(row.isFollowing)
    });
  }
  return stats;
}

/**
 * Variante de `publicUser` que usa conteos precalculados (ver
 * `getFollowStats`) en lugar de los arrays. Mismo contrato de respuesta.
 */
function publicUserWithStats(user, stats = {}, viewerId, flags = {}) {
  const privacy = normalizePrivacy(user.profilePrivacy);
  const owner = String(user._id) === String(viewerId);
  const countsVisible = owner || privacy.showFollowCounts;
  const followersCount = Number.isFinite(stats.followersCount) ? stats.followersCount : 0;
  const followingCount = Number.isFinite(stats.followingCount) ? stats.followingCount : 0;
  return {
    _id: user._id, username: user.username,
    displayName: user.displayName || "",
    avatar: user.avatar || "",
    cover: user.cover || "",
    bio: owner || privacy.showBio ? user.bio || "" : "",
    createdAt: user.createdAt,
    followersCount: countsVisible ? followersCount : null,
    followingCount: countsVisible ? followingCount : null,
    isFollowing: owner ? false : Boolean(stats.isFollowing),
    blockedByMe: Boolean(flags.blockedByMe),
    mutedByMe: Boolean(flags.mutedByMe)
  };
}

module.exports = {
  normalizePrivacy,
  privacyUpdates,
  publicUser,
  getFollowStats,
  publicUserWithStats
};

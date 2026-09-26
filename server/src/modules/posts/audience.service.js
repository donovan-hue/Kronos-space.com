const mongoose = require("mongoose");
const User = require("../users/User");
const Circle = require("../circles/Circle");
const Orbit = require("../orbits/Orbit");

const AUDIENCE_TYPES = ["public", "followers", "private", "circle", "orbit"];

function normalizeAudience(value) {
  const rawType = typeof value === "string" ? value : value?.type;
  const type = typeof rawType === "string" ? rawType.trim().toLowerCase() : "";
  if (!AUDIENCE_TYPES.includes(type)) return null;
  if (type !== "circle" && type !== "orbit") return { type };
  const key = type === "circle" ? "circleId" : "orbitId";
  const id = typeof value?.[key] === "string" ? value[key].trim() : "";
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return { type, [key]: id };
}

function publicAudienceFilter() {
  return {
    $or: [
      { "audience.type": { $exists: false } },
      { "audience.type": "public" }
    ]
  };
}

function connected() {
  return mongoose.connection.readyState === 1;
}

async function viewerFollowing(viewerId) {
  if (!connected()) return [];
  const viewer = await User.findById(viewerId).select("following").lean();
  return Array.isArray(viewer?.following) ? viewer.following : [];
}

async function viewerCircleIds(viewerId) {
  if (!connected()) return [];
  const circles = await Circle.find({
    $or: [{ owner: viewerId }, { members: viewerId }]
  }).select("_id").lean();
  return circles.map((circle) => circle._id);
}

async function viewerOrbitIds(viewerId) {
  if (!connected()) return [];
  const orbits = await Orbit.find({
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      { $or: [{ visibility: "public" }, { owner: viewerId }, { "members.user": viewerId }] }
    ]
  }).select("_id").lean();
  return orbits.map((orbit) => orbit._id);
}

/**
 * Contexto de visibilidad del espectador, resuelto UNA sola vez.
 *
 * Antes cada endpoint de feed resolvía lo mismo varias veces por petición:
 * `getFeedPreferences` leía el usuario, `withAudienceFilter` volvía a leerlo
 * para `following`, y después `canViewPost` repetía círculos y órbitas por
 * cada publicación. Con el ámbito precargado, una página de feed hace tres
 * consultas de contexto en lugar de tres por publicación.
 *
 * `select` incluye `preferences.feed` para que el mismo documento sirva a la
 * preferencia de feed sin una segunda lectura del usuario.
 *
 * @param {string} viewerId
 * @returns {Promise<{viewerId:string, viewer:object|null, following:Array, followingIds:Set<string>, circleIds:Set<string>, orbitIds:Set<string>}>}
 */
async function loadViewerScope(viewerId) {
  const empty = {
    viewerId: String(viewerId || ""),
    viewer: null,
    following: [],
    followingIds: new Set(),
    circleIds: new Set(),
    orbitIds: new Set()
  };

  if (!viewerId || !connected()) return empty;

  const [viewer, circles, orbits] = await Promise.all([
    User.findById(viewerId).select("following preferences.feed").lean(),
    Circle.find({ $or: [{ owner: viewerId }, { members: viewerId }] }).select("_id").lean(),
    Orbit.find({
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
        { $or: [{ visibility: "public" }, { owner: viewerId }, { "members.user": viewerId }] }
      ]
    }).select("_id").lean()
  ]);

  const following = Array.isArray(viewer?.following) ? viewer.following : [];

  return {
    viewerId: String(viewerId),
    viewer: viewer || null,
    following,
    followingIds: new Set(following.map((id) => String(id))),
    circleIds: new Set(circles.map((circle) => String(circle._id))),
    orbitIds: new Set(orbits.map((orbit) => String(orbit._id)))
  };
}

/**
 * Filtro de audiencia para consultas de feed.
 * Acepta un ámbito precargado (`loadViewerScope`) para no repetir lecturas.
 */
async function withAudienceFilter(filter, viewerId, scope = null) {
  const resolved = scope || (await loadViewerScope(viewerId));
  const viewer = new mongoose.Types.ObjectId(viewerId);
  const circleIds = [...resolved.circleIds].map((id) => new mongoose.Types.ObjectId(id));
  const orbitIds = [...resolved.orbitIds].map((id) => new mongoose.Types.ObjectId(id));

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
              { author: { $in: resolved.following } }
            ]
          },
          ...(circleIds.length ? [{ "audience.type": "circle", "audience.circleId": { $in: circleIds } }] : []),
          ...(orbitIds.length ? [{ "audience.type": "orbit", "audience.orbitId": { $in: orbitIds } }] : [])
        ]
      }
    ]
  };
}

/**
 * Decisión de visibilidad sin tocar la base: usa el ámbito precargado.
 * Aplica exactamente las mismas reglas que `canViewPost`.
 */
function canViewPostWithScope(post, scope) {
  const authorId = String(post?.author?._id || post?.author || "");
  if (authorId && authorId === String(scope.viewerId)) return true;

  const type = post?.audience?.type || "public";
  if (type === "public") return true;
  if (type === "private") return false;
  if (type === "followers") return scope.followingIds.has(authorId);
  if (type === "circle") {
    const circleId = post?.audience?.circleId;
    return Boolean(circleId) && scope.circleIds.has(String(circleId));
  }
  if (type === "orbit") {
    const orbitId = post?.audience?.orbitId;
    return Boolean(orbitId) && scope.orbitIds.has(String(orbitId));
  }

  return false;
}

/**
 * Visibilidad de una publicación suelta. Mantiene la firma histórica; cuando
 * ya existe un ámbito cargado conviene pasarlo para evitar consultas.
 */
async function canViewPost(post, viewerId, scope = null) {
  const authorId = post?.author?._id || post?.author;
  if (String(authorId) === String(viewerId)) return true;

  const type = post?.audience?.type || "public";
  if (type === "public") return true;
  if (type === "private") return false;

  if (scope) return canViewPostWithScope(post, scope);

  if (type === "followers") {
    const following = await viewerFollowing(viewerId);
    return following.some((id) => String(id) === String(authorId));
  }
  if (type === "circle" && post?.audience?.circleId) {
    if (!connected()) return false;
    return Boolean(await Circle.exists({
      _id: post.audience.circleId,
      $or: [{ owner: viewerId }, { members: viewerId }]
    }));
  }
  if (type !== "orbit" || !post?.audience?.orbitId || !connected()) return false;
  return Boolean(await Orbit.exists({
    _id: post.audience.orbitId,
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      { $or: [{ visibility: "public" }, { owner: viewerId }, { "members.user": viewerId }] }
    ]
  }));
}

module.exports = {
  AUDIENCE_TYPES,
  normalizeAudience,
  publicAudienceFilter,
  loadViewerScope,
  withAudienceFilter,
  canViewPost,
  canViewPostWithScope
};

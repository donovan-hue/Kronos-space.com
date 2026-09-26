const mongoose = require("mongoose");
const Block = require("./Block");
const Mute = require("./Mute");
const HiddenPost = require("./HiddenPost");

/**
 * KRONOS-UI-011 — efectos reales de bloqueo, silencio y ocultamiento.
 *
 * Un solo lugar decide qué se excluye de cada consulta para no repetir
 * lógica en posts, usuarios, mensajes y notificaciones.
 *
 * Límites deliberados: las listas de exclusión se acotan para que un
 * usuario con cientos de relaciones no genere consultas enormes; la
 * UI de moderación muestra el conteo real, así que un recorte no
 * "inventa" datos, solo acota el filtro del feed.
 */

const MAX_RELATIONS = 500;
const MAX_HIDDEN_POSTS = 300;

function toObjectId(value) {
  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }

  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }

  return new mongoose.Types.ObjectId(value);
}

function isModerator(user) {
  return Boolean(user && user.role === "admin");
}

async function getBlockedUserIds(userId) {
  if (!userId) return [];

  const docs = await Block.find({ blocker: userId })
    .select("blocked")
    .limit(MAX_RELATIONS)
    .lean();

  return docs.map((doc) => doc.blocked);
}

async function getBlockingUserIds(userId) {
  if (!userId) return [];

  const docs = await Block.find({ blocked: userId })
    .select("blocker")
    .limit(MAX_RELATIONS)
    .lean();

  return docs.map((doc) => doc.blocker);
}

/** Usuarios cuyo contenido no debe aparecerle a `userId` (ambas direcciones). */
async function getExcludedUserIds(userId) {
  if (!userId) return [];

  const [blocked, blockers] = await Promise.all([
    getBlockedUserIds(userId),
    getBlockingUserIds(userId)
  ]);

  const unique = new Map();

  for (const id of [...blocked, ...blockers]) {
    unique.set(String(id), id);
  }

  return [...unique.values()];
}

async function getMutedUserIds(userId) {
  if (!userId) return [];

  const docs = await Mute.find({ muter: userId })
    .select("muted")
    .limit(MAX_RELATIONS)
    .lean();

  return docs.map((doc) => doc.muted);
}

async function getHiddenPostIds(userId) {
  if (!userId) return [];

  const docs = await HiddenPost.find({ user: userId })
    .select("post")
    .sort({ createdAt: -1 })
    .limit(MAX_HIDDEN_POSTS)
    .lean();

  return docs.map((doc) => doc.post);
}

async function hasBlocked(blockerId, blockedId) {
  if (!blockerId || !blockedId) return false;

  const blocker = toObjectId(blockerId);
  const blocked = toObjectId(blockedId);

  if (!blocker || !blocked) return false;

  const found = await Block.exists({ blocker, blocked });

  return Boolean(found);
}

async function isBlockedBetween(a, b) {
  if (!a || !b || String(a) === String(b)) return false;

  const first = toObjectId(a);
  const second = toObjectId(b);

  if (!first || !second) return false;

  const found = await Block.exists({
    $or: [
      { blocker: first, blocked: second },
      { blocker: second, blocked: first }
    ]
  });

  return Boolean(found);
}

/**
 * ¿Puede `viewerId` interactuar con contenido de `ownerId`?
 * Devuelve `{ allowed, code, message }` para responder sin ambigüedad.
 */
async function canInteract(viewerId, ownerId) {
  if (!ownerId || String(viewerId) === String(ownerId)) {
    return { allowed: true, code: "", message: "" };
  }

  if (await isBlockedBetween(viewerId, ownerId)) {
    return {
      allowed: false,
      code: "BLOCKED_RELATION",
      message:
        "No puedes interactuar con este contenido por un bloqueo."
    };
  }

  return { allowed: true, code: "", message: "" };
}

/**
 * Fragmento de consulta para feeds/perfiles del usuario autenticado.
 * `includeAuthors: false` se usa en el perfil propio para no ocultar
 * las publicaciones del dueño cuando otro usuario lo bloqueó.
 */
async function feedConstraints(userId, { includeAuthors = true } = {}) {
  const filter = { "moderation.hidden": { $ne: true } };

  const [excluded, muted] = await Promise.all([
    includeAuthors ? getExcludedUserIds(userId) : Promise.resolve([]),
    includeAuthors ? getMutedUserIds(userId) : Promise.resolve([])
  ]);

  const hidden = await getHiddenPostIds(userId);

  if (includeAuthors && excluded.length) {
    filter.author = { $nin: excluded };
  }

  if (includeAuthors && muted.length) {
    filter.author = filter.author
      ? { $nin: [...excluded, ...muted] }
      : { $nin: muted };
  }

  if (hidden.length) {
    filter._id = { $nin: hidden };
  }

  return filter;
}

/** ¿La publicación está oculta por moderación global? */
function isGloballyHidden(post) {
  return Boolean(post && post.moderation && post.moderation.hidden);
}

module.exports = {
  Block,
  Mute,
  HiddenPost,
  toObjectId,
  isModerator,
  getBlockedUserIds,
  getBlockingUserIds,
  getExcludedUserIds,
  getMutedUserIds,
  getHiddenPostIds,
  hasBlocked,
  isBlockedBetween,
  canInteract,
  feedConstraints,
  isGloballyHidden
};

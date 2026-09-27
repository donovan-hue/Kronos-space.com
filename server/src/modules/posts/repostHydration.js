/**
 * KRONOS — hidratación por lotes de reposts y remixes.
 *
 * Problema que resuelve (N+1 real, medido en el inventario):
 * cada publicación del feed disparaba `Post.findById` para su original, más
 * `canViewPost` (que consultaba usuario/círculos/órbitas) y `Block.exists`.
 * Una página de 20 publicaciones podía costar más de 60 consultas.
 *
 * Aquí se resuelve en tres consultas por página, sean 1 o 50 publicaciones:
 *   1. originales de repost (con su autor),
 *   2. fuentes de remix (solo autor/audiencia/moderación),
 *   3. bloqueos entre el espectador y todos los autores implicados.
 *
 * Las decisiones de visibilidad son EXACTAMENTE las mismas que aplicaba la
 * versión por publicación: original inexistente, oculto por moderación, fuera
 * de audiencia o con bloqueo ⇒ se redacta el repost y su copia heredada.
 */

const mongoose = require("mongoose");

const { canViewPostWithScope, loadViewerScope } = require("./audience.service");

const EMPTY_MEDIA = {
  url: "",
  type: "",
  mimeType: "",
  size: 0,
  alt: "",
  posterUrl: "",
  width: 0,
  height: 0,
  orientation: "",
  focalPoint: { x: 0.5, y: 0.5 }
};

function validId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function idOf(value) {
  const raw = value?._id || value;
  return raw ? String(raw) : "";
}

function redactRepost(post) {
  post.repostOf = null;
  post.content = "";
  post.media = { ...EMPTY_MEDIA };
  post.mediaItems = [];
}

function redactInheritedMedia(post) {
  post.media = { ...EMPTY_MEDIA };
  post.mediaItems = [];
}

/** Autores implicados en una página, para resolver bloqueos en una consulta. */
function collectAuthorIds(documents) {
  const ids = new Set();

  for (const document of documents) {
    const author = idOf(document?.author);
    if (author && validId(author)) ids.add(author);
  }

  return [...ids];
}

/**
 * Conjunto de usuarios con los que el espectador tiene un bloqueo (en
 * cualquier dirección). Una sola consulta para toda la página.
 */
async function loadBlockedWith(Block, viewerId, otherIds) {
  if (!viewerId || !otherIds.length || mongoose.connection.readyState !== 1) return new Set();

  const viewer = new mongoose.Types.ObjectId(viewerId);
  const others = otherIds.filter(validId).map((id) => new mongoose.Types.ObjectId(id));

  if (!others.length) return new Set();

  const blocks = await Block.find({
    $or: [
      { blocker: viewer, blocked: { $in: others } },
      { blocker: { $in: others }, blocked: viewer }
    ]
  })
    .select("blocker blocked")
    .lean();

  const blocked = new Set();

  for (const block of blocks) {
    const blocker = String(block.blocker);
    const target = String(block.blocked);
    blocked.add(blocker === String(viewerId) ? target : blocker);
  }

  return blocked;
}

/**
 * Hidrata (o redacta) los reposts y remixes de una página completa.
 *
 * @param {object[]} posts       Documentos `lean()` que se van a normalizar.
 * @param {string}   viewerId    Usuario que consulta.
 * @param {object}   dependencies `{ Post, Block, scope? }`
 * @returns {Promise<{originals:number, redacted:number, queries:number}>}
 */
async function hydrateVisibleReposts(posts, viewerId, { Post, Block, scope = null } = {}) {
  const list = Array.isArray(posts) ? posts.filter(Boolean) : [];
  if (!list.length) return { originals: 0, redacted: 0, queries: 0 };

  const repostIds = new Set();
  const remixIds = new Set();

  for (const post of list) {
    if (post.repostOf) {
      const id = idOf(post.repostOf);
      if (validId(id)) repostIds.add(id);
      else post.repostOf = null;
    }

    if (post.lineage?.tool === "remix" && post.lineage?.derivedFrom) {
      const id = idOf(post.lineage.derivedFrom);
      if (validId(id)) remixIds.add(id);
    }
  }

  if (!repostIds.size && !remixIds.size) return { originals: 0, redacted: 0, queries: 0 };

  const resolvedScope = scope || (await loadViewerScope(viewerId));
  let queries = scope ? 0 : 3;

  const [originals, sources] = await Promise.all([
    repostIds.size
      ? Post.find({ _id: { $in: [...repostIds] } })
        .populate("author", "username displayName avatar")
        .lean()
      : Promise.resolve([]),
    remixIds.size
      ? Post.find({ _id: { $in: [...remixIds] } })
        .select("author audience moderation")
        .lean()
      : Promise.resolve([])
  ]);

  queries += (repostIds.size ? 1 : 0) + (remixIds.size ? 1 : 0);

  const originalsById = new Map(originals.map((post) => [String(post._id), post]));
  const sourcesById = new Map(sources.map((post) => [String(post._id), post]));

  const blocked = await loadBlockedWith(Block, viewerId, collectAuthorIds([...originals, ...sources]));
  queries += 1;

  let redacted = 0;

  for (const post of list) {
    if (post.repostOf) {
      const original = originalsById.get(idOf(post.repostOf));

      if (!original) {
        redactRepost(post);
        redacted += 1;
      } else {
        const hidden = Boolean(original.moderation?.hidden);
        const visible = canViewPostWithScope(original, resolvedScope);
        const authorId = idOf(original.author);
        const allowed = !authorId || authorId === String(viewerId) || !blocked.has(authorId);

        if (hidden || !visible || !allowed) {
          redactRepost(post);
          redacted += 1;
        } else {
          post.repostOf = original;
        }
      }
    }

    if (post.lineage?.tool === "remix" && post.lineage?.derivedFrom) {
      const sourceId = idOf(post.lineage.derivedFrom);
      const source = sourcesById.get(sourceId);

      if (!validId(sourceId)) continue;

      if (!source) {
        redactInheritedMedia(post);
        redacted += 1;
        continue;
      }

      const hidden = Boolean(source.moderation?.hidden);
      const visible = canViewPostWithScope(source, resolvedScope);
      const authorId = idOf(source.author);
      const allowed = !authorId || authorId === String(viewerId) || !blocked.has(authorId);

      if (hidden || !visible || !allowed) {
        redactInheritedMedia(post);
        redacted += 1;
      }
    }
  }

  return { originals: originalsById.size + sourcesById.size, redacted, queries };
}

module.exports = {
  EMPTY_MEDIA,
  collectAuthorIds,
  loadBlockedWith,
  hydrateVisibleReposts
};

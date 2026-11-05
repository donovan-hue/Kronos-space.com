const express = require("express");

const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const User = require("../users/User");
const Post = require("../posts/Post");
const normalizePost = require("../posts/normalizePost");
const { publicUser } = require("../users/profilePrivacy");
const {
  feedConstraints,
  getExcludedUserIds
} = require("../moderation/moderation.service");
const { loadViewerScope, withAudienceFilter } = require("../posts/audience.service");

const { escapeRegex } = require("../../utils/queryHelpers");

const router = express.Router();
const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 30;
const SCOPES = ["all", "users", "posts"];

function parseSearchQuery(query = {}) {
  const value = typeof query.q === "string" ? query.q.trim() : "";
  const scope = typeof query.scope === "string" ? query.scope.trim() : "all";
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(query.limit, 10) || DEFAULT_LIMIT)
  );

  if (value.length < 2) {
    return { error: "Escribe al menos 2 caracteres para buscar.", code: "QUERY_TOO_SHORT" };
  }

  if (value.length > 80) {
    return { error: "La búsqueda no puede superar 80 caracteres.", code: "QUERY_TOO_LONG" };
  }

  if (!SCOPES.includes(scope)) {
    return { error: "El alcance de búsqueda no es válido.", code: "INVALID_SCOPE" };
  }

  const searchValue = value.startsWith("#") ? value.slice(1) : value;
  return {
    value,
    scope,
    page,
    limit,
    skip: (page - 1) * limit,
    regex: new RegExp(escapeRegex(searchValue), "i")
  };
}

/**
 * BLOQUE 009 / BLOQUE A — búsqueda global única. Mantiene el buscador de usuarios,
 * y permite consultar personas, temas, órbitas y publicaciones con el mismo contrato.
 * La visibilidad reutiliza los filtros de moderación; no filtra datos
 * privados, autores bloqueados/silenciados ni contenido oculto.
 */
router.get("/", auth, requireUser, async (req, res) => {
  const parsed = parseSearchQuery(req.query);

  if (parsed.error) {
    return res.status(400).json({ error: parsed.error, code: parsed.code });
  }

  const { scope, page, limit, skip, regex, value } = parsed;

  try {
    const wantsUsers = scope === "all" || scope === "users";
    const wantsPosts = scope === "all" || scope === "posts";
    const excluded = wantsUsers
      ? await getExcludedUserIds(req.user.id)
      : [];
    const postFilter = wantsPosts
      ? await withAudienceFilter(await feedConstraints(req.user.id), req.user.id, await loadViewerScope(req.user.id))
      : null;

    const [users, userTotal, posts, postTotal] = await Promise.all([
      wantsUsers
        ? User.find({
            _id: { $ne: req.user.id, $nin: excluded },
            "profilePrivacy.discoverable": { $ne: false },
            $or: [{ username: regex }, { displayName: regex }]
          })
            .select("_id username displayName avatar cover bio profilePrivacy followers following createdAt")
            .sort({ followers: -1, username: 1 })
            .skip(skip)
            .limit(limit)
            .lean()
        : Promise.resolve([]),
      wantsUsers
        ? User.countDocuments({
            _id: { $ne: req.user.id, $nin: excluded },
            "profilePrivacy.discoverable": { $ne: false },
            $or: [{ username: regex }, { displayName: regex }]
          })
        : Promise.resolve(0),
      wantsPosts
        ? Post.find({ ...postFilter, $or: [{ content: regex }, { hashtags: regex }] })
            .populate("author", "username displayName avatar")
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
        : Promise.resolve([]),
      wantsPosts
        ? Post.countDocuments({ ...postFilter, $or: [{ content: regex }, { hashtags: regex }] })
        : Promise.resolve(0),
    ]);

    const normalizedPosts = posts.map((post) => normalizePost(post, req.user.id));

    // Extraer temas/hashtags coincidentes
    const topicsMap = new Map();
    if (wantsPosts && posts.length) {
      for (const p of posts) {
        if (Array.isArray(p.hashtags)) {
          for (const tag of p.hashtags) {
            if (regex.test(tag)) {
              topicsMap.set(tag, (topicsMap.get(tag) || 0) + 1);
            }
          }
        }
      }
    }
    const topics = Array.from(topicsMap.entries()).map(([tag, count]) => ({
      tag,
      count
    }));

    return res.json({
      query: value,
      scope,
      users: users.map((user) => publicUser(user, req.user.id)),
      posts: normalizedPosts,
      topics,
      page,
      limit,
      totals: { users: userTotal, posts: postTotal, topics: topics.length },
      hasMore: {
        users: skip + users.length < userTotal,
        posts: skip + posts.length < postTotal
      }
    });
  } catch (error) {
    console.error("GLOBAL_SEARCH_ERROR:", error);
    return res.status(500).json({ error: "No se pudo completar la búsqueda." });
  }
});

/**
 * GET /api/search/trending — temas en tendencia (bloque 1.2).
 *
 * El pendiente era «sin tendencias ni sugerencias de a quién seguir más allá
 * de lo que ya hay en Explorar». Esto resuelve las dos cosas.
 *
 * Cómo se cuenta, y por qué así:
 * - Se miran las publicaciones de los últimos 7 días que el visitante **puede
 *   ver** (mismos filtros de audiencia y moderación que el feed). Una tendencia
 *   que incluye lo que no puedes abrir no es una tendencia: es una fuga.
 * - Cuenta **autores distintos**, no publicaciones: si alguien publica 40 veces
 *   la misma etiqueta, es un tema suyo, no una tendencia.
 * - Se agrupa por la etiqueta tal como está guardada (en minúsculas) y se
 *   devuelve la forma visible con `#`.
 */
router.get("/trending", auth, requireUser, async (req, res) => {
  try {
    const dias = Math.min(30, Math.max(1, Number.parseInt(req.query.dias, 10) || 7));
    const limite = Math.min(20, Math.max(1, Number.parseInt(req.query.limite, 10) || 8));
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    const filtro = await withAudienceFilter(
      { ...(await feedConstraints(req.user.id)), createdAt: { $gte: desde } },
      req.user.id,
      await loadViewerScope(req.user.id)
    );

    const filas = await Post.aggregate([
      { $match: { ...filtro, hashtags: { $exists: true, $ne: [] } } },
      { $unwind: "$hashtags" },
      { $group: { _id: "$hashtags", autores: { $addToSet: "$author" }, publicaciones: { $sum: 1 } } },
      { $project: { _id: 0, tag: "$_id", autores: { $size: "$autores" }, publicaciones: 1 } },
      // Primero quien más gente reúne; las publicaciones solo desempatan.
      { $sort: { autores: -1, publicaciones: -1, tag: 1 } },
      { $limit: limite }
    ]);

    return res.json({
      dias,
      tendencias: filas
        .filter((fila) => fila.tag && fila.autores > 0)
        .map((fila) => ({
          tag: String(fila.tag),
          label: `#${fila.tag}`,
          autores: fila.autores,
          publicaciones: fila.publicaciones,
          ruta: `/hashtag/${encodeURIComponent(fila.tag)}`
        }))
    });
  } catch (error) {
    console.error("TRENDING_ERROR:", error);
    return res.status(500).json({ error: "No se pudieron calcular las tendencias." });
  }
});

/**
 * GET /api/search/suggestions — a quién seguir (bloque 1.2).
 *
 * Reglas, explícitas para no convertirlo en un escaparate de spam:
 * - Nunca tú, nunca a quien ya sigues, nunca bloqueados/silenciados, nunca
 *   perfiles que se ocultaron de Explorar.
 * - Orden por «amigos en común» (cuántos de tus seguidos también le siguen) y,
 *   a igualdad, por seguidores. Es la señal que de verdad ayuda; ordenar solo
 *   por seguidores recomendaría siempre a las mismas cuentas enormes.
 * - `motivo` explica por qué se sugiere, para que la pantalla pueda decirlo en
 *   lugar de presentar una lista sin criterio.
 */
router.get("/suggestions", auth, requireUser, async (req, res) => {
  try {
    const limite = Math.min(20, Math.max(1, Number.parseInt(req.query.limite, 10) || 6));
    const yo = await User.findById(req.user.id).select("following").lean();
    const siguiendo = (yo?.following || []).map((id) => String(id));
    const excluidos = await getExcludedUserIds(req.user.id);
    const yaSigo = new Set([...siguiendo, ...excluidos.map((id) => String(id)), String(req.user.id)]);

    // Amigos en común: a quién siguen las personas que yo sigo.
    const comunes = siguiendo.length
      ? await User.aggregate([
        { $match: { _id: { $in: yo.following } } },
        { $unwind: "$following" },
        { $match: { following: { $nin: yo.following } } },
        { $group: { _id: "$following", amigos: { $sum: 1 } } },
        { $sort: { amigos: -1 } },
        { $limit: 60 }
      ])
      : [];
    const mapaComunes = new Map(comunes.map((fila) => [String(fila._id), fila.amigos]));

    const candidatos = await User.find({
      _id: { $nin: Array.from(yaSigo) },
      "profilePrivacy.discoverable": { $ne: false }
    })
      .select("_id username displayName avatar bio followers following createdAt")
      .sort({ followers: -1, createdAt: -1 })
      .limit(80)
      .lean();

    const sugerencias = candidatos
      .map((usuario) => ({
        usuario,
        amigos: mapaComunes.get(String(usuario._id)) || 0
      }))
      .sort((a, b) => b.amigos - a.amigos || (b.usuario.followers?.length || 0) - (a.usuario.followers?.length || 0))
      .slice(0, limite)
      .map(({ usuario, amigos }) => ({
        ...publicUser(usuario, req.user.id),
        motivo: amigos > 0
          ? `${amigos} ${amigos === 1 ? "persona que sigues le sigue" : "personas que sigues le siguen"}`
          : (usuario.followers?.length || 0) > 0
            ? `${usuario.followers.length} ${usuario.followers.length === 1 ? "seguidor" : "seguidores"} en Kronos`
            : "Cuenta nueva en Kronos"
      }));

    return res.json({ sugerencias });
  } catch (error) {
    console.error("SUGGESTIONS_ERROR:", error);
    return res.status(500).json({ error: "No se pudieron calcular las sugerencias." });
  }
});

module.exports = { router, parseSearchQuery, SCOPES };

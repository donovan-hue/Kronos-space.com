/**
 * KRONOS — catálogo de consultas críticas.
 *
 * Son las formas de consulta que ejecuta la API en las pantallas de mayor
 * tráfico. Existen por dos motivos:
 *
 *   1. `scripts/db/index-audit.js` las lanza contra MongoDB real con
 *      `explain()` y detecta COLLSCAN u ordenaciones en memoria.
 *   2. `analyzeQueryCoverage()` comprueba SIN base de datos que el plan de
 *      índices puede servirlas (regla Igualdad → Orden → Rango). Así un
 *      cambio de esquema que deje una pantalla sin índice rompe una prueba
 *      antes de llegar a producción.
 *
 * Los identificadores de ejemplo son fijos y no corresponden a datos reales:
 * `explain()` no lee documentos, solo planifica.
 */

const mongoose = require("mongoose");

const { desiredIndexes, isKeyPrefixOf } = require("./indexPlan");

const SAMPLE_USER = new mongoose.Types.ObjectId("000000000000000000000001");
const SAMPLE_POST = new mongoose.Types.ObjectId("000000000000000000000002");
const SAMPLE_ORBIT = new mongoose.Types.ObjectId("000000000000000000000003");
const SAMPLE_CHANNEL = new mongoose.Types.ObjectId("000000000000000000000004");
const SAMPLE_CONVERSATION = new mongoose.Types.ObjectId("000000000000000000000005");

/**
 * @typedef {Object} CriticalQuery
 * @property {string} id
 * @property {string} collection
 * @property {string} description
 * @property {object} filter
 * @property {object} [sort]
 * @property {object} [projection]
 * @property {number} [limit]
 * @property {string[]} equality  Campos filtrados por igualdad (para cobertura).
 * @property {string[]} [range]   Campos filtrados por rango.
 * @property {"critical"|"warning"} severity
 */

/** @returns {CriticalQuery[]} */
function criticalQueries() {
  return [
    {
      id: "feed.principal",
      collection: "posts",
      description: "GET /api/posts y /api/posts/feed — feed cronológico.",
      filter: { "moderation.hidden": { $ne: true } },
      sort: { createdAt: -1 },
      equality: [],
      severity: "warning"
    },
    {
      id: "feed.perfil",
      collection: "posts",
      description: "GET /api/posts/user/:id — publicaciones de un perfil.",
      filter: { author: SAMPLE_USER },
      sort: { createdAt: -1 },
      equality: ["author"],
      severity: "critical"
    },
    {
      id: "feed.tema",
      collection: "posts",
      description: "GET /api/posts/topic/:tag — feed de un hashtag.",
      filter: { hashtags: "kronos" },
      sort: { createdAt: -1 },
      equality: ["hashtags"],
      severity: "critical"
    },
    {
      id: "feed.vertical",
      collection: "posts",
      description: "GET /api/posts/vertical — video vertical.",
      filter: { "media.type": "video", "media.orientation": { $ne: "horizontal" } },
      sort: { createdAt: -1 },
      equality: ["media.type"],
      range: ["media.orientation"],
      severity: "critical"
    },
    {
      id: "feed.orbita",
      collection: "posts",
      description: "GET /api/posts?orbitId= — feed de una órbita.",
      filter: { "audience.orbitId": SAMPLE_ORBIT },
      sort: { createdAt: -1 },
      equality: ["audience.orbitId"],
      severity: "critical"
    },
    {
      id: "notificaciones.lista",
      collection: "notifications",
      description: "GET /api/notifications — avisos del usuario.",
      filter: { recipient: SAMPLE_USER },
      sort: { createdAt: -1 },
      equality: ["recipient"],
      severity: "critical"
    },
    {
      id: "notificaciones.no-leidas",
      collection: "notifications",
      description: "Contador de no leídas del encabezado.",
      filter: { recipient: SAMPLE_USER, read: false },
      sort: { createdAt: -1 },
      equality: ["recipient", "read"],
      severity: "critical"
    },
    {
      id: "mensajes.conversacion-directa",
      collection: "messages",
      description: "GET /api/messages/:userId — hilo directo.",
      filter: { sender: SAMPLE_USER, receiver: SAMPLE_POST },
      sort: { createdAt: -1 },
      equality: ["sender", "receiver"],
      severity: "critical"
    },
    {
      id: "mensajes.recibidos",
      collection: "messages",
      description: "Rama `receiver` de la bandeja y contadores de no leídos.",
      filter: { receiver: SAMPLE_USER },
      sort: { createdAt: -1 },
      equality: ["receiver"],
      severity: "critical"
    },
    {
      id: "mensajes.grupo",
      collection: "messages",
      description: "GET /api/conversations/:id/messages — mensajes de grupo.",
      filter: { conversation: SAMPLE_CONVERSATION },
      sort: { createdAt: 1 },
      equality: ["conversation"],
      severity: "critical"
    },
    {
      id: "conversaciones.lista",
      collection: "conversations",
      description: "GET /api/conversations — grupos del usuario por actividad.",
      filter: { members: SAMPLE_USER },
      sort: { updatedAt: -1 },
      equality: ["members"],
      severity: "critical"
    },
    {
      id: "moderacion.ocultas",
      collection: "hiddenposts",
      description: "Publicaciones ocultas del usuario (feedConstraints).",
      filter: { user: SAMPLE_USER },
      sort: { createdAt: -1 },
      equality: ["user"],
      severity: "critical"
    },
    {
      id: "moderacion.bloqueos",
      collection: "blocks",
      description: "Bloqueos emitidos por el usuario (feedConstraints).",
      filter: { blocker: SAMPLE_USER },
      equality: ["blocker"],
      severity: "critical"
    },
    {
      id: "moderacion.bloqueado-por",
      collection: "blocks",
      description: "Bloqueos recibidos por el usuario (feedConstraints).",
      filter: { blocked: SAMPLE_USER },
      equality: ["blocked"],
      severity: "critical"
    },
    {
      id: "historias.activas",
      collection: "stories",
      description: "GET /api/stories — historias vigentes por autor.",
      filter: { author: SAMPLE_USER },
      sort: { createdAt: -1 },
      equality: ["author"],
      severity: "critical"
    },
    {
      id: "capsulas.pendientes",
      collection: "capsules",
      description: "Apertura programada de cápsulas (temporizador del servidor).",
      filter: { state: "sealed" },
      sort: { opensAt: 1 },
      equality: ["state"],
      severity: "critical"
    },
    {
      id: "kairos.historial-imagenes",
      collection: "imagegenerations",
      description: "GET /api/ai/images — historial de generaciones.",
      filter: { user: SAMPLE_USER },
      sort: { createdAt: -1 },
      equality: ["user"],
      severity: "critical"
    },
    {
      id: "kairos.historial-video",
      collection: "videogenerations",
      description: "GET /api/ai/videos — trabajos de video del usuario.",
      filter: { user: SAMPLE_USER },
      sort: { createdAt: -1 },
      equality: ["user"],
      severity: "critical"
    },
    {
      id: "kairos.historial-guiones",
      collection: "scripts",
      description: "GET /api/ai/scripts — guiones del usuario.",
      filter: { user: SAMPLE_USER },
      sort: { createdAt: -1 },
      equality: ["user"],
      severity: "critical"
    },
    {
      id: "canales.mensajes",
      collection: "channelmessages",
      description: "GET /api/channels/:id/messages — mensajes de un canal.",
      filter: { channel: SAMPLE_CHANNEL },
      sort: { createdAt: -1 },
      equality: ["channel"],
      severity: "critical"
    },
    {
      id: "borradores.lista",
      collection: "drafts",
      description: "GET /api/drafts — borradores por autor.",
      filter: { author: SAMPLE_USER },
      sort: { updatedAt: -1 },
      equality: ["author"],
      severity: "critical"
    },
    {
      id: "colecciones.lista",
      collection: "savedcollections",
      description: "GET /api/collections — colecciones guardadas del usuario.",
      filter: { owner: SAMPLE_USER },
      sort: { updatedAt: -1 },
      equality: ["owner"],
      severity: "critical"
    },
    {
      id: "circulos.lista",
      collection: "circles",
      description: "GET /api/circles — círculos del usuario.",
      filter: { owner: SAMPLE_USER },
      sort: { updatedAt: -1 },
      equality: ["owner"],
      severity: "critical"
    },
    {
      id: "apoyos.recibidos",
      collection: "supporttransactions",
      description: "GET /api/support — apoyos recibidos por el creador.",
      filter: { creator: SAMPLE_USER },
      sort: { createdAt: -1 },
      equality: ["creator"],
      severity: "critical"
    },
    {
      id: "sesiones.refresh",
      collection: "refreshtokens",
      description: "Rotación de refresh token por familia.",
      filter: { familyId: "familia-ejemplo" },
      equality: ["familyId"],
      severity: "critical"
    }
  ];
}

/**
 * ¿Algún índice del plan puede servir esta consulta?
 *
 * Regla aplicada (Equality → Sort → Range): el índice sirve si sus primeras
 * claves son exactamente los campos de igualdad (en cualquier orden) y, si la
 * consulta ordena, las claves siguientes coinciden con el orden pedido (o con
 * su inverso exacto, que MongoDB recorre hacia atrás).
 *
 * @param {CriticalQuery} query
 * @param {Array<{name:string,key:object}>} indexes
 */
function indexSupporting(query, indexes = []) {
  const equality = [...(query.equality || [])];
  const sortEntries = Object.entries(query.sort || {});

  for (const index of indexes) {
    const keyEntries = Object.entries(index.key);
    if (keyEntries.length < equality.length) continue;

    const prefix = keyEntries.slice(0, equality.length).map(([field]) => field);
    const coversEquality = equality.every((field) => prefix.includes(field));
    if (!coversEquality) continue;

    if (!sortEntries.length) return index;

    const sortPart = keyEntries.slice(equality.length, equality.length + sortEntries.length);
    if (sortPart.length < sortEntries.length) continue;

    const sameDirection = sortPart.every(
      ([field, direction], position) => field === sortEntries[position][0] && direction === sortEntries[position][1]
    );
    const reverseDirection = sortPart.every(
      ([field, direction], position) => field === sortEntries[position][0] && direction === -sortEntries[position][1]
    );

    if (sameDirection || reverseDirection) return index;
  }

  return null;
}

/**
 * Cobertura del catálogo completo frente al plan de índices.
 * Función pura: es la comprobación que corre en las pruebas sin MongoDB.
 */
function analyzeQueryCoverage(queries = criticalQueries(), plan = desiredIndexes()) {
  return queries.map((query) => {
    const indexes = plan.get(query.collection) || [];
    const index = indexSupporting(query, indexes);

    return {
      id: query.id,
      collection: query.collection,
      severity: query.severity,
      covered: Boolean(index),
      index: index?.name || null
    };
  });
}

module.exports = {
  criticalQueries,
  indexSupporting,
  analyzeQueryCoverage,
  isKeyPrefixOf
};

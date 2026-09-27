/**
 * KRONOS — registro canónico de modelos y colecciones.
 *
 * Único lugar donde se declara qué colecciones existen, para qué sirven y
 * qué módulo las posee. El inventario, las migraciones, el plan de índices
 * y las validaciones de integridad leen de aquí, de modo que añadir un
 * modelo nuevo sin registrarlo rompe una prueba en vez de pasar inadvertido.
 *
 * El nombre real de la colección NO se escribe a mano: se lee del modelo de
 * Mongoose (`model.collection.collectionName`). Así no puede divergir del
 * nombre que usa la aplicación en producción.
 *
 * Requerir este módulo registra los modelos en Mongoose pero NO abre ninguna
 * conexión: es seguro usarlo en scripts, pruebas de contrato e inventario.
 */

const mongoose = require("mongoose");

/**
 * @typedef {Object} CollectionEntry
 * @property {string} model        Nombre del modelo Mongoose.
 * @property {string} collection   Nombre real de la colección en MongoDB.
 * @property {string} domain       Dominio funcional (auth, social, mensajería…).
 * @property {string} purpose      Para qué existe la colección.
 * @property {boolean} sensitive   Contiene datos personales o secretos derivados.
 * @property {string[]} retention  Política de retención declarada.
 * @property {import("mongoose").Model} Model
 */

/**
 * Declaración de dominio/propósito por modelo. El resto de metadatos
 * (campos, índices, referencias) se derivan del esquema real.
 */
const DECLARATIONS = [
  {
    module: "../modules/users/User",
    domain: "identidad",
    purpose: "Cuentas, perfil público, preferencias y grafo de seguidores.",
    sensitive: true,
    retention: "Permanente mientras la cuenta exista."
  },
  {
    module: "../modules/auth/session.service",
    export: "RefreshToken",
    domain: "auth",
    purpose: "Familias de refresh token con rotación.",
    sensitive: true,
    retention: "TTL por expiresAt (expireAfterSeconds: 0)."
  },
  {
    module: "../modules/auth/session.service",
    export: "SessionRevocation",
    domain: "auth",
    purpose: "Revocaciones de sesión consultadas en cada handshake.",
    sensitive: true,
    retention: "TTL por expiresAt (expireAfterSeconds: 0)."
  },
  {
    module: "../modules/posts/Post",
    domain: "social",
    purpose: "Publicaciones, comentarios, reacciones, encuestas y eventos.",
    sensitive: false,
    retention: "Permanente hasta borrado del autor."
  },
  {
    module: "../modules/stories/Story",
    domain: "social",
    purpose: "Historias efímeras con archivo personal posterior.",
    sensitive: false,
    retention: "expiresAt filtra la vista; el documento se conserva como archivo."
  },
  {
    module: "../modules/drafts/Draft",
    domain: "social",
    purpose: "Borradores de publicación por autor.",
    sensitive: false,
    retention: "Hasta publicación o borrado manual."
  },
  {
    module: "../modules/collections/SavedCollection",
    domain: "social",
    purpose: "Colecciones de publicaciones guardadas.",
    sensitive: false,
    retention: "Permanente por usuario."
  },
  {
    module: "../modules/circles/Circle",
    domain: "social",
    purpose: "Círculos privados de audiencia.",
    sensitive: false,
    retention: "Permanente por usuario."
  },
  {
    module: "../modules/orbits/Orbit",
    domain: "social",
    purpose: "Comunidades (órbitas) con miembros y caducidad opcional.",
    sensitive: false,
    retention: "expiresAt define archivo; no se borra automáticamente."
  },
  {
    module: "../modules/channels/Channel",
    domain: "social",
    purpose: "Canales de una órbita.",
    sensitive: false,
    retention: "Vive con su órbita."
  },
  {
    module: "../modules/channels/ChannelMessage",
    domain: "social",
    purpose: "Mensajes de canal.",
    sensitive: false,
    retention: "Vive con su canal."
  },
  {
    module: "../modules/messages/Message",
    domain: "mensajería",
    purpose: "Mensajes directos y de grupo.",
    sensitive: true,
    retention: "Permanente hasta borrado por los participantes."
  },
  {
    module: "../modules/conversations/Conversation",
    domain: "mensajería",
    purpose: "Conversaciones de grupo con miembros.",
    sensitive: true,
    retention: "Permanente hasta borrado."
  },
  {
    module: "../modules/notifications/Notification",
    domain: "notificaciones",
    purpose: "Avisos in-app por destinatario.",
    sensitive: false,
    retention: "Poda por antigüedad (migración 005, opt-in explícito)."
  },
  {
    module: "../modules/moderation/Block",
    domain: "moderación",
    purpose: "Bloqueos entre usuarios.",
    sensitive: false,
    retention: "Permanente hasta desbloqueo."
  },
  {
    module: "../modules/moderation/Mute",
    domain: "moderación",
    purpose: "Silencios entre usuarios.",
    sensitive: false,
    retention: "Permanente hasta quitar el silencio."
  },
  {
    module: "../modules/moderation/HiddenPost",
    domain: "moderación",
    purpose: "Publicaciones ocultas por un usuario concreto.",
    sensitive: false,
    retention: "Permanente por usuario."
  },
  {
    module: "../modules/moderation/Report",
    export: "Report",
    domain: "moderación",
    purpose: "Reportes y apelaciones de contenido.",
    sensitive: true,
    retention: "Permanente: registro de decisiones de moderación."
  },
  {
    module: "../modules/capsules/Capsule",
    domain: "cápsulas",
    purpose: "Cápsulas del tiempo cifradas con apertura programada.",
    sensitive: true,
    retention: "Permanente; el contenido está cifrado con CAPSULE_SECRET."
  },
  {
    module: "../modules/pulse/SeenPost",
    domain: "pulso",
    purpose: "Marcas de publicación ya vista por usuario.",
    sensitive: false,
    retention: "Poda por antigüedad (migración 005, opt-in explícito)."
  },
  {
    module: "../modules/pulse/FeedSignal",
    domain: "pulso",
    purpose: "Señales más/menos por etiqueta y usuario.",
    sensitive: false,
    retention: "Permanente por usuario."
  },
  {
    module: "../modules/live/LiveRoom",
    domain: "live",
    purpose: "Salas en vivo y participantes.",
    sensitive: false,
    retention: "Histórico de salas finalizadas."
  },
  {
    module: "../modules/support/SupportTransaction",
    domain: "soporte",
    purpose: "Registro de apoyos económicos entre usuarios.",
    sensitive: true,
    retention: "Permanente: registro contable."
  },
  {
    module: "../modules/image-ai/ImageGeneration",
    domain: "kairos",
    purpose: "Generaciones de imagen (proveedor, modelo, estado, resultado).",
    sensitive: false,
    retention: "Poda de generaciones abandonadas (migración 006)."
  },
  {
    module: "../modules/video-ai/VideoGeneration",
    domain: "kairos",
    purpose: "Trabajos de video y su estado.",
    sensitive: false,
    retention: "Poda de generaciones abandonadas (migración 006)."
  },
  {
    module: "../modules/script-ai/Script",
    domain: "kairos",
    purpose: "Guiones generados.",
    sensitive: false,
    retention: "Permanente por usuario."
  },
  {
    module: "../modules/script-ai/ScriptProject",
    domain: "kairos",
    purpose: "Proyectos de guion con estructura.",
    sensitive: false,
    retention: "Permanente por usuario."
  }
];

function resolveModel(declaration) {
  const loaded = require(declaration.module);
  const candidate = declaration.export ? loaded[declaration.export] : loaded;

  if (!candidate || typeof candidate.collection?.collectionName !== "string") {
    throw new Error(
      `REGISTRY_INVALID_MODEL: ${declaration.module}${declaration.export ? `#${declaration.export}` : ""}`
    );
  }

  return candidate;
}

/** @returns {CollectionEntry[]} */
function listCollections() {
  return DECLARATIONS.map((declaration) => {
    const Model = resolveModel(declaration);

    return {
      model: Model.modelName,
      collection: Model.collection.collectionName,
      domain: declaration.domain,
      purpose: declaration.purpose,
      sensitive: Boolean(declaration.sensitive),
      retention: declaration.retention,
      Model
    };
  });
}

/** Mapa colección → entrada del registro. */
function collectionMap() {
  const map = new Map();
  for (const entry of listCollections()) map.set(entry.collection, entry);
  return map;
}

/** Nombres reales de las colecciones que la aplicación usa. */
function knownCollectionNames() {
  return listCollections().map((entry) => entry.collection).sort();
}

/**
 * Modelos registrados en Mongoose que no están declarados aquí.
 * Un modelo sin declarar no aparece en inventario ni en integridad: es un
 * fallo de mantenimiento, no una omisión aceptable.
 */
function undeclaredModels() {
  const declared = new Set(listCollections().map((entry) => entry.model));

  return mongoose.modelNames().filter((name) => !declared.has(name)).sort();
}

module.exports = {
  DECLARATIONS,
  listCollections,
  collectionMap,
  knownCollectionNames,
  undeclaredModels
};

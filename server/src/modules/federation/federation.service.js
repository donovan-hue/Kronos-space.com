const HOST_DOMAIN = process.env.CANONICAL_HOST || "kronos-space.com";

/**
 * El perfil vive en el frontend. Actor, inbox, outbox y los archivos
 * `/uploads` viven en la API. Mezclarlos (usar CLIENT_URL para `/api/...`)
 * publica enlaces que el sitio estático no puede responder.
 */
function federationOrigins(env = process.env) {
  const canonicalHost = String(env.CANONICAL_HOST || HOST_DOMAIN).trim() || HOST_DOMAIN;
  const clientOrigin = String(env.CLIENT_URL || "")
    .split(",")[0]
    .trim()
    .replace(/\/+$/, "");
  const webOrigin = clientOrigin || `https://${canonicalHost}`;
  // No hay variable de entorno aparte para la API: en producción el origen
  // federado es el subdominio ya desplegado. Fuera de producción, el proxy
  // del frontend responde `/api` y `/uploads`.
  const apiOrigin = env.NODE_ENV === "production"
    ? `https://api.${canonicalHost}`
    : webOrigin;

  return { canonicalHost, webOrigin, apiOrigin };
}

const BASE_URL = federationOrigins().webOrigin;

/**
 * Normalizes username from WebFinger resource query
 * e.g. "acct:juan@kronos-space.com" -> "juan"
 * or "juan" -> "juan"
 */
function extractUsername(resource = "") {
  if (typeof resource !== "string") return null;
  const clean = resource.trim().replace(/^acct:/i, "");
  const parts = clean.split("@");
  if (parts.length > 2) return null;
  const username = parts[0]?.trim().toLowerCase();
  if (!username || !/^[a-z0-9_]{3,30}$/.test(username)) {
    return null;
  }
  if (parts.length === 2 && !parts[1].trim()) {
    return null;
  }
  return username;
}

/**
 * Builds RFC 7033 WebFinger JRD response
 */
function buildWebFingerResponse(user, host = HOST_DOMAIN, origins = federationOrigins()) {
  const actorUrl = `${origins.apiOrigin}/api/federation/users/${user.username}`;
  const profileUrl = `${origins.webOrigin}/profile/${user.username}`;

  return {
    subject: `acct:${user.username}@${host}`,
    aliases: [profileUrl, actorUrl],
    links: [
      {
        rel: "http://webfinger.net/rel/profile-page",
        type: "text/html",
        href: profileUrl
      },
      {
        rel: "self",
        type: "application/activity+json",
        href: actorUrl
      }
    ]
  };
}

/**
 * Builds ActivityStreams 2.0 Actor representation
 */
function buildActorObject(user, origins = federationOrigins()) {
  const actorUrl = `${origins.apiOrigin}/api/federation/users/${user.username}`;
  const outboxUrl = `${origins.apiOrigin}/api/federation/users/${user.username}/outbox`;
  const inboxUrl = `${origins.apiOrigin}/api/federation/users/${user.username}/inbox`;
  const profileUrl = `${origins.webOrigin}/profile/${user.username}`;

  const actor = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1"
    ],
    id: actorUrl,
    type: "Person",
    preferredUsername: user.username,
    name: user.displayName || user.username,
    summary: user.profilePrivacy?.showBio === false ? "" : (user.bio || ""),
    url: profileUrl,
    inbox: inboxUrl,
    outbox: outboxUrl,
    discoverable: user.profilePrivacy?.discoverable !== false,
    published: user.createdAt?.toISOString() || new Date().toISOString()
  };

  if (user.avatar) {
    actor.icon = {
      type: "Image",
      mediaType: "image/jpeg",
      url: user.avatar.startsWith("http") ? user.avatar : `${origins.apiOrigin}${user.avatar}`
    };
  }

  if (user.cover) {
    actor.image = {
      type: "Image",
      mediaType: "image/jpeg",
      url: user.cover.startsWith("http") ? user.cover : `${origins.apiOrigin}${user.cover}`
    };
  }

  return actor;
}

/**
 * Builds ActivityStreams 2.0 Outbox Collection
 */
function buildOutboxCollection(user, posts = [], total = 0, origins = federationOrigins()) {
  const actorUrl = `${origins.apiOrigin}/api/federation/users/${user.username}`;
  const outboxUrl = `${origins.apiOrigin}/api/federation/users/${user.username}/outbox`;

  const items = posts.map((post) => {
    const postUrl = `${origins.webOrigin}/post/${post._id}`;
    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: `${postUrl}#activity`,
      type: "Create",
      actor: actorUrl,
      published: post.createdAt?.toISOString() || new Date().toISOString(),
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      object: {
        id: postUrl,
        type: "Note",
        attributedTo: actorUrl,
        content: post.content || "",
        published: post.createdAt?.toISOString() || new Date().toISOString(),
        to: ["https://www.w3.org/ns/activitystreams#Public"]
      }
    };
  });

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: outboxUrl,
    type: "OrderedCollection",
    totalItems: total,
    orderedItems: items
  };
}

/**
 * NodeInfo 2.0 metadata
 */
function buildNodeInfo(usage = {}) {
  const users = {};

  // No se publica un total inventado. Solo entra el conteo real cuando
  // quien llama ya lo obtuvo de la base.
  if (Number.isInteger(usage.totalUsers) && usage.totalUsers >= 0) {
    users.total = usage.totalUsers;
  }

  return {
    version: "2.0",
    software: {
      name: "kronos-space",
      version: "1.0.0"
    },
    protocols: ["activitypub"],
    services: {
      inbound: [],
      outbound: []
    },
    openRegistrations: true,
    usage: {
      users
    },
    metadata: {
      nodeName: "Kronos Space Federated Gateway",
      nodeDescription: "Red social cósmica de nueva generación"
    }
  };
}

module.exports = {
  extractUsername,
  buildWebFingerResponse,
  buildActorObject,
  buildOutboxCollection,
  buildNodeInfo,
  federationOrigins,
  HOST_DOMAIN,
  BASE_URL
};

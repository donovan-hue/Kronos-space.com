const HOST_DOMAIN = process.env.CANONICAL_HOST || "kronos-space.com";
const BASE_URL = process.env.CLIENT_URL?.split(",")[0]?.trim() || `https://${HOST_DOMAIN}`;

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
function buildWebFingerResponse(user, host = HOST_DOMAIN) {
  const actorUrl = `${BASE_URL}/api/federation/users/${user.username}`;
  const profileUrl = `${BASE_URL}/profile/${user.username}`;

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
function buildActorObject(user) {
  const actorUrl = `${BASE_URL}/api/federation/users/${user.username}`;
  const outboxUrl = `${BASE_URL}/api/federation/users/${user.username}/outbox`;
  const inboxUrl = `${BASE_URL}/api/federation/users/${user.username}/inbox`;
  const profileUrl = `${BASE_URL}/profile/${user.username}`;

  const actor = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1"
    ],
    id: actorUrl,
    type: "Person",
    preferredUsername: user.username,
    name: user.displayName || user.username,
    summary: user.bio || "",
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
      url: user.avatar.startsWith("http") ? user.avatar : `${BASE_URL}${user.avatar}`
    };
  }

  if (user.cover) {
    actor.image = {
      type: "Image",
      mediaType: "image/jpeg",
      url: user.cover.startsWith("http") ? user.cover : `${BASE_URL}${user.cover}`
    };
  }

  return actor;
}

/**
 * Builds ActivityStreams 2.0 Outbox Collection
 */
function buildOutboxCollection(user, posts = [], total = 0) {
  const actorUrl = `${BASE_URL}/api/federation/users/${user.username}`;
  const outboxUrl = `${BASE_URL}/api/federation/users/${user.username}/outbox`;

  const items = posts.map((post) => {
    const postUrl = `${BASE_URL}/post/${post._id}`;
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
function buildNodeInfo() {
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
      users: {
        total: 1000
      }
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
  HOST_DOMAIN,
  BASE_URL
};

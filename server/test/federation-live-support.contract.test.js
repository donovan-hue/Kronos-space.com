const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const {
  extractUsername,
  buildWebFingerResponse,
  buildActorObject,
  buildOutboxCollection,
  buildNodeInfo
} = require("../src/modules/federation/federation.service");
const federationRouter = require("../src/modules/federation/federation.routes");
const liveRouter = require("../src/modules/live/live.routes");
const supportRouter = require("../src/modules/support/support.routes");

test("042: extractUsername y buildWebFingerResponse generan estructura RFC 7033", () => {
  const username = extractUsername("acct:astro_juan@kronos-space.com");
  assert.equal(username, "astro_juan");

  const invalid = extractUsername("acct:invalid@@domain");
  assert.equal(invalid, null);

  const mockUser = {
    username: "astro_juan",
    displayName: "Juan Astrónomo",
    bio: "Explorador estelar",
    avatar: "/uploads/avatars/juan.jpg"
  };

  const jrd = buildWebFingerResponse(mockUser, "kronos-space.com");
  assert.equal(jrd.subject, "acct:astro_juan@kronos-space.com");
  assert.ok(Array.isArray(jrd.links));
  const self = jrd.links.find((l) => l.rel === "self");
  assert.ok(self);
  assert.equal(self.type, "application/activity+json");
});

test("043: buildActorObject y buildOutboxCollection generan objetos conformes a ActivityStreams 2.0", () => {
  const mockUser = {
    username: "astro_maria",
    displayName: "María Astrofísica",
    bio: "Cazadora de exoplanetas",
    avatar: "/uploads/avatars/maria.jpg",
    cover: "/uploads/covers/maria.jpg",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    profilePrivacy: { discoverable: true }
  };

  const actor = buildActorObject(mockUser);
  assert.equal(actor.type, "Person");
  assert.equal(actor.preferredUsername, "astro_maria");
  assert.equal(actor.name, "María Astrofísica");
  assert.ok(actor.inbox.includes("/inbox"));
  assert.ok(actor.outbox.includes("/outbox"));
  assert.equal(actor.icon.type, "Image");

  const mockPosts = [
    {
      _id: "507f1f77bcf86cd799439011",
      content: "Nueva imagen captada del cúmulo globular",
      createdAt: new Date("2026-03-01T12:00:00Z")
    }
  ];

  const outbox = buildOutboxCollection(mockUser, mockPosts, 1);
  assert.equal(outbox.type, "OrderedCollection");
  assert.equal(outbox.totalItems, 1);
  assert.equal(outbox.orderedItems.length, 1);
  assert.equal(outbox.orderedItems[0].type, "Create");
  assert.equal(outbox.orderedItems[0].object.type, "Note");
  assert.equal(outbox.orderedItems[0].object.content, "Nueva imagen captada del cúmulo globular");
});

test("044: buildNodeInfo expone protocolo ActivityPub y metadatos", () => {
  const nodeInfo = buildNodeInfo();
  assert.equal(nodeInfo.version, "2.0");
  assert.equal(nodeInfo.software.name, "kronos-space");
  assert.ok(nodeInfo.protocols.includes("activitypub"));
});

test("045: endpoints de federación y salas en vivo responden y exigen autenticación en operaciones protegidas", async () => {
  const app = express();
  app.use(express.json());
  app.use("/", federationRouter);
  app.use("/api/live", liveRouter);
  app.use("/api/support", supportRouter);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // NodeInfo well-known
    const nodeRes = await fetch(`${baseUrl}/.well-known/nodeinfo`);
    assert.equal(nodeRes.status, 200);
    const nodeData = await nodeRes.json();
    assert.ok(nodeData.links.length > 0);

    // NodeInfo 2.0
    const infoRes = await fetch(`${baseUrl}/api/nodeinfo/2.0`);
    assert.equal(infoRes.status, 200);
    const infoData = await infoRes.json();
    assert.equal(infoData.software.name, "kronos-space");

    // Live create room (sin token) -> 401
    const createRoomRes = await fetch(`${baseUrl}/api/live/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Live Streaming" })
    });
    assert.equal(createRoomRes.status, 401);

    // Live join room (sin token) -> 401
    const joinRoomRes = await fetch(`${baseUrl}/api/live/rooms/507f1f77bcf86cd799439011/join`, {
      method: "PATCH"
    });
    assert.equal(joinRoomRes.status, 401);

    // Support tip (sin token) -> 401
    const tipRes = await fetch(`${baseUrl}/api/support/tip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorId: "507f1f77bcf86cd799439011", amount: 10 })
    });
    assert.equal(tipRes.status, 401);

    // Support history (sin token) -> 401
    const historyRes = await fetch(`${baseUrl}/api/support/history`);
    assert.equal(historyRes.status, 401);
  } finally {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

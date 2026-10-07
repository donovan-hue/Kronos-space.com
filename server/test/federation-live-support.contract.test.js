const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const {
  extractUsername,
  buildWebFingerResponse,
  buildActorObject,
  buildOutboxCollection,
  buildNodeInfo,
  federationOrigins
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
  assert.equal(nodeInfo.usage.users.total, undefined, "no se publica un total de usuarios inventado");
  assert.equal(buildNodeInfo({ totalUsers: 3 }).usage.users.total, 3);
});

test("044b: en producción los enlaces ActivityPub apuntan a la API, no al frontend estático", () => {
  const origins = federationOrigins({
    CANONICAL_HOST: "kronos-space.com",
    CLIENT_URL: "https://kronos-space.com,https://www.kronos-space.com",
    NODE_ENV: "production"
  });
  const user = { username: "astro", displayName: "Astro", bio: "secreto", profilePrivacy: { showBio: false }, avatar: "/uploads/avatars/a.jpg" };
  const actor = buildActorObject(user, origins);
  const finger = buildWebFingerResponse(user, origins.canonicalHost, origins);

  assert.equal(origins.apiOrigin, "https://api.kronos-space.com");
  assert.equal(origins.webOrigin, "https://kronos-space.com");
  assert.equal(actor.id, "https://api.kronos-space.com/api/federation/users/astro");
  assert.equal(actor.url, "https://kronos-space.com/profile/astro");
  assert.equal(actor.inbox, "https://api.kronos-space.com/api/federation/users/astro/inbox");
  assert.equal(actor.summary, "");
  assert.equal(actor.icon.url, "https://api.kronos-space.com/uploads/avatars/a.jpg");
  assert.equal(finger.links.find((link) => link.rel === "self").href, actor.id);
  assert.equal(finger.subject, "acct:astro@kronos-space.com");
});

test("044c: el apoyo simbólico solo acepta enteros de 1 a 1000", () => {
  assert.equal(supportRouter.parseSupportAmount(10), 10);
  assert.equal(supportRouter.parseSupportAmount("200"), 200);
  assert.equal(supportRouter.parseSupportAmount(1.5), null);
  assert.equal(supportRouter.parseSupportAmount(0), null);
  assert.equal(supportRouter.parseSupportAmount(1001), null);
  assert.equal(supportRouter.parseSupportAmount(-5), null);
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

test("045b: la bandeja federada de entrada declara su limitación con 501 y no simula éxito", async () => {
  // El handler consulta `User.findOne(...).select(...).lean()` antes de decidir.
  // Se sustituye ese único acceso a datos para poder ejercitar la rama real del
  // handler sin MongoDB: express, el router y el contrato HTTP son los de
  // producción. La sustitución vive solo dentro de este test.
  const User = require("../src/modules/users/User");
  const originalFindOne = User.findOne;
  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Create",
    actor: "https://remoto.example/users/spam",
    object: { type: "Note", content: "hola" }
  };

  let server;
  try {
    const app = express();
    app.use(express.json());
    app.use("/", federationRouter);
    server = app.listen(0);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Actor existente: el handler alcanza la rama real de la bandeja.
    User.findOne = () => ({
      select: () => ({
        lean: async () => ({ _id: "507f1f77bcf86cd799439011", username: "astro" })
      })
    });
    const inboxRes = await fetch(`${baseUrl}/api/federation/users/astro/inbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(activity)
    });
    assert.equal(inboxRes.status, 501);
    const inboxBody = await inboxRes.json();
    assert.equal(inboxBody.code, "FEDERATION_INBOX_NOT_IMPLEMENTED");
    assert.equal(inboxBody.accepted, undefined);
    assert.equal(inboxBody.queued, undefined);

    // Actor inexistente: 404 sin aceptar ni encolar nada.
    User.findOne = () => ({ select: () => ({ lean: async () => null }) });
    const missingRes = await fetch(`${baseUrl}/api/federation/users/nadie/inbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(activity)
    });
    assert.equal(missingRes.status, 404);
  } finally {
    User.findOne = originalFindOne;
    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test("045c: la bandeja federada responde el contrato de errores de la API (payload inválido, método incorrecto y almacenamiento caído)", async () => {
  // Aquí se usa la app REAL —el mismo express, los mismos limitadores, el
  // mismo manejador de errores y el mismo contrato de códigos que producción—
  // porque lo que se verifica es precisamente el comportamiento HTTP del
  // receptor ante entradas hostiles. Solo se abre el puerto efímero de la prueba.
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || "kronos-federation-inbox-contract-secret";
  const { server, io } = require("../src/server");
  const User = require("../src/modules/users/User");
  const originalFindOne = User.findOne;

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const inbox = `${baseUrl}/api/federation/users/astro/inbox`;
  const json = { "Content-Type": "application/json" };

  try {
    // 1. Cuerpo ilegible: 400 del contrato en español, no la página HTML de Express.
    const malformed = await fetch(inbox, {
      method: "POST",
      headers: json,
      body: '{ "type": '
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).code, "INVALID_JSON");

    // 2. Cuerpo por encima del límite (1 MB): 413 estable.
    const oversized = await fetch(inbox, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ x: "a".repeat(2 * 1024 * 1024) })
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).code, "PAYLOAD_TOO_LARGE");

    // 3. Método no declarado: la ruta solo existe para POST.
    const wrongMethod = await fetch(inbox);
    assert.equal(wrongMethod.status, 404);
    assert.equal((await wrongMethod.json()).code, "NOT_FOUND");

    // 4. Almacenamiento caído: 503 reintentable, no un 500 que culpe al receptor.
    User.findOne = () => {
      const error = new Error("Operation `users.findOne()` buffering timed out");
      error.name = "MongooseError";
      throw error;
    };
    const storageDown = await fetch(inbox, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ type: "Create" })
    });
    assert.equal(storageDown.status, 503);
    assert.equal((await storageDown.json()).code, "STORAGE_UNAVAILABLE");

    // 5. Con almacenamiento sano sigue declarando que no procesa nada: 501.
    User.findOne = () => ({
      select: () => ({
        lean: async () => ({ _id: "507f1f77bcf86cd799439011", username: "astro" })
      })
    });
    const declared = await fetch(inbox, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ type: "Create" })
    });
    assert.equal(declared.status, 501);
    assert.equal((await declared.json()).code, "FEDERATION_INBOX_NOT_IMPLEMENTED");
  } finally {
    User.findOne = originalFindOne;
    await new Promise((resolve) => io.close(resolve));
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
});

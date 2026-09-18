const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { io: ioClient } = require("socket.io-client");

/**
 * BLOQUE 008 (KRONOS-UI-019…024) — verificación real sobre MongoDB.
 *
 * MISMA DISCIPLINA QUE EL BLOQUE 007-016 (sin repetir su alcance):
 * sin dobles, sin persistencia simulada y sin base en memoria. Exige
 * `MONGODB_URI` y trabaja en una base temporal propia
 * (`kronos_e2e_<aleatorio>`) que se elimina al terminar. Nunca
 * escribe en la base configurada por el despliegue.
 *
 * Cubre:
 * - 019 adjuntos de mensaje (upload real + persistencia + /uploads).
 * - 020 presencia (REST `online` + socket `presence:changed`) y typing
 *   (retransmisión solo al peer, con throttle).
 * - 021 reintentos idempotentes (`clientMessageId`) y estados
 *   entregado/leído reales en base.
 * - 022 grupos: creación, membresía, mensajes, readBy, gestión de
 *   miembros, sala de socket con verificación.
 * - 023 catálogo de notificaciones (tipos reales + supresión por
 *   bloqueo, contrato de 011).
 * - 024 filtros por tipo y paginación sin duplicados.
 *
 * Uso:
 *   cd server && MONGODB_URI="mongodb+srv://..." npm test
 * o desde la raíz: npm run test:e2e
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
  quiet: true
});

process.env.JWT_SECRET =
  process.env.JWT_SECRET || "kronos-block-019-024-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");
const User = require("../src/modules/users/User");
const Post = require("../src/modules/posts/Post");
const Message = require("../src/modules/messages/Message");
const Conversation = require("../src/modules/conversations/Conversation");
const Notification = require("../src/modules/notifications/Notification");
const Block = require("../src/modules/moderation/Block");
const Mute = require("../src/modules/moderation/Mute");
const HiddenPost = require("../src/modules/moderation/HiddenPost");
const { Report } = require("../src/modules/moderation/Report");
const {
  RefreshToken,
  SessionRevocation
} = require("../src/modules/auth/session.service");

const mongoConfigured = Boolean(process.env.MONGODB_URI);

const tempDatabaseName = `kronos_e2e_${crypto
  .randomBytes(6)
  .toString("hex")}`;

const PASSWORD = "KronosBlock123!";

let baseUrl;
let dbConnected = false;

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) {
      t.skip(
        "Requiere MONGODB_URI real (base temporal kronos_e2e_*). Sin URI no se simula persistencia."
      );
      return;
    }
    await fn(t);
  });
}

async function request(path, { method = "GET", token, body, form } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: form || (body ? JSON.stringify(body) : undefined)
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, data };
}

async function registerUser() {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `kronos.e2e.${suffix}@example.com`;
  const { status, data } = await request("/api/auth/register", {
    method: "POST",
    body: {
      username: `e2e_${suffix}`,
      email,
      password: PASSWORD,
      displayName: "E2E Kronos"
    }
  });

  assert.strictEqual(status, 201, JSON.stringify(data));

  return {
    id: data.user.id,
    email,
    username: data.user.username,
    token: data.token,
    refreshToken: data.refreshToken
  };
}

async function createPost(token, content) {
  const { status, data } = await request("/api/posts", {
    method: "POST",
    token,
    body: { content }
  });

  assert.strictEqual(status, 201, JSON.stringify(data));

  return data.post;
}

/** PNG 1x1 válido (firma real verificada por el middleware de upload). */
const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);

function pngForm(field, filename = "media.png") {
  const form = new FormData();
  form.append(field, new Blob([PNG_BUFFER], { type: "image/png" }), filename);
  return form;
}

// ---------------------------------------------------------------
// Helpers de socket (client real contra el server real)
// ---------------------------------------------------------------

function connectSocket(token) {
  const socket = ioClient(baseUrl, {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
    timeout: 5000
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("TIMEOUT_CONNECT_SOCKET")),
      6000
    );
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForEvent(socket, event, predicate, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`TIMEOUT_EVENT:${event}`));
    }, timeout);
    const handler = (payload) => {
      if (!predicate || predicate(payload)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      }
    };
    socket.on(event, handler);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test.before(async () => {
  if (mongoConfigured) {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: tempDatabaseName,
      serverSelectionTimeoutMS: 15000
    });

    dbConnected = true;

    await Promise.all([
      User.deleteMany({}),
      Post.deleteMany({}),
      Message.deleteMany({}),
      Conversation.deleteMany({}),
      Notification.deleteMany({}),
      Block.deleteMany({}),
      Mute.deleteMany({}),
      HiddenPost.deleteMany({}),
      Report.deleteMany({}),
      RefreshToken.deleteMany({}),
      SessionRevocation.deleteMany({})
    ]);
  }

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));

  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }

  if (dbConnected) {
    if (tempDatabaseName.startsWith("kronos_e2e_")) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  }
});

// ---------------------------------------------------------------
// 019 — adjuntos de mensaje
// ---------------------------------------------------------------

mongoTest("019: adjunto se sube, viaja en el mensaje, persiste y se sirve", async () => {
  const a = await registerUser();
  const b = await registerUser();

  const upload = await request("/api/messages/media/upload", {
    method: "POST",
    token: a.token,
    form: pngForm("media")
  });

  assert.strictEqual(upload.status, 201, JSON.stringify(upload.data));
  assert.match(upload.data.url, /^\/uploads\/media\//);
  assert.strictEqual(upload.data.mimeType, "image/png");

  const served = await fetch(`${baseUrl}${upload.data.url}`);
  assert.strictEqual(served.status, 200, "el adjunto se sirve desde /uploads");

  const sent = await request(`/api/messages/${b.id}`, {
    method: "POST",
    token: a.token,
    body: {
      text: "Mira esto",
      media: {
        url: upload.data.url,
        mimeType: upload.data.mimeType,
        size: upload.data.size,
        alt: "Adjunto de prueba"
      }
    }
  });

  assert.strictEqual(sent.status, 201, JSON.stringify(sent.data));
  assert.strictEqual(sent.data.message.media.alt, "Adjunto de prueba");

  const stored = await Message.findById(sent.data.message._id).lean();
  assert.strictEqual(stored.media.url, upload.data.url);
  assert.strictEqual(stored.media.mimeType, "image/png");
  assert.strictEqual(stored.text, "Mira esto");

  const listB = await request("/api/messages", { token: b.token });
  const conversation = listB.data.conversations.find(
    (item) => String(item.user?._id) === String(a.id)
  );
  assert.ok(conversation, "el adjunto aparece en la lista de conversaciones");
  assert.strictEqual(conversation.latestMessage.hasMedia, true);
});

mongoTest("019: solo URLs de /uploads/media y tipos permitidos", async () => {
  const a = await registerUser();
  const b = await registerUser();

  const foreignUrl = await request(`/api/messages/${b.id}`, {
    method: "POST",
    token: a.token,
    body: {
      text: "x",
      media: { url: "/uploads/avatars/otro.png", mimeType: "image/png", size: 10 }
    }
  });

  assert.strictEqual(foreignUrl.status, 400, "subdirectorios ajenos rechazados");

  const badType = await request(`/api/messages/${b.id}`, {
    method: "POST",
    token: a.token,
    body: {
      text: "x",
      media: {
        url: `/uploads/media/${Date.now()}.pdf`,
        mimeType: "application/pdf",
        size: 10
      }
    }
  });

  assert.strictEqual(badType.status, 400, "tipos no permitidos rechazados");

  const empty = await request(`/api/messages/${b.id}`, {
    method: "POST",
    token: a.token,
    body: { text: "   " }
  });

  assert.strictEqual(empty.status, 400, "sin texto ni media sigue siendo 400");
});

// ---------------------------------------------------------------
// 021 — reintentos idempotentes y estados
// ---------------------------------------------------------------

mongoTest("021: reenviar con el mismo clientMessageId no duplica", async () => {
  const a = await registerUser();
  const b = await registerUser();

  const first = await request(`/api/messages/${b.id}`, {
    method: "POST",
    token: a.token,
    body: { text: "prueba de reintento", clientMessageId: "retry-001" }
  });

  assert.strictEqual(first.status, 201, JSON.stringify(first.data));
  assert.strictEqual(first.data.deduplicated, false);

  const retry = await request(`/api/messages/${b.id}`, {
    method: "POST",
    token: a.token,
    body: { text: "prueba de reintento", clientMessageId: "retry-001" }
  });

  assert.strictEqual(retry.status, 200, "el reenvío devuelve el original");
  assert.strictEqual(retry.data.deduplicated, true);
  assert.strictEqual(retry.data.message._id, first.data.message._id);

  const count = await Message.countDocuments({
    sender: a.id,
    receiver: b.id,
    text: "prueba de reintento"
  });

  assert.strictEqual(count, 1, "exactly un mensaje en la base");
});

mongoTest("021: abrir entrega y leer marcan estados reales", async () => {
  const a = await registerUser();
  const b = await registerUser();

  const sent = await request(`/api/messages/${b.id}`, {
    method: "POST",
    token: a.token,
    body: { text: "mensaje para estados" }
  });

  assert.strictEqual(sent.status, 201);
  const messageId = sent.data.message._id;

  // B abre la conversación: entrega + lee.
  const open = await request(`/api/messages/${a.id}`, { token: b.token });
  assert.strictEqual(open.status, 200);

  const delivered = await request(`/api/messages/${a.id}/delivered`, {
    method: "PATCH",
    token: b.token
  });
  assert.strictEqual(delivered.status, 200);

  const read = await request(`/api/messages/${a.id}/read`, {
    method: "PATCH",
    token: b.token
  });
  assert.strictEqual(read.status, 200);

  const stored = await Message.findById(messageId).lean();
  assert.strictEqual(stored.delivered, true);
  assert.strictEqual(stored.read, true);

  // A lo ve en su propia vista (el receptor leyó).
  const viewA = await request(`/api/messages/${b.id}`, { token: a.token });
  const own = viewA.data.messages.find((message) => message._id === messageId);
  assert.ok(own);
  assert.strictEqual(own.read, true, "el autor ve su mensaje como leído");
  assert.strictEqual(own.delivered, true);
});

// ---------------------------------------------------------------
// 020 — presencia y typing
// ---------------------------------------------------------------

mongoTest("020: presencia visible por REST y presencia:changed por socket", async () => {
  const a = await registerUser();
  const b = await registerUser();
  const observer = await registerUser();

  const before = await request(`/api/messages/${a.id}`, { token: b.token });
  assert.strictEqual(before.status, 200);
  assert.strictEqual(before.data.online, false, "sin socket, no está en línea");

  // El observer se conecta PRIMERO para capturar ambos cambios.
  const socketObs = await connectSocket(observer.token);

  const cameOnline = waitForEvent(socketObs, "presence:changed", (payload) =>
    String(payload.userId) === String(a.id) && payload.online === true
  );

  const socketA = await connectSocket(a.token);
  await cameOnline;

  const whileOnline = await request(`/api/messages/${a.id}`, { token: b.token });
  assert.strictEqual(whileOnline.data.online, true, "con socket, está en línea");

  const wentOffline = waitForEvent(socketObs, "presence:changed", (payload) =>
    String(payload.userId) === String(a.id) && payload.online === false
  );

  socketA.disconnect();
  await wentOffline;

  await sleep(100);

  const afterOffline = await request(`/api/messages/${a.id}`, { token: b.token });
  assert.strictEqual(afterOffline.data.online, false, "al salir, deja de estar en línea");

  socketObs.disconnect();
});

mongoTest("020: typing llega solo al peer y con throttle", async () => {
  const a = await registerUser();
  const b = await registerUser();
  const c = await registerUser();

  const socketA = await connectSocket(a.token);
  const socketB = await connectSocket(b.token);
  const socketC = await connectSocket(c.token);

  let leakedToC = 0;
  socketC.on("typing:start", () => {
    leakedToC += 1;
  });

  let countAtB = 0;
  socketB.on("typing:start", (payload) => {
    if (String(payload.from) === String(a.id)) countAtB += 1;
  });

  // Ráfaga: el throttle (500 ms por socket) debe dejar pasar solo 1-2.
  for (let index = 0; index < 6; index += 1) {
    socketA.emit("typing:start", { peerId: b.id });
  }

  await sleep(400);

  assert.ok(countAtB >= 1, "el peer recibe typing");
  assert.ok(countAtB <= 2, `el throttle acota la ráfaga (llegaron ${countAtB})`);
  assert.strictEqual(leakedToC, 0, "un tercero no recibe el typing ajeno");

  // typing a uno mismo se descarta.
  socketA.emit("typing:start", { peerId: a.id });
  await sleep(200);
  assert.ok(countAtB <= 2, "self-typing no se retransmite");

  socketA.disconnect();
  socketB.disconnect();
  socketC.disconnect();
});

// ---------------------------------------------------------------
// 022 — grupos
// ---------------------------------------------------------------

mongoTest("022: creación de grupo con validaciones y duplicados", async () => {
  const a = await registerUser();
  const b = await registerUser();
  const c = await registerUser();

  const created = await request("/api/conversations", {
    method: "POST",
    token: a.token,
    body: { name: "Equipo E2E", memberIds: [b.id, c.id] }
  });

  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  assert.strictEqual(created.data.conversation.members.length, 3, "el creador se agrega");
  assert.ok(created.data.conversation.members.some((member) => String(member._id) === String(a.id)));

  const duplicate = await request("/api/conversations", {
    method: "POST",
    token: b.token,
    body: { memberIds: [a.id, c.id] }
  });

  assert.strictEqual(duplicate.status, 409, "mismo conjunto de miembros");
  assert.strictEqual(duplicate.data.code, "CONVERSATION_EXISTS");

  const missing = await request("/api/conversations", {
    method: "POST",
    token: a.token,
    body: { memberIds: [new mongoose.Types.ObjectId().toString()] }
  });

  assert.strictEqual(missing.status, 400);
  assert.strictEqual(missing.data.code, "USERS_NOT_FOUND");
});

mongoTest("022: mensajes de grupo exigen membresía y leen con readBy", async () => {
  const a = await registerUser();
  const b = await registerUser();
  const c = await registerUser();
  const d = await registerUser();

  const created = await request("/api/conversations", {
    method: "POST",
    token: a.token,
    body: { name: "Grupo mensajes", memberIds: [b.id, c.id] }
  });
  const conversationId = created.data.conversation._id;

  const foreignList = await request(`/api/conversations/${conversationId}/messages`, {
    token: d.token
  });
  assert.strictEqual(foreignList.status, 403);
  assert.strictEqual(foreignList.data.code, "CONVERSATION_NOT_MEMBER");

  const foreignSend = await request(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    token: d.token,
    body: { text: "intruso" }
  });
  assert.strictEqual(foreignSend.status, 403);

  const sendA = await request(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    token: a.token,
    body: { text: "hola grupo" }
  });
  assert.strictEqual(sendA.status, 201, JSON.stringify(sendA.data));

  await request(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    token: b.token,
    body: { text: "hola de B" }
  });

  const readB = await request(`/api/conversations/${conversationId}/read`, {
    method: "PATCH",
    token: b.token
  });
  assert.strictEqual(readB.status, 200);

  const storedA = await Message.findById(sendA.data.message._id).lean();
  assert.ok(
    String(storedA.readBy).includes(String(b.id)) ||
      (Array.isArray(storedA.readBy) && storedA.readBy.some((id) => String(id) === String(b.id))),
    "readBy registra al lector real"
  );
  assert.strictEqual(storedA.delivered, true);

  const viewB = await request(`/api/conversations/${conversationId}/messages`, {
    token: b.token
  });
  assert.strictEqual(viewB.status, 200);
  assert.ok(viewB.data.messages.some((message) => message.text === "hola grupo"));

  // C aún no ha leído: la lista de grupos muestra no leídos.
  const listC = await request("/api/conversations", { token: c.token });
  const groupC = listC.data.conversations.find(
    (item) => String(item._id) === String(conversationId)
  );
  assert.ok(groupC, "el grupo aparece en la lista de C");
  assert.ok(groupC.unreadCount >= 2, `C tiene no leídos reales (got ${groupC.unreadCount})`);
  assert.ok(groupC.latestMessage, "la lista trae el último mensaje");
});

mongoTest("022: sala de socket solo para miembros (join verificado)", async () => {
  const a = await registerUser();
  const b = await registerUser();
  const d = await registerUser();

  const created = await request("/api/conversations", {
    method: "POST",
    token: a.token,
    body: { memberIds: [b.id] }
  });
  const conversationId = created.data.conversation._id;

  const socketB = await connectSocket(b.token);
  const socketD = await connectSocket(d.token);

  const joined = waitForEvent(socketB, "conversation:joined", (payload) =>
    String(payload.conversationId) === String(conversationId)
  );
  socketB.emit("conversation:join", { conversationId });
  await joined;

  const denyJoin = waitForEvent(socketD, "conversation:error", (payload) =>
    String(payload.conversationId) === String(conversationId)
  );
  socketD.emit("conversation:join", { conversationId });
  const denied = await denyJoin;
  assert.strictEqual(denied.code, "CONVERSATION_NOT_MEMBER");

  const receivedByB = waitForEvent(socketB, "message:new", (payload) =>
    String(payload.conversation) === String(conversationId)
  );

  const sent = await request(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    token: a.token,
    body: { text: "mensaje de sala" }
  });
  assert.strictEqual(sent.status, 201);

  const live = await receivedByB;
  assert.strictEqual(live.text, "mensaje de sala");

  socketB.disconnect();
  socketD.disconnect();
});

mongoTest("022: solo el creador gestiona miembros; límites 2-10", async () => {
  const a = await registerUser();
  const b = await registerUser();
  const c = await registerUser();

  const created = await request("/api/conversations", {
    method: "POST",
    token: a.token,
    body: { memberIds: [b.id, c.id] }
  });
  const conversationId = created.data.conversation._id;

  const byNonCreator = await request(`/api/conversations/${conversationId}/members`, {
    method: "PATCH",
    token: b.token,
    body: { add: [] }
  });
  assert.strictEqual(byNonCreator.status, 403);
  assert.strictEqual(byNonCreator.data.code, "NOT_CREATOR");

  const d = await registerUser();
  const add = await request(`/api/conversations/${conversationId}/members`, {
    method: "PATCH",
    token: a.token,
    body: { add: [d.id] }
  });
  assert.strictEqual(add.status, 200);
  assert.strictEqual(add.data.conversation.members.length, 4);

  const addExisting = await request(`/api/conversations/${conversationId}/members`, {
    method: "PATCH",
    token: a.token,
    body: { add: [b.id] }
  });
  assert.strictEqual(addExisting.status, 409);
  assert.strictEqual(addExisting.data.code, "MEMBER_EXISTS");

  const removeSelf = await request(`/api/conversations/${conversationId}/members`, {
    method: "PATCH",
    token: a.token,
    body: { remove: [a.id] }
  });
  assert.strictEqual(removeSelf.status, 400);
  assert.strictEqual(removeSelf.data.code, "CREATOR_LOCKED");

  // Quitar hasta quedar 1 → 400.
  const removeMany = await request(`/api/conversations/${conversationId}/members`, {
    method: "PATCH",
    token: a.token,
    body: { remove: [b.id, c.id, d.id] }
  });
  assert.strictEqual(removeMany.status, 400);
  assert.strictEqual(removeMany.data.code, "MEMBER_COUNT");

  // Quitar uno: el expulsado pierde acceso al hilo.
  const removeOne = await request(`/api/conversations/${conversationId}/members`, {
    method: "PATCH",
    token: a.token,
    body: { remove: [c.id] }
  });
  assert.strictEqual(removeOne.status, 200);

  const evictedView = await request(`/api/conversations/${conversationId}/messages`, {
    token: c.token
  });
  assert.strictEqual(evictedView.status, 403, "expulsado pierde acceso");

  // El creador no puede eliminarse a sí mismo: el grupo se elimina solo
  // con DELETE (también solo creador).
  const deleteByOther = await request(`/api/conversations/${conversationId}`, {
    method: "DELETE",
    token: b.token
  });
  assert.strictEqual(deleteByOther.status, 403);

  const deleted = await request(`/api/conversations/${conversationId}`, {
    method: "DELETE",
    token: a.token
  });
  assert.strictEqual(deleted.status, 200);
  assert.strictEqual(await Conversation.exists({ _id: conversationId }), null);
});

mongoTest("022: límite máximo de 10 miembros por conversación", async () => {
  const a = await registerUser();
  const others = [];

  for (let index = 0; index < 9; index += 1) {
    others.push(await registerUser());
  }

  const created = await request("/api/conversations", {
    method: "POST",
    token: a.token,
    body: { memberIds: others.map((user) => user.id) }
  });
  assert.strictEqual(created.status, 201, "10 miembros es válido");
  const conversationId = created.data.conversation._id;

  const extra = await registerUser();
  const overflow = await request(`/api/conversations/${conversationId}/members`, {
    method: "PATCH",
    token: a.token,
    body: { add: [extra.id] }
  });
  assert.strictEqual(overflow.status, 400, "11 miembros es inválido");
  assert.strictEqual(overflow.data.code, "MEMBER_COUNT");
});

// ---------------------------------------------------------------
// 023 — catálogo de notificaciones
// ---------------------------------------------------------------

mongoTest("023: cada tipo del catálogo se crea con su type real", async () => {
  const r = await registerUser(); // receptor
  const a1 = await registerUser();
  const a2 = await registerUser();
  const a3 = await registerUser();
  const a4 = await registerUser();

  const post1 = await createPost(r.token, "post para like 1");
  const post2 = await createPost(r.token, "post para like 2");
  const post3 = await createPost(r.token, "post para comentario");
  const post4 = await createPost(r.token, "post para republicar");

  await request(`/api/posts/${post1._id}/like`, { method: "POST", token: a1.token });
  await request(`/api/posts/${post2._id}/like`, { method: "POST", token: a2.token });
  await request(`/api/posts/${post3._id}/comments`, {
    method: "POST",
    token: a3.token,
    body: { content: "comentario real" }
  });
  await request(`/api/posts/${post4._id}/repost`, { method: "POST", token: a4.token });
  await request(`/api/users/${r.id}/follow`, { method: "POST", token: a1.token });

  const list = await request("/notifications", { token: r.token });
  assert.strictEqual(list.status, 200);

  const types = list.data.notifications.map((item) => item.type);
  assert.ok(types.includes("like"), "like en el catálogo");
  assert.ok(types.includes("comment"), "comment en el catálogo");
  assert.ok(types.includes("repost"), "repost en el catálogo");
  assert.ok(types.includes("follow"), "follow en el catálogo");

  // Las notificaciones no se auto-crean (actor != receptor).
  const selfCount = await Notification.countDocuments({
    recipient: a1.id,
    actor: a1.id
  });
  assert.strictEqual(selfCount, 0);
});

mongoTest("023: un bloqueo suprime la notificación (efecto 011)", async () => {
  const r = await registerUser();
  const a = await registerUser();

  const before = await request("/notifications", { token: r.token });
  const baseline = before.data.notifications.length;

  await request(`/api/moderation/blocks/${a.id}`, {
    method: "POST",
    token: r.token
  });

  assert.ok(await Block.exists({ blocker: r.id, blocked: a.id }));

  const post = await createPost(r.token, "post mientras hay bloqueo");
  const like = await request(`/api/posts/${post._id}/like`, {
    method: "POST",
    token: a.token
  });
  assert.strictEqual(like.status, 403, "el bloqueado no puede actuar sobre quien lo bloquea");

  const after = await request("/notifications", { token: r.token });
  assert.strictEqual(
    after.data.notifications.length,
    baseline,
    "quien bloqueó no recibe notificaciones del bloqueado"
  );
});

// ---------------------------------------------------------------
// 024 — filtros y paginación
// ---------------------------------------------------------------

mongoTest("024: filtros por tipo y paginación coherente sin duplicados", async () => {
  const r = await registerUser();
  const actors = [];

  for (let index = 0; index < 5; index += 1) {
    actors.push(await registerUser());
  }

  // 4 likes + 2 comments + 1 follow = 7 notificaciones para r.
  for (let index = 0; index < 4; index += 1) {
    const post = await createPost(r.token, `post like ${index}`);
    await request(`/api/posts/${post._id}/like`, { method: "POST", token: actors[index].token });
  }
  for (let index = 0; index < 2; index += 1) {
    const post = await createPost(r.token, `post comment ${index}`);
    await request(`/api/posts/${post._id}/comments`, {
      method: "POST",
      token: actors[index].token,
      body: { content: "comentario e2e" }
    });
  }
  await request(`/api/users/${r.id}/follow`, { method: "POST", token: actors[4].token });

  const all = await request("/notifications?limit=100", { token: r.token });
  assert.strictEqual(all.data.total, 7, "7 notificaciones creadas de verdad");
  assert.strictEqual(all.data.unreadCount, 7);

  const likes = await request("/notifications?type=like", { token: r.token });
  assert.strictEqual(likes.data.total, 4);
  assert.ok(
    likes.data.notifications.every((item) => item.type === "like"),
    "el filtro solo devuelve likes"
  );

  const mixed = await request("/notifications?type=comment,follow", { token: r.token });
  assert.strictEqual(mixed.data.total, 3);
  assert.ok(
    mixed.data.notifications.every((item) => ["comment", "follow"].includes(item.type))
  );

  const invalid = await request("/notifications?type=noexiste", { token: r.token });
  assert.strictEqual(invalid.status, 400);
  assert.strictEqual(invalid.data.code, "INVALID_TYPE");

  const page1 = await request("/notifications?limit=3&page=1", { token: r.token });
  assert.strictEqual(page1.data.notifications.length, 3);
  assert.strictEqual(page1.data.hasMore, true);
  assert.strictEqual(page1.data.total, 7);

  const page2 = await request("/notifications?limit=3&page=2", { token: r.token });
  assert.strictEqual(page2.data.notifications.length, 3);
  const idsPage1 = new Set(page1.data.notifications.map((item) => item._id));
  assert.ok(
    page2.data.notifications.every((item) => !idsPage1.has(item._id)),
    "las páginas no se solapan"
  );

  const page3 = await request("/notifications?limit=3&page=3", { token: r.token });
  assert.strictEqual(page3.data.notifications.length, 1);
  assert.strictEqual(page3.data.hasMore, false);

  const beyond = await request("/notifications?limit=3&page=4", { token: r.token });
  assert.strictEqual(beyond.data.notifications.length, 0);
  assert.strictEqual(beyond.data.hasMore, false);
});

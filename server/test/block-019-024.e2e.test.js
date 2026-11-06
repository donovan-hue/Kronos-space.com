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
const Message = require("../src/modules/messages/Message");
const Conversation = require("../src/modules/conversations/Conversation");
const Notification = require("../src/modules/notifications/Notification");
const Block = require("../src/modules/moderation/Block");
const { } = require("../src/modules/moderation/Report");
const Post = require("../src/modules/posts/Post");
const { assertE2ETarget } = require("./helpers/e2e-target-guard");
const { connectE2E, cleanupE2E, clearNewDocuments } = require("./helpers/e2e-database");
const {
} = require("../src/modules/auth/session.service");

let mongoConfigured = Boolean(process.env.KRONOS_E2E_MONGODB_URI);

const tempDatabaseName = "test";

// R-12 — fail-closed: no se conecta a un clúster que no se pueda demostrar de
// pruebas. `dbName` protege la BASE, no el CLÚSTER: si la URI apuntara al
// servicio real, estas pruebas escribirían en su infraestructura.
if (mongoConfigured) {
  mongoConfigured = assertE2ETarget({
    uri: process.env.KRONOS_E2E_MONGODB_URI,
    dbName: tempDatabaseName
  });
}

const PASSWORD = "KronosBlock123!";

let baseUrl;
let dbConnected = false;

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) {
      t.skip(
        "Requiere KRONOS_E2E_MONGODB_URI real (base Atlas test)."
      );
      return;
    }
    try {
      await fn(t);
    } catch (error) {
      // Diagnóstico para CI: el detalle del fallo sale con un marcador
      // único que el workflow convierte en anotación legible (el TAP
      // de node --test no siempre lo expone de forma utilizable).
      const detail = [
        error && error.name ? error.name : "Error",
        error && error.message ? error.message : String(error)
      ]
        .join(": ")
        .replace(/\s+/g, " ")
        .slice(0, 500);
      console.log(`KRONOS_E2E_FAIL [${name}] :: ${detail}`);
      throw error;
    }
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

  // En el navegador la cookie de medios acompaña a <img>/<video>. Node
  // permite leer cada Set-Cookie; el fallback cubre versiones sin esa API.
  const mediaCookie = (response.headers.getSetCookie?.() || [response.headers.get("set-cookie") || ""])
    .map((cookie) => cookie.match(/(?:^|,\s*)(kronos_media_token=[^;,]+)/)?.[1])
    .find(Boolean) || "";

  return { status: response.status, data, mediaCookie };
}

async function registerUser() {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `kronos.e2e.${suffix}@example.com`;
  const { status, data, mediaCookie } = await request("/api/auth/register", {
    method: "POST",
    body: {
      username: `e2e_${suffix}`,
      email,
      password: PASSWORD,
      displayName: "E2E Kronos"
    }
  });

  assert.strictEqual(status, 201, JSON.stringify(data));
  assert.ok(mediaCookie, "el registro debe emitir la cookie de acceso a multimedia");

  return {
    id: data.user.id,
    email,
    username: data.user.username,
    token: data.token,
    refreshToken: data.refreshToken,
    mediaCookie
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
    await connectE2E();

    dbConnected = true;
    await clearNewDocuments();
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
    await cleanupE2E();
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

  const served = await fetch(`${baseUrl}${upload.data.url}`, {
    headers: { Cookie: a.mediaCookie }
  });
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
  assert.strictEqual(listB.status, 200, JSON.stringify(listB.data));
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
  assert.strictEqual(listC.status, 200, JSON.stringify(listC.data));
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

mongoTest("022: solo el dueño o un admin gestionan miembros; límites 2-10", async () => {
  const a = await registerUser();
  const b = await registerUser();
  const c = await registerUser();

  const created = await request("/api/conversations", {
    method: "POST",
    token: a.token,
    body: { memberIds: [b.id, c.id] }
  });
  const conversationId = created.data.conversation._id;

  // Un miembro que no es administrador no gestiona nada. El código es
  // NOT_ADMIN (no NOT_CREATOR) desde que existen administradores delegados:
  // el dueño dejó de ser el único que puede tocar la lista de miembros.
  const byNonAdmin = await request(`/api/conversations/${conversationId}/members`, {
    method: "PATCH",
    token: b.token,
    body: { add: [] }
  });
  assert.strictEqual(byNonAdmin.status, 403);
  assert.strictEqual(byNonAdmin.data.code, "NOT_ADMIN");

  // El dueño nombra administrador a b; solo el dueño puede hacerlo.
  const promotedByMember = await request(`/api/conversations/${conversationId}/admins`, {
    method: "PATCH",
    token: c.token,
    body: { add: [c.id] }
  });
  assert.strictEqual(promotedByMember.status, 403);
  assert.strictEqual(promotedByMember.data.code, "NOT_OWNER");

  const promoted = await request(`/api/conversations/${conversationId}/admins`, {
    method: "PATCH",
    token: a.token,
    body: { add: [b.id] }
  });
  assert.strictEqual(promoted.status, 200, JSON.stringify(promoted.data));
  assert.ok(
    promoted.data.conversation.admins.some((admin) => String(admin._id || admin) === String(b.id)),
    "el dueño puede nombrar administradores"
  );

  // Ya como administrador, b sí puede añadir miembros.
  const d = await registerUser();
  const add = await request(`/api/conversations/${conversationId}/members`, {
    method: "PATCH",
    token: b.token,
    body: { add: [d.id] }
  });
  assert.strictEqual(add.status, 200, JSON.stringify(add.data));
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

  const list = await request("/api/notifications", { token: r.token });
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

  const before = await request("/api/notifications", { token: r.token });
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

  const after = await request("/api/notifications", { token: r.token });
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

  const all = await request("/api/notifications?limit=100", { token: r.token });
  assert.strictEqual(all.data.total, 7, "7 notificaciones creadas de verdad");
  assert.strictEqual(all.data.unreadCount, 7);

  const likes = await request("/api/notifications?type=like", { token: r.token });
  assert.strictEqual(likes.data.total, 4);
  assert.ok(
    likes.data.notifications.every((item) => item.type === "like"),
    "el filtro solo devuelve likes"
  );

  const mixed = await request("/api/notifications?type=comment,follow", { token: r.token });
  assert.strictEqual(mixed.data.total, 3);
  assert.ok(
    mixed.data.notifications.every((item) => ["comment", "follow"].includes(item.type))
  );

  const invalid = await request("/api/notifications?type=noexiste", { token: r.token });
  assert.strictEqual(invalid.status, 400);
  assert.strictEqual(invalid.data.code, "INVALID_TYPE");

  const page1 = await request("/api/notifications?limit=3&page=1", { token: r.token });
  assert.strictEqual(page1.data.notifications.length, 3);
  assert.strictEqual(page1.data.hasMore, true);
  assert.strictEqual(page1.data.total, 7);

  const page2 = await request("/api/notifications?limit=3&page=2", { token: r.token });
  assert.strictEqual(page2.data.notifications.length, 3);
  const idsPage1 = new Set(page1.data.notifications.map((item) => item._id));
  assert.ok(
    page2.data.notifications.every((item) => !idsPage1.has(item._id)),
    "las páginas no se solapan"
  );

  const page3 = await request("/api/notifications?limit=3&page=3", { token: r.token });
  assert.strictEqual(page3.data.notifications.length, 1);
  assert.strictEqual(page3.data.hasMore, false);

  const beyond = await request("/api/notifications?limit=3&page=4", { token: r.token });
  assert.strictEqual(beyond.data.notifications.length, 0);
  assert.strictEqual(beyond.data.hasMore, false);
});

// ---------------------------------------------------------------
// 025 — emisores que faltaban y destino (`ref`) del aviso
//
// El catálogo declaraba tipos sin emisor (`save`) y había acciones que no
// avisaban a nadie (guardar, confirmar un evento, responder una historia,
// invitar a una cápsula o a una sala). Además, todo aviso sin publicación
// terminaba en el perfil del actor porque no llevaba a qué se refería.
// ---------------------------------------------------------------

mongoTest("025: guardar una publicación avisa al autor, quitarla no", async () => {
  const autor = await registerUser();
  const lector = await registerUser();
  const post = await createPost(autor.token, "post para guardar");

  const save = await request(`/api/posts/${post._id}/save`, {
    method: "POST",
    token: lector.token
  });
  assert.strictEqual(save.status, 200);
  assert.strictEqual(save.data.saved, true);

  const afterSave = await request("/api/notifications?type=save", { token: autor.token });
  assert.strictEqual(afterSave.data.total, 1);
  const [nota] = afterSave.data.notifications;
  assert.strictEqual(nota.type, "save");
  assert.strictEqual(String(nota.post?._id || nota.post), String(post._id));

  // Quitar el guardado es un toggle: no debe generar un segundo aviso.
  const unsave = await request(`/api/posts/${post._id}/save`, {
    method: "POST",
    token: lector.token
  });
  assert.strictEqual(unsave.data.saved, false);

  const afterUnsave = await request("/api/notifications?type=save", { token: autor.token });
  assert.strictEqual(afterUnsave.data.total, 1, "quitar el guardado no notifica");
});

mongoTest("025: el RSVP avisa al autor solo al confirmar o cambiar, no al retirarse", async () => {
  const autor = await registerUser();
  const invitado = await registerUser();
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();

  const created = await request("/api/posts", {
    method: "POST",
    token: autor.token,
    body: {
      content: "evento del bloque 1.1",
      event: {
        title: "Encuentro",
        startsAt,
        endsAt,
        // `locationType` es obligatorio desde que el evento distingue
        // presencial de en línea: sin él la publicación se rechaza con 400 y
        // este E2E nunca llegaba al RSVP que dice probar.
        locationType: "online",
        location: "En línea"
      }
    }
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  const postId = created.data.post._id;

  const going = await request(`/api/posts/${postId}/event/rsvp`, {
    method: "POST",
    token: invitado.token,
    body: { status: "going" }
  });
  assert.strictEqual(going.status, 200);

  const first = await request("/api/notifications?type=event", { token: autor.token });
  assert.strictEqual(first.data.total, 1, "confirmar el evento avisa al autor");

  // Repetir el mismo estado no es noticia.
  await request(`/api/posts/${postId}/event/rsvp`, {
    method: "POST",
    token: invitado.token,
    body: { status: "going" }
  });
  const repeated = await request("/api/notifications?type=event", { token: autor.token });
  assert.strictEqual(repeated.data.total, 1, "repetir el mismo estado no duplica el aviso");

  // Cambiar de opinión sí lo es.
  await request(`/api/posts/${postId}/event/rsvp`, {
    method: "POST",
    token: invitado.token,
    body: { status: "interested" }
  });
  const changed = await request("/api/notifications?type=event", { token: autor.token });
  assert.strictEqual(changed.data.total, 2, "cambiar la respuesta avisa");

  // Retirarse no genera aviso.
  await request(`/api/posts/${postId}/event/rsvp`, {
    method: "POST",
    token: invitado.token,
    body: { status: "none" }
  });
  const withdrawn = await request("/api/notifications?type=event", { token: autor.token });
  assert.strictEqual(withdrawn.data.total, 2, "retirarse no avisa");
});

mongoTest("025: responder una historia avisa al autor con destino a la historia", async () => {
  const autor = await registerUser();
  const lector = await registerUser();

  // El upload de media de publicación acepta imágenes y video; la historia exige
  // que la URL viva en /uploads de Kronos, así que se sube de verdad.
  const upload = await request("/api/posts/media/upload", {
    method: "POST",
    token: autor.token,
    form: pngForm("media")
  });
  assert.strictEqual(upload.status, 201, JSON.stringify(upload.data));

  const story = await request("/api/stories", {
    method: "POST",
    token: autor.token,
    body: {
      media: {
        url: upload.data.url,
        type: "image",
        mimeType: "image/png",
        size: 68
      },
      caption: "historia del bloque 1.1",
      audience: { type: "public" }
    }
  });
  assert.strictEqual(story.status, 201, JSON.stringify(story.data));
  const storyId = story.data.story?._id || story.data.story?.id;

  const reply = await request(`/api/stories/${storyId}/reply`, {
    method: "POST",
    token: lector.token,
    body: { text: "qué buena historia" }
  });
  assert.strictEqual(reply.status, 201, JSON.stringify(reply.data));

  const avisos = await request("/api/notifications?type=story", { token: autor.token });
  assert.strictEqual(avisos.data.total, 1, "la respuesta a la historia avisa");
  assert.strictEqual(avisos.data.notifications[0].ref?.kind, "story");
  assert.strictEqual(
    String(avisos.data.notifications[0].ref?.id),
    String(storyId),
    "el aviso apunta a la historia respondida"
  );
});

mongoTest("025: la invitación a una cápsula avisa antes de que se abra", async () => {
  const dueño = await registerUser();
  const colaborador = await registerUser();

  const capsule = await request("/api/capsules", {
    method: "POST",
    token: dueño.token,
    body: {
      title: "Cápsula del bloque 1.1",
      opensAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }
  });
  assert.strictEqual(capsule.status, 201, JSON.stringify(capsule.data));
  const capsuleId = capsule.data.capsule?._id || capsule.data.capsule?.id;

  const inviteeAntes = await request("/api/notifications?type=capsule", { token: colaborador.token });
  assert.strictEqual(inviteeAntes.data.total, 0);

  const invite = await request(`/api/capsules/${capsuleId}/invite`, {
    method: "POST",
    token: dueño.token,
    body: { username: colaborador.username }
  });
  assert.strictEqual(invite.status, 200, JSON.stringify(invite.data));

  const avisos = await request("/api/notifications?type=capsule", { token: colaborador.token });
  assert.strictEqual(avisos.data.total, 1, "la invitación avisa aunque la cápsula siga sellada");
  assert.strictEqual(avisos.data.notifications[0].ref?.kind, "capsule");
});

// ---------------------------------------------------------------
// 026 — encuestas cerrables y modo del feed por consulta (bloque 1.2)
// ---------------------------------------------------------------

mongoTest("026: el autor cierra su encuesta y deja de aceptar votos", async () => {
  const autor = await registerUser();
  const votante = await registerUser();

  const created = await request("/api/posts", {
    method: "POST",
    token: autor.token,
    body: {
      content: "",
      poll: { question: "¿Cerramos esto?", options: ["Sí", "Todavía no"] }
    }
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  const postId = created.data.post._id;
  assert.strictEqual(created.data.post.poll.closed, false);

  // El votante vota primero: el cierre no debe borrar lo ya votado.
  const vote = await request(`/api/posts/${postId}/poll/vote`, {
    method: "POST",
    token: votante.token,
    body: { optionId: created.data.post.poll.options[0]._id }
  });
  assert.strictEqual(vote.status, 200, JSON.stringify(vote.data));

  const foreign = await request(`/api/posts/${postId}/poll/close`, {
    method: "PATCH",
    token: votante.token
  });
  assert.strictEqual(foreign.status, 403, "solo el autor cierra su encuesta");

  const closed = await request(`/api/posts/${postId}/poll/close`, {
    method: "PATCH",
    token: autor.token
  });
  assert.strictEqual(closed.status, 200, JSON.stringify(closed.data));
  assert.strictEqual(closed.data.post.poll.closed, true);
  assert.ok(closed.data.post.poll.closedAt, "el cierre guarda su fecha");
  assert.strictEqual(closed.data.post.poll.totalVotes, 1, "el voto previo se conserva");

  const lateVote = await request(`/api/posts/${postId}/poll/vote`, {
    method: "POST",
    token: votante.token,
    body: { optionId: created.data.post.poll.options[1]._id }
  });
  assert.strictEqual(lateVote.status, 400);
  assert.strictEqual(lateVote.data.code, "POLL_CLOSED");

  const again = await request(`/api/posts/${postId}/poll/close`, {
    method: "PATCH",
    token: autor.token
  });
  assert.strictEqual(again.status, 409, "cerrar dos veces no es un éxito silencioso");
});

mongoTest("026: el RSVP se cierra con el evento y no admite respuestas tardías", async () => {
  const autor = await registerUser();
  const asistente = await registerUser();

  // El evento se crea en el futuro (la API rechaza los que ya empezaron) y se
  // adelanta el reloj en la base: así el RSVP tardío se prueba de verdad en
  // vez de quedarse en un 400 de validación de creación.
  const created = await request("/api/posts", {
    method: "POST",
    token: autor.token,
    body: {
      content: "evento que ya terminó",
      event: {
        title: "Ayer",
        startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        locationType: "online",
        location: "En línea"
      }
    }
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));

  await Post.updateOne(
    { _id: created.data.post._id },
    {
      $set: {
        "event.startsAt": new Date(Date.now() - 3 * 60 * 60 * 1000),
        "event.endsAt": new Date(Date.now() - 60 * 60 * 1000)
      }
    }
  );

  const late = await request(`/api/posts/${created.data.post._id}/event/rsvp`, {
    method: "POST",
    token: asistente.token,
    body: { status: "going" }
  });
  assert.strictEqual(late.status, 400);
  assert.strictEqual(late.data.error, "El evento ya terminó");
});

mongoTest("026: ?mode= cambia la vista del feed sin tocar la preferencia guardada", async () => {
  const autor = await registerUser();
  const seguidor = await registerUser();

  await createPost(autor.token, "post de alguien a quien no sigo");
  const propio = await createPost(seguidor.token, "post propio");
  await request(`/api/users/${autor.id}/follow`, { method: "POST", token: seguidor.token });

  const following = await request("/api/posts?mode=following", { token: seguidor.token });
  assert.strictEqual(following.status, 200);
  assert.ok(
    following.data.posts.every((post) => {
      const authorId = String(post.author?._id || post.author);
      return authorId === String(autor.id) || authorId === String(seguidor.id);
    }),
    "sin etiquetas de modo: todo lo que se ve es de quien sigo o mío"
  );
  assert.ok(
    following.data.posts.some((post) => String(post._id) === String(propio._id)),
    "lo propio también cuenta como «siguiendo»"
  );

  // Un modo inventado no rompe: cae en la preferencia guardada (latest).
  const bogus = await request("/api/posts?mode=inventado", { token: seguidor.token });
  assert.strictEqual(bogus.status, 200);

  // Y la preferencia del perfil sigue intacta tras usar el modo por URL: el
  // modo de vista es de la sesión, no una reescritura del perfil.
  const me = await request("/api/users/me", { token: seguidor.token });
  assert.strictEqual(me.status, 200);
  assert.notStrictEqual(
    me.data.user?.preferences?.feed?.mode ?? me.data.preferences?.feed?.mode,
    "following"
  );

  const vertical = await request("/api/posts/vertical?mode=following", { token: seguidor.token });
  assert.strictEqual(vertical.status, 200, "el feed vertical no se ve afectado por ?mode");
});

// ---------------------------------------------------------------
// 027 — mensajería del bloque 1.4: borrado, adjuntos y grupos
// ---------------------------------------------------------------

mongoTest("027: el autor borra su mensaje y el otro lado ve la lápida", async () => {
  const a = await registerUser();
  const b = await registerUser();

  const sent = await request(`/api/messages/${b.id}`, {
    method: "POST",
    token: a.token,
    body: { text: "esto no debía decirse" }
  });
  assert.strictEqual(sent.status, 201, JSON.stringify(sent.data));
  const messageId = sent.data.message._id;

  const foreign = await request(`/api/messages/${messageId}`, {
    method: "DELETE",
    token: b.token
  });
  assert.strictEqual(foreign.status, 403, "el destinatario no borra el mensaje ajeno");
  assert.strictEqual(foreign.data.code, "NOT_SENDER");

  const deleted = await request(`/api/messages/${messageId}`, {
    method: "DELETE",
    token: a.token
  });
  assert.strictEqual(deleted.status, 200, JSON.stringify(deleted.data));
  assert.ok(deleted.data.deletedAt);

  const thread = await request(`/api/messages/${a.id}`, { token: b.token });
  const stored = thread.data.messages.find((message) => String(message._id) === String(messageId));
  assert.ok(stored, "la lápida sigue en el hilo: el orden no se rompe");
  assert.strictEqual(stored.text, "");
  assert.ok(stored.deletedAt);
  assert.ok(!stored.media?.url, "la media se quita");

  const again = await request(`/api/messages/${messageId}`, {
    method: "DELETE",
    token: a.token
  });
  assert.strictEqual(again.status, 200, "reintentar el borrado es idempotente");
});

mongoTest("027: el hilo devuelve los últimos mensajes, no los primeros", async () => {
  const a = await registerUser();
  const b = await registerUser();

  // 205 mensajes: con el `sort({createdAt: 1}).limit(200)` anterior, el
  // último enviado no volvía al recargar.
  const bulk = Array.from({ length: 205 }, (_, index) => ({
    sender: a.id,
    receiver: b.id,
    text: `mensaje ${index + 1}`,
    createdAt: new Date(Date.now() + index * 1000)
  }));
  await Message.insertMany(bulk);

  const thread = await request(`/api/messages/${a.id}`, { token: b.token });
  assert.strictEqual(thread.status, 200);
  const texts = thread.data.messages.map((message) => message.text);
  assert.strictEqual(texts.length, 200);
  assert.ok(texts.includes("mensaje 205"), "el más reciente está en la respuesta");
  assert.ok(!texts.includes("mensaje 1"), "los más viejos quedan fuera");
  assert.strictEqual(texts[texts.length - 1], "mensaje 205", "y en orden cronológico");
});

mongoTest("027: solo el dueño o un admin renombran; cualquier otro miembro puede salir", async () => {
  const a = await registerUser();
  const b = await registerUser();
  const c = await registerUser();

  const created = await request("/api/conversations", {
    method: "POST",
    token: a.token,
    body: { name: "Sin nombre", memberIds: [b.id, c.id] }
  });
  const conversationId = created.data.conversation._id;

  const renamedByB = await request(`/api/conversations/${conversationId}`, {
    method: "PATCH",
    token: b.token,
    body: { name: "Secuestrado" }
  });
  assert.strictEqual(renamedByB.status, 403);
  // NOT_ADMIN, no NOT_CREATOR: quien no administra no renombra, y el dueño ya
  // no es el único autorizado (puede delegar en administradores).
  assert.strictEqual(renamedByB.data.code, "NOT_ADMIN");

  const renamed = await request(`/api/conversations/${conversationId}`, {
    method: "PATCH",
    token: a.token,
    body: { name: "  Los del barrio  " }
  });
  assert.strictEqual(renamed.status, 200, JSON.stringify(renamed.data));
  assert.strictEqual(renamed.data.conversation.name, "Los del barrio");
  assert.strictEqual(String(renamed.data.conversation.createdBy), String(a.id));

  const creatorLeaves = await request(`/api/conversations/${conversationId}/members/me`, {
    method: "DELETE",
    token: a.token
  });
  assert.strictEqual(creatorLeaves.status, 400);
  assert.strictEqual(creatorLeaves.data.code, "CREATOR_LOCKED");

  const bLeaves = await request(`/api/conversations/${conversationId}/members/me`, {
    method: "DELETE",
    token: b.token
  });
  assert.strictEqual(bLeaves.status, 200, JSON.stringify(bLeaves.data));
  assert.strictEqual(bLeaves.data.left, true);
  assert.strictEqual(bLeaves.data.deleted, false);

  const afterLeave = await request(`/api/conversations/${conversationId}/messages`, {
    token: b.token
  });
  assert.strictEqual(afterLeave.status, 403, "ya no es miembro: no lee el hilo");

  const groupsForB = await request("/api/conversations", { token: b.token });
  assert.ok(
    !groupsForB.data.conversations.some(
      (item) => String(item._id || item.conversation?._id) === String(conversationId)
    ),
    "el grupo desaparece de su lista"
  );
});

mongoTest("027: en un grupo solo se borra el mensaje propio y de ese grupo", async () => {
  const a = await registerUser();
  const b = await registerUser();
  const c = await registerUser();

  const first = await request("/api/conversations", {
    method: "POST",
    token: a.token,
    body: { name: "Uno", memberIds: [b.id] }
  });
  const second = await request("/api/conversations", {
    method: "POST",
    token: a.token,
    body: { name: "Dos", memberIds: [c.id] }
  });

  const sent = await request(`/api/conversations/${first.data.conversation._id}/messages`, {
    method: "POST",
    token: a.token,
    body: { text: "solo para el primero" }
  });
  assert.strictEqual(sent.status, 201, JSON.stringify(sent.data));

  const wrongGroup = await request(
    `/api/conversations/${second.data.conversation._id}/messages/${sent.data.message._id}`,
    { method: "DELETE", token: a.token }
  );
  assert.strictEqual(wrongGroup.status, 404, "borrar por la puerta equivocada no toca nada");

  const stillThere = await Message.findById(sent.data.message._id).lean();
  assert.strictEqual(stillThere.text, "solo para el primero");

  const foreign = await request(
    `/api/conversations/${first.data.conversation._id}/messages/${sent.data.message._id}`,
    { method: "DELETE", token: b.token }
  );
  assert.strictEqual(foreign.status, 403);

  const own = await request(
    `/api/conversations/${first.data.conversation._id}/messages/${sent.data.message._id}`,
    { method: "DELETE", token: a.token }
  );
  assert.strictEqual(own.status, 200);
  const tombstone = await Message.findById(sent.data.message._id).lean();
  assert.strictEqual(tombstone.text, "");
  assert.ok(tombstone.deletedAt);
});

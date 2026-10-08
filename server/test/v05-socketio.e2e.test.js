const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { io: ioClient } = require("socket.io-client");

/**
 * V05 — Socket.IO con DOS clientes reales contra el servidor real y MongoDB real.
 *
 * NO usa dobles de socket, ni persistencia simulada. Cada cliente es un
 * `socket.io-client` real que se conecta por WebSocket al servidor HTTP real.
 * Los mensajes se persisten en la base temporal y se comprueba en MongoDB.
 * Un tercer usuario (C) solo sirve para probar aislamiento y no autorización.
 *
 * Escenarios (14): cliente A y B autenticados, conexión, autenticación del
 * socket, presencia, typing:start, envío, recepción, persistencia, estados de
 * entrega y lectura, reconexión, rechazo de socket no autorizado, aislamiento
 * entre conversaciones y ausencia de duplicados.
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
  quiet: true
});

process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-v05-socketio-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");
const Message = require("../src/modules/messages/Message");
const { assertE2ETarget } = require("./helpers/e2e-target-guard");
const { connectE2E, cleanupE2E, clearNewDocuments } = require("./helpers/e2e-database");

let mongoConfigured = Boolean(process.env.KRONOS_E2E_MONGODB_URI);
const tempDatabaseName = "test";

if (mongoConfigured) {
  mongoConfigured = assertE2ETarget({
    uri: process.env.KRONOS_E2E_MONGODB_URI,
    dbName: tempDatabaseName
  });
}

const PASSWORD = "KronosV05Secure!";
let baseUrl;
let dbConnected = false;
const openSockets = [];

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) {
      t.skip("Requiere KRONOS_E2E_MONGODB_URI real (base Atlas test).");
      return;
    }
    await fn(t);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, data };
}

async function registerUser(label) {
  const suffix = crypto.randomBytes(5).toString("hex");
  // El servidor normaliza el correo a minúsculas: el helper lo construye igual.
  const email = `v05.${label}.${suffix}@example.com`.toLowerCase();
  const { status, data } = await request("/api/auth/register", {
    method: "POST",
    body: {
      username: `v05_${label}_${suffix}`.slice(0, 30),
      email,
      password: PASSWORD,
      displayName: `V05 ${label}`
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

async function loginUser(user) {
  const { status, data } = await request("/api/auth/login", {
    method: "POST",
    body: { email: user.email, password: PASSWORD }
  });

  assert.strictEqual(status, 200, JSON.stringify(data));

  return { ...user, token: data.token, refreshToken: data.refreshToken };
}

/** Socket real por WebSocket. `reconnection` solo se activa cuando se pide. */
function makeSocket(token, { reconnection = false } = {}) {
  const socket = ioClient(baseUrl, {
    auth: token === undefined ? {} : { token },
    transports: ["websocket"],
    reconnection,
    reconnectionDelay: 100,
    reconnectionDelayMax: 300,
    timeout: 5000,
    forceNew: true
  });
  openSockets.push(socket);
  return socket;
}

/** Conecta y espera `connect`; rechaza si el servidor rechaza el handshake. */
function connectSocket(token, options) {
  const socket = makeSocket(token, options);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TIMEOUT_CONNECT_SOCKET")), 6000);

    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
  });
}

/** Espera un evento que cumpla `predicate`; falla con TIMEOUT si no llega. */
function waitForEvent(socket, event, predicate = () => true, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`TIMEOUT_EVENT:${event}`));
    }, timeout);

    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }

    socket.on(event, handler);
  });
}

/** Recoge todos los eventos `event` durante `ms` milisegundos. */
function collectEvents(socket, event, ms) {
  const received = [];
  const handler = (payload) => received.push(payload);
  socket.on(event, handler);

  return sleep(ms).then(() => {
    socket.off(event, handler);
    return received;
  });
}

async function sendMessage(from, to, text, extra = {}) {
  const { status, data } = await request(`/api/messages/${to.id}`, {
    method: "POST",
    token: from.token,
    body: { text, ...extra }
  });

  assert.ok(status === 201 || status === 200, JSON.stringify(data));

  return data;
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
  for (const socket of openSockets) socket.close();

  await new Promise((resolve) => io.close(resolve));

  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }

  if (dbConnected) {
    await cleanupE2E();
  }
});

// ---------------------------------------------------------------
// 1-2. Clientes A y B autenticados
// ---------------------------------------------------------------

mongoTest("V05-01 cliente A autenticado: registro y login real con token válido", async () => {
  const a = await loginUser(await registerUser("A"));

  assert.ok(a.token, "token de A");
  const me = await request("/api/auth/session", { token: a.token });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.data.user.email, a.email);
});

mongoTest("V05-02 cliente B autenticado: registro y login real con token válido", async () => {
  const b = await loginUser(await registerUser("B"));

  assert.ok(b.token, "token de B");
  const me = await request("/api/auth/session", { token: b.token });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.data.user.email, b.email);
});

// ---------------------------------------------------------------
// 3-4. Conexión y autenticación del socket
// ---------------------------------------------------------------

mongoTest("V05-03 conexión: ambos clientes abren Socket.IO por WebSocket", async () => {
  const a = await loginUser(await registerUser("connA"));
  const b = await loginUser(await registerUser("connB"));

  const socketA = await connectSocket(a.token);
  const socketB = await connectSocket(b.token);

  assert.strictEqual(socketA.connected, true);
  assert.strictEqual(socketB.connected, true);
  assert.strictEqual(socketA.io.engine.transport.name, "websocket");

  socketA.close();
  socketB.close();
});

mongoTest("V05-04 autenticación del socket: el socket recibe eventos dirigidos a su propio usuario", async () => {
  const a = await loginUser(await registerUser("authA"));
  const b = await loginUser(await registerUser("authB"));

  const socketA = await connectSocket(a.token);
  const incoming = waitForEvent(socketA, "message:new", (m) => m.text === "para A autenticado");

  await sendMessage(b, a, "para A autenticado");

  const received = await incoming;
  assert.strictEqual(String(received.receiver), String(a.id), "la sala es la del usuario autenticado");
  assert.strictEqual(String(received.sender), String(b.id));

  socketA.close();
});

// ---------------------------------------------------------------
// 5. Presencia
// ---------------------------------------------------------------

mongoTest("V05-05 presencia: B ve a A entrar y salir de línea por socket y por REST", async () => {
  const a = await loginUser(await registerUser("presA"));
  const b = await loginUser(await registerUser("presB"));

  const socketB = await connectSocket(b.token);

  const cameOnline = waitForEvent(
    socketB,
    "presence:changed",
    (p) => String(p.userId) === String(a.id) && p.online === true
  );
  const socketA = await connectSocket(a.token);
  await cameOnline;

  const online = await request(`/api/messages/${a.id}`, { token: b.token });
  assert.strictEqual(online.data.online, true, "REST confirma presencia");

  const wentOffline = waitForEvent(
    socketB,
    "presence:changed",
    (p) => String(p.userId) === String(a.id) && p.online === false
  );
  socketA.close();
  await wentOffline;

  await sleep(100);
  const offline = await request(`/api/messages/${a.id}`, { token: b.token });
  assert.strictEqual(offline.data.online, false, "REST confirma salida");

  socketB.close();
});

// ---------------------------------------------------------------
// 6. typing:start
// ---------------------------------------------------------------

mongoTest("V05-06 typing:start: solo llega al peer indicado, nunca a un tercero", async () => {
  const a = await loginUser(await registerUser("typA"));
  const b = await loginUser(await registerUser("typB"));
  const c = await loginUser(await registerUser("typC"));

  const socketA = await connectSocket(a.token);
  const socketB = await connectSocket(b.token);
  const socketC = await connectSocket(c.token);

  const typingAtB = waitForEvent(socketB, "typing:start", (p) => String(p.from) === String(a.id));
  const typingAtC = collectEvents(socketC, "typing:start", 800);

  socketA.emit("typing:start", { peerId: b.id });

  const payload = await typingAtB;
  assert.strictEqual(String(payload.from), String(a.id));

  const leaked = await typingAtC;
  assert.strictEqual(leaked.length, 0, "C no recibe el typing de A dirigido a B");

  socketA.close();
  socketB.close();
  socketC.close();
});

// ---------------------------------------------------------------
// 7-9. Envío, recepción y persistencia
// ---------------------------------------------------------------

mongoTest("V05-07/08 envío y recepción: A envía por REST y B recibe message:new en vivo", async () => {
  const a = await loginUser(await registerUser("sendA"));
  const b = await loginUser(await registerUser("sendB"));

  const socketB = await connectSocket(b.token);
  const received = waitForEvent(socketB, "message:new", (m) => m.text === "hola B en vivo");

  const sent = await sendMessage(a, b, "hola B en vivo");
  assert.strictEqual(sent.deduplicated, false);

  const live = await received;
  assert.strictEqual(String(live._id), String(sent.message._id), "B recibe el mismo mensaje que A envió");
  assert.strictEqual(live.text, "hola B en vivo");

  socketB.close();
});

mongoTest("V05-09 persistencia: el mensaje queda en MongoDB y se lee por REST", async () => {
  const a = await loginUser(await registerUser("persA"));
  const b = await loginUser(await registerUser("persB"));

  const sent = await sendMessage(a, b, "persistido en MongoDB");
  const stored = await Message.findById(sent.message._id).lean();

  assert.ok(stored, "el documento existe en la base");
  assert.strictEqual(stored.text, "persistido en MongoDB");
  assert.strictEqual(String(stored.sender), String(a.id));
  assert.strictEqual(String(stored.receiver), String(b.id));

  const history = await request(`/api/messages/${a.id}`, { token: b.token });
  assert.strictEqual(history.status, 200);
  assert.ok(history.data.messages.some((m) => m._id === String(sent.message._id)), "REST lo devuelve");
});

// ---------------------------------------------------------------
// 10. Read / delivery state
// ---------------------------------------------------------------

mongoTest("V05-10 read/delivery: entrega y lectura se reflejan en MongoDB y en la vista de A", async () => {
  const a = await loginUser(await registerUser("rdA"));
  const b = await loginUser(await registerUser("rdB"));

  const sent = await sendMessage(a, b, "estados de entrega");
  const id = sent.message._id;

  const before = await Message.findById(id).lean();
  assert.strictEqual(before.delivered, false, "antes de abrir no está entregado");
  assert.strictEqual(before.read, false, "antes de abrir no está leído");

  const delivered = await request(`/api/messages/${a.id}/delivered`, { method: "PATCH", token: b.token });
  assert.strictEqual(delivered.status, 200, JSON.stringify(delivered.data));

  const read = await request(`/api/messages/${a.id}/read`, { method: "PATCH", token: b.token });
  assert.strictEqual(read.status, 200, JSON.stringify(read.data));

  const after = await Message.findById(id).lean();
  assert.strictEqual(after.delivered, true);
  assert.strictEqual(after.read, true);

  const viewA = await request(`/api/messages/${b.id}`, { token: a.token });
  const own = viewA.data.messages.find((m) => m._id === String(id));
  assert.ok(own, "A ve su mensaje");
  assert.strictEqual(own.read, true);
  assert.strictEqual(own.delivered, true);
});

// ---------------------------------------------------------------
// 11. Reconexión
// ---------------------------------------------------------------

mongoTest("V05-11 reconexión: B vuelve a conectar, recupera lo enviado mientras estaba fuera y recibe lo nuevo", async () => {
  const a = await loginUser(await registerUser("rcA"));
  const b = await loginUser(await registerUser("rcB"));

  const socketB = await connectSocket(b.token, { reconnection: true });
  const reconnected = waitForEvent(socketB, "connect", () => true, 8000);
  const dropped = waitForEvent(socketB, "disconnect", () => true, 6000);

  // Corte de transporte del lado del servidor: el cliente debe reconectar solo.
  socketB.io.engine.close();
  await dropped;
  await reconnected;

  // Mensaje enviado con B fuera de línea: no se pierde, queda persistido.
  const duringGap = await sendMessage(a, b, "enviado durante el corte");
  const history = await request(`/api/messages/${a.id}`, { token: b.token });
  assert.ok(history.data.messages.some((m) => m._id === String(duringGap.message._id)), "B lo recupera por REST");

  // Tras reconectar, los mensajes nuevos llegan al socket restablecido.
  const live = waitForEvent(socketB, "message:new", (m) => m.text === "tras reconectar");
  await sendMessage(a, b, "tras reconectar");
  assert.strictEqual((await live).text, "tras reconectar");

  socketB.close();
});

// ---------------------------------------------------------------
// 12. Rechazo de socket no autorizado
// ---------------------------------------------------------------

mongoTest("V05-12 rechazo: sin token, token inválido y sesión revocada no abren socket", async () => {
  const a = await loginUser(await registerUser("rejA"));

  await assert.rejects(connectSocket(undefined), (error) => {
    assert.strictEqual(error.message, "AUTH_REQUIRED");
    return true;
  }, "sin token");

  await assert.rejects(connectSocket("token.no.valido"), (error) => {
    assert.strictEqual(error.message, "AUTH_INVALID");
    return true;
  }, "token malformado");

  const logout = await request("/api/auth/logout", {
    method: "POST",
    token: a.token,
    body: { refreshToken: a.refreshToken }
  });
  assert.strictEqual(logout.status, 200, JSON.stringify(logout.data));

  await assert.rejects(connectSocket(a.token), (error) => {
    assert.strictEqual(error.message, "AUTH_REVOKED");
    return true;
  }, "sesión revocada tras logout");
});

// ---------------------------------------------------------------
// 13. Aislamiento entre conversaciones
// ---------------------------------------------------------------

mongoTest("V05-13 aislamiento: un mensaje A→C no llega a B ni aparece en la conversación A↔B", async () => {
  const a = await loginUser(await registerUser("isoA"));
  const b = await loginUser(await registerUser("isoB"));
  const c = await loginUser(await registerUser("isoC"));

  const socketB = await connectSocket(b.token);
  const socketC = await connectSocket(c.token);

  const leakToB = collectEvents(socketB, "message:new", 800);
  const receivedByC = waitForEvent(socketC, "message:new", (m) => m.text === "solo para C");

  const sent = await sendMessage(a, c, "solo para C");
  await receivedByC;

  const leaked = await leakToB;
  assert.strictEqual(
    leaked.some((m) => m.text === "solo para C"),
    false,
    "B no recibe el mensaje dirigido a C"
  );

  const historyAB = await request(`/api/messages/${a.id}`, { token: b.token });
  assert.strictEqual(historyAB.status, 200);
  assert.strictEqual(
    historyAB.data.messages.some((m) => m._id === String(sent.message._id)),
    false,
    "la conversación A↔B no contiene el mensaje de A↔C"
  );

  socketB.close();
  socketC.close();
});

// ---------------------------------------------------------------
// 14. Ausencia de mensajes duplicados
// ---------------------------------------------------------------

mongoTest("V05-14 sin duplicados: un reenvío con el mismo clientMessageId emite una sola vez y persiste una sola vez", async () => {
  const a = await loginUser(await registerUser("dupA"));
  const b = await loginUser(await registerUser("dupB"));

  const socketB = await connectSocket(b.token);
  const events = collectEvents(socketB, "message:new", 1200);

  const first = await sendMessage(a, b, "sin duplicar V05", { clientMessageId: "v05-dup-001" });
  const retry = await sendMessage(a, b, "sin duplicar V05", { clientMessageId: "v05-dup-001" });

  assert.strictEqual(first.deduplicated, false);
  assert.strictEqual(retry.deduplicated, true, "el reintento se deduplica");
  assert.strictEqual(String(retry.message._id), String(first.message._id));

  const emitted = (await events).filter((m) => m.text === "sin duplicar V05");
  assert.strictEqual(emitted.length, 1, "B recibe exactamente un message:new");

  const persisted = await Message.countDocuments({ sender: a.id, receiver: b.id, text: "sin duplicar V05" });
  assert.strictEqual(persisted, 1, "la base contiene exactamente un mensaje");

  socketB.close();
});

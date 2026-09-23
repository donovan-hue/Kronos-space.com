const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { io: ioClient } = require("socket.io-client");

/**
 * KRONOS-SEC-LIVE — autorización de salas en vivo y de la señalización
 * WebRTC contra MongoDB real.
 *
 * Antes: cualquier cuenta autenticada podía unirse por socket a
 * `live:<cualquierId>` y enviar señales a `user:<cualquierId>`, y
 * `GET /api/live/rooms/:id` era público (exponía salas privadas).
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-live-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");
const User = require("../src/modules/users/User");
const LiveRoom = require("../src/modules/live/LiveRoom");

const mongoConfigured = Boolean(process.env.MONGODB_URI);
const tempDatabaseName = `kronos_e2e_${crypto.randomBytes(6).toString("hex")}`;
const PASSWORD = "KronosLive123!";
let baseUrl;
let connected = false;

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) {
      return t.skip("Requiere MONGODB_URI real (base temporal kronos_e2e_*). Sin URI no se simula persistencia.");
    }

    try {
      await fn();
    } catch (error) {
      console.log(`KRONOS_E2E_FAIL [${name}] :: ${(error?.message || error).toString().replace(/\s+/g, " ").slice(0, 500)}`);
      throw error;
    }
  });
}

async function request(path, { method = "GET", token, body } = {}) {
  const headers = {};

  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

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

async function register(label) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const username = `live_${label}_${suffix}`.slice(0, 30);
  const response = await request("/api/auth/register", {
    method: "POST",
    body: {
      username,
      email: `live.${label}.${suffix}@example.test`,
      password: PASSWORD,
      displayName: `Live ${label}`
    }
  });

  assert.strictEqual(response.status, 201, JSON.stringify(response.data));

  return { id: response.data.user.id, token: response.data.token, username };
}

function connectSocket(token) {
  const socket = ioClient(baseUrl, {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
    timeout: 5000
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("SOCKET_CONNECT_TIMEOUT"));
    }, 6000);

    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(error);
    });
  });
}

/** Espera un evento concreto y devuelve su payload (o falla por timeout). */
function waitForEvent(socket, event, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`TIMEOUT_${event}`)), timeoutMs);

    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Comprueba que un evento NO llega en la ventana indicada. */
function expectNoEvent(socket, event, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    const onEvent = (payload) => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      reject(new Error(`EVENTO_INESPERADO_${event}: ${JSON.stringify(payload)}`));
    };

    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolve();
    }, timeoutMs);

    socket.on(event, onEvent);
  });
}

test.before(async () => {
  if (mongoConfigured) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: tempDatabaseName, serverSelectionTimeoutMS: 15000 });
    connected = true;
    await Promise.all([User.deleteMany({}), LiveRoom.deleteMany({})]);
  }

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));

  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }

  if (connected) {
    if (tempDatabaseName.startsWith("kronos_e2e_")) {
      await mongoose.connection.dropDatabase();
    }

    await mongoose.disconnect();
  }
});

mongoTest("LIVE-001: la señalización WebRTC llega entre participantes de la misma sala", async () => {
  const host = await register("host");
  const listener = await register("listener");

  const created = await request("/api/live/rooms", {
    method: "POST",
    token: host.token,
    body: { title: "Sala pública E2E", type: "audio", isPublic: true }
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));

  const roomId = created.data.room._id;

  const joined = await request(`/api/live/rooms/${roomId}/join`, { method: "PATCH", token: listener.token });
  assert.strictEqual(joined.status, 200, JSON.stringify(joined.data));

  const hostSocket = await connectSocket(host.token);
  const listenerSocket = await connectSocket(listener.token);

  try {
    const hostJoined = waitForEvent(hostSocket, "live:joined");
    hostSocket.emit("live:join", { roomId });
    await hostJoined;

    const listenerJoined = waitForEvent(listenerSocket, "live:joined");
    listenerSocket.emit("live:join", { roomId });
    await listenerJoined;

    const offerReceived = waitForEvent(hostSocket, "live:signal");
    listenerSocket.emit("live:signal", {
      roomId,
      targetPeerId: host.id,
      signal: { type: "offer", sdp: "v=0" }
    });

    const offer = await offerReceived;
    assert.strictEqual(offer.fromPeerId, listener.id);
    assert.deepEqual(offer.signal, { type: "offer", sdp: "v=0" });
    assert.strictEqual(offer.roomId, roomId);
  } finally {
    hostSocket.disconnect();
    listenerSocket.disconnect();
  }
});

mongoTest("LIVE-002: un usuario ajeno no puede señalar a otros ni entrar a una sala privada", async () => {
  const host = await register("host2");
  const outsider = await register("outsider");

  const created = await request("/api/live/rooms", {
    method: "POST",
    token: host.token,
    body: { title: "Sala privada E2E", type: "video", isPublic: false }
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));

  const roomId = created.data.room._id;

  const hostSocket = await connectSocket(host.token);
  const outsiderSocket = await connectSocket(outsider.token);

  try {
    const hostJoined = waitForEvent(hostSocket, "live:joined");
    hostSocket.emit("live:join", { roomId });
    await hostJoined;

    // Sala privada + no participante → error explícito, sin unirse.
    const forbidden = waitForEvent(outsiderSocket, "live:error");
    outsiderSocket.emit("live:join", { roomId });
    assert.strictEqual((await forbidden).code, "LIVE_FORBIDDEN");

    // Aunque intente señalar directamente al anfitrión, no se entrega.
    const notInRoom = waitForEvent(outsiderSocket, "live:error");
    outsiderSocket.emit("live:signal", {
      roomId,
      targetPeerId: host.id,
      signal: { type: "offer", sdp: "v=0" }
    });
    assert.strictEqual((await notInRoom).code, "LIVE_NOT_IN_ROOM");

    await expectNoEvent(hostSocket, "live:signal");

    // REST: la sala privada no es visible para terceros ni anónimamente.
    const anonymous = await request(`/api/live/rooms/${roomId}`);
    assert.strictEqual(anonymous.status, 401, JSON.stringify(anonymous.data));

    const asOutsider = await request(`/api/live/rooms/${roomId}`, { token: outsider.token });
    assert.strictEqual(asOutsider.status, 404, JSON.stringify(asOutsider.data));

    const asHost = await request(`/api/live/rooms/${roomId}`, { token: host.token });
    assert.strictEqual(asHost.status, 200, JSON.stringify(asHost.data));
    assert.strictEqual(asHost.data.room._id, roomId);
  } finally {
    hostSocket.disconnect();
    outsiderSocket.disconnect();
  }
});

mongoTest("LIVE-004: una sala privada no se anuncia ni se abre con solo el id; la invitación sí", async () => {
  const host = await register("host4");
  const outsider = await register("outsider4");
  const outsiderSocket = await connectSocket(outsider.token);

  try {
    const leaked = expectNoEvent(outsiderSocket, "live:room-started", 800);
    const created = await request("/api/live/rooms", {
      method: "POST",
      token: host.token,
      body: { title: "Sala privada sin anuncio", type: "audio", isPublic: false }
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.data));
    await leaked;

    const roomId = created.data.room._id;
    const forced = await request(`/api/live/rooms/${roomId}/join`, { method: "PATCH", token: outsider.token });
    assert.strictEqual(forced.status, 403, JSON.stringify(forced.data));
    assert.strictEqual(forced.data.code, "LIVE_FORBIDDEN");

    const invited = await request(`/api/live/rooms/${roomId}/invite`, {
      method: "POST",
      token: host.token,
      body: { username: outsider.username }
    });
    assert.strictEqual(invited.status, 200, JSON.stringify(invited.data));

    const joined = await request(`/api/live/rooms/${roomId}/join`, { method: "PATCH", token: outsider.token });
    assert.strictEqual(joined.status, 200, JSON.stringify(joined.data));

    const socketJoined = waitForEvent(outsiderSocket, "live:joined");
    outsiderSocket.emit("live:join", { roomId });
    assert.strictEqual((await socketJoined).roomId, roomId);
  } finally {
    outsiderSocket.disconnect();
  }
});

mongoTest("LIVE-003: identificadores inválidos y salas inexistentes responden con error de sala", async () => {
  const user = await register("invalid");
  const socket = await connectSocket(user.token);

  try {
    const invalid = waitForEvent(socket, "live:error");
    socket.emit("live:join", { roomId: "no-es-un-objectid" });
    assert.strictEqual((await invalid).code, "INVALID_ROOM");

    const missing = waitForEvent(socket, "live:error");
    socket.emit("live:join", { roomId: new mongoose.Types.ObjectId().toString() });
    assert.strictEqual((await missing).code, "LIVE_NOT_FOUND");
  } finally {
    socket.disconnect();
  }
});

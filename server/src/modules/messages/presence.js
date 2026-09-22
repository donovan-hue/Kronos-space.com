/**
 * KRONOS-UI-020 — presencia de usuarios.
 *
 * Dos backends (API async en ambos):
 * - Redis (`REDIS_URL` definido): presencia compartida entre instancias
 *   (sets `presence:{userId}` con TTL de 120 s que se renueva en cada
 *   conexión; si un nodo muere, sus sockets expiran solos).
 * - Memoria (sin `REDIS_URL`): una sola instancia ve a sus propios
 *   sockets. Se avisa una vez por arranque: es correcto en Render con
 *   1 instancia y un límite declarado en otro caso.
 *
 * Si Redis falla en una operación, se resuelve con memoria (fail-open)
 * para no romper el flujo de conexión por la presencia.
 */

const onlineSockets = new Map(); // userId (string) -> Set<socketId>

const PRESENCE_TTL_SECONDS = 120;
const PRESENCE_KEY_PREFIX = "presence:";

let redisClient = null;
let redisFailed = false;
let memoryWarned = false;

function useRedis() {
  return Boolean((process.env.REDIS_URL || "").trim());
}

function warnMemoryOnce() {
  if (memoryWarned || useRedis()) return;
  memoryWarned = true;
  console.warn(
    "PRESENCE: sin REDIS_URL la presencia es local a esta instancia (1 solo proceso)."
  );
}

async function getRedis() {
  if (redisClient) return redisClient;
  const { createClient } = require("redis");
  const client = createClient({ url: process.env.REDIS_URL });
  client.on("error", (error) => {
    if (!redisFailed) {
      redisFailed = true;
      console.error("PRESENCE_REDIS_ERROR: se usa memoria como respaldo.", error?.message || error);
    }
  });
  await client.connect();
  redisClient = client;
  return redisClient;
}

function toKey(userId) {
  return String(userId);
}

function redisKey(userId) {
  return `${PRESENCE_KEY_PREFIX}${toKey(userId)}`;
}

// ---------- Backend en memoria ----------

function memoryConnected(userId, socketId) {
  const key = toKey(userId);
  const first = !onlineSockets.has(key);
  const sockets = onlineSockets.get(key) || new Set();
  sockets.add(socketId);
  onlineSockets.set(key, sockets);
  return first;
}

function memoryDisconnected(userId, socketId) {
  const key = toKey(userId);
  const sockets = onlineSockets.get(key);

  if (!sockets) {
    return false;
  }

  sockets.delete(socketId);

  if (sockets.size === 0) {
    onlineSockets.delete(key);
    return true;
  }

  return false;
}

function memoryIsOnline(userId) {
  const sockets = onlineSockets.get(toKey(userId));
  return Boolean(sockets && sockets.size > 0);
}

// ---------- Backend Redis ----------

async function redisConnected(userId, socketId) {
  const client = await getRedis();
  const key = redisKey(userId);
  // Transición 0→N: se lee antes de agregar. Una carrera entre nodos
  // puede emitir "online" duplicado (inofensivo); nunca lo omite.
  const before = await client.sCard(key);
  await client.sAdd(key, String(socketId));
  await client.expire(key, PRESENCE_TTL_SECONDS);
  return before === 0;
}

async function redisDisconnected(userId, socketId) {
  const client = await getRedis();
  const key = redisKey(userId);
  await client.sRem(key, String(socketId));
  const remaining = await client.sCard(key);
  if (remaining === 0) {
    await client.del(key);
    return true;
  }
  return false;
}

async function redisIsOnline(userId) {
  const client = await getRedis();
  return (await client.sCard(redisKey(userId))) > 0;
}

// ---------- API pública (siempre async) ----------

/** Registra la conexión de un socket. Resuelve true si el usuario pasó a estar en línea. */
async function socketConnected(userId, socketId) {
  if (!useRedis()) {
    warnMemoryOnce();
    return memoryConnected(userId, socketId);
  }
  try {
    const first = await redisConnected(userId, socketId);
    memoryConnected(userId, socketId);
    return first;
  } catch {
    return memoryConnected(userId, socketId);
  }
}

/** Libera un socket. Resuelve true si el usuario quedó sin conexiones. */
async function socketDisconnected(userId, socketId) {
  const memoryResult = memoryDisconnected(userId, socketId);
  if (!useRedis()) {
    warnMemoryOnce();
    return memoryResult;
  }
  try {
    return await redisDisconnected(userId, socketId);
  } catch {
    return memoryResult;
  }
}

async function isOnline(userId) {
  if (!useRedis()) {
    warnMemoryOnce();
    return memoryIsOnline(userId);
  }
  try {
    return await redisIsOnline(userId);
  } catch {
    return memoryIsOnline(userId);
  }
}

/** Solo para pruebas: vacía la presencia sin tocar sockets reales. */
async function resetPresence() {
  onlineSockets.clear();
  if (useRedis()) {
    try {
      const client = await getRedis();
      for await (const key of client.scanIterator({ MATCH: `${PRESENCE_KEY_PREFIX}*`, COUNT: 100 })) {
        await client.del(key);
      }
    } catch {
      // En pruebas sin Redis real no hay nada que limpiar.
    }
  }
}

module.exports = {
  socketConnected,
  socketDisconnected,
  isOnline,
  resetPresence
};

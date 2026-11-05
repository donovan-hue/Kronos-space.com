/**
 * Almacén de presencia compartido (bloque 1.4).
 *
 * La presencia local (`modules/messages/presence.js`) sabe solo de los sockets
 * de este proceso. En un despliegue con varias instancias eso hace que dos
 * personas conectadas a procesos distintos se vean desconectadas entre sí.
 *
 * Vive en `modules/` y no en `config/` a propósito: la configuración no debe
 * importar dominio (lo vigila `ciclo-importacion.test.js`), y esto es dominio
 * de mensajería que además necesita la forma que define `presence.js`.
 *
 * Aquí se elige el almacén una sola vez, al arrancar:
 *
 * - Sin `REDIS_URL`: memoria del proceso. Es el despliegue actual (una
 *   instancia) y sigue siendo correcto; `describePresence()` lo dice con
 *   `multiInstanceSafe: false` en lugar de presumir de algo que no hay.
 * - Con `REDIS_URL`: un conjunto por persona en Redis, donde cada elemento es
 *   una instancia y caduca sola a los 60 s. Si una instancia se cae sin
 *   desconectar a sus sockets, deja de contar sin quedar como fantasma.
 *
 * `ioredis` solo se carga si hay `REDIS_URL`: así un despliegue sin Redis no
 * paga ni el arranque del módulo. Si Redis no responde, la presencia vuelve a
 * la memoria local en vez de tumbar el servidor, y `describePresence().store`
 * lo refleja.
 */
const { crearAlmacenEnMemoria, PRESENCE_TTL_MS } = require("./presence");

const CLAVE = "kronos:presence";

/**
 * Construye el almacén respaldado por Redis. `client` se inyecta para poder
 * probarlo sin un Redis de verdad; su forma es la de ioredis
 * (`sadd`, `srem`, `smembers`, `expire`, `del`).
 */
function crearAlmacenRedis(client, { prefijo = CLAVE, ttlMs = PRESENCE_TTL_MS } = {}) {
  const clave = (userId) => `${prefijo}:${userId}`;
  return {
    nombre: "redis",
    async add(userId, instanceId) {
      const k = clave(userId);
      await client.sadd(k, instanceId);
      // TTL renovado en cada latido: una instancia que deja de latir sale sola.
      await client.expire(k, Math.ceil(ttlMs / 1000));
    },
    async remove(userId, instanceId) {
      const k = clave(userId);
      await client.srem(k, instanceId);
      // Si ya no queda ninguna instancia, se borra la clave para no dejar
      // conjuntos vacíos con TTL corriendo.
      const restantes = await client.smembers(k);
      if (!restantes || restantes.length === 0) await client.del(k);
    },
    async list(userId) {
      const miembros = await client.smembers(clave(userId));
      return Array.isArray(miembros) ? miembros : [];
    },
    async clear() {
      // Solo las claves de presencia, nunca la base entera.
      const claves = await client.keys(`${prefijo}:*`);
      if (Array.isArray(claves) && claves.length) await client.del(...claves);
    }
  };
}

function crearAlmacenDesdeEntorno(env = process.env) {
  const url = String(env.REDIS_URL || "").trim();
  if (!url) return { store: crearAlmacenEnMemoria(), client: null };

  try {
    const Redis = require("ioredis");
    const client = new Redis(url, {
      // Presencia no es crítica: si Redis no está, se sigue con memoria local
      // en lugar de reintentar sin fin y llenar el registro.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false
    });
    client.on("error", () => {});
    return { store: crearAlmacenRedis(client), client };
  } catch (error) {
    console.error("PRESENCE_REDIS_UNAVAILABLE:", error?.message || error);
    return { store: crearAlmacenEnMemoria(), client: null };
  }
}

module.exports = { crearAlmacenRedis, crearAlmacenDesdeEntorno, CLAVE };

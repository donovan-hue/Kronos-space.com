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

/**
 * Adaptador de Socket.IO sobre Redis (bloque 3).
 *
 * La presencia ya cruzaba instancias, pero las salas no: `io.to("user:X")`
 * solo alcanzaba los sockets del proceso que emitía. Con dos réplicas, un
 * mensaje directo llegaba a quien estaba en la misma réplica y a nadie más —
 * el tiempo real se rompía justo al escalar.
 *
 * Se reutiliza la MISMA conexión de `REDIS_URL` (una para publicar, una
 * duplicada para suscribirse, como exige el adaptador). Sin `REDIS_URL` no se
 * monta nada: con una instancia no hace falta y una dependencia activa de más
 * solo añade un punto de fallo.
 *
 * Devuelve `{ montado: boolean, cerrar }` para que el apagado ordenado cierre
 * las conexiones en vez de dejarlas colgando.
 */
async function montarAdaptadorSocketIO(io, { url = process.env.REDIS_URL } = {}) {
  const destino = String(url || "").trim();
  if (!destino) return { montado: false, motivo: "sin REDIS_URL", cerrar: async () => {} };

  try {
    const { createAdapter } = require("@socket.io/redis-adapter");
    const { createClient } = require("redis");

    const pubClient = createClient({ url: destino });
    const subClient = pubClient.duplicate();
    pubClient.on("error", () => {});
    subClient.on("error", () => {});

    // Tope duro: el cliente de `redis` puede quedarse reintentando y dejar el
    // arranque colgado sin error visible. Si en 6 s no hay conexión, se
    // destruyen las dos y se sigue con el adaptador en memoria.
    const tope = new Promise((_, rechazar) => {
      const timer = setTimeout(() => rechazar(new Error("REDIS_CONNECT_TIMEOUT")), 6000);
      if (typeof timer.unref === "function") timer.unref();
    });

    try {
      await Promise.race([Promise.all([pubClient.connect(), subClient.connect()]), tope]);
    } catch (error) {
      pubClient.destroy();
      subClient.destroy();
      throw error;
    }

    io.adapter(createAdapter(pubClient, subClient));

    return {
      montado: true,
      motivo: "",
      async cerrar() {
        await Promise.allSettled([pubClient.quit(), subClient.quit()]);
      }
    };
  } catch (error) {
    // Si Redis no responde, el servidor sigue con el adaptador en memoria: se
    // pierde el cruce entre réplicas, pero no se cae el arranque.
    console.error("SOCKET_ADAPTER_REDIS_ERROR:", error?.message || error);
    return { montado: false, motivo: error?.message || "adaptador no disponible", cerrar: async () => {} };
  }
}

module.exports.montarAdaptadorSocketIO = montarAdaptadorSocketIO;

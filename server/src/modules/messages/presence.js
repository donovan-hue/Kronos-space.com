/**
 * Presencia — dos planos, uno por instancia y otro compartido (bloque 1.4).
 *
 * Antes: un solo `Map` en memoria, con el límite declarado de que «si el
 * despliegue corre más de un proceso, cada uno ve solo a sus sockets». Ese
 * límite se notaba enseguida: dos personas conectadas a instancias distintas
 * se veían «desconectadas» la una a la otra aunque estuvieran escribiendo.
 *
 * Ahora:
 * - `onlineSockets` sigue siendo el registro local (quién tiene una socket
 *   abierta en **esta** instancia). Sirve para saber si el último socket se fue
 *   y para no anunciar altas y bajas repetidas.
 * - `almacenCompartido` es opcional. Si el despliegue define `REDIS_URL` (o
 *   `PRESENCE_STORE=memory`), la lista definitiva de instancias donde cada
 *   persona está conectada vive ahí y `isOnline` consulta esa fuente.
 *
 * Por qué no se da por hecho que hay Redis: el proyecto corre hoy en una sola
 * instancia sin Redis, y meter una dependencia obligatoria rompería el
 * despliegue actual. Sin almacén compartido, esto sigue siendo exactamente lo
 * de antes (correcto en una instancia) y `describePresence()` lo dice para que
 * la pantalla de estado no presuma de multi-instancia.
 *
 * Nunca se guarda el estado «en línea» como un booleano suelto: se guarda un
 * **conjunto de instancias** con una caducidad corta. Así una instancia que se
 * cae sin desconectar a sus sockets deja de contar sola, sin quedar como un
 * fantasma en línea para siempre.
 */
const onlineSockets = new Map(); // userId (string) -> Set<socketId>

/** Milisegundos que sobrevive la marca de una instancia sin refrescarse. */
const PRESENCE_TTL_MS = 60 * 1000;
const PRESENCE_REFRESH_MS = 20 * 1000;

/**
 * Almacén de instancias: por omisión, memoria del proceso (comportamiento
 * anterior, sin dependencias). La forma es la misma que se espera de un Redis:
 * `add`, `remove`, `list` y `ttl`.
 */
function crearAlmacenEnMemoria() {
  const instancias = new Map(); // userId -> Map<instanceId, expiraEn>

  const limpiar = (userId, ahora = Date.now()) => {
    const marcas = instancias.get(userId);
    if (!marcas) return null;
    for (const [instancia, expira] of marcas) {
      if (expira <= ahora) marcas.delete(instancia);
    }
    if (marcas.size === 0) {
      instancias.delete(userId);
      return null;
    }
    return marcas;
  };

  return {
    nombre: "memory",
    async add(userId, instanceId) {
      const marcas = limpiar(userId) || new Map();
      marcas.set(instanceId, Date.now() + PRESENCE_TTL_MS);
      instancias.set(userId, marcas);
    },
    async remove(userId, instanceId) {
      const marcas = limpiar(userId);
      if (!marcas) return;
      marcas.delete(instanceId);
      if (marcas.size === 0) instancias.delete(userId);
    },
    async list(userId) {
      const marcas = limpiar(userId);
      return marcas ? Array.from(marcas.keys()) : [];
    },
    async clear() {
      instancias.clear();
    }
  };
}

let almacenCompartido = crearAlmacenEnMemoria();
let instanciaActual = `instancia-${process.pid}`;

/** Identificador de esta instancia (para depurar y para el conjunto compartido). */
function instanceId() {
  return instanciaActual;
}

/**
 * Cambia el almacén. Se usa en las pruebas y para conectar Redis cuando el
 * despliegue lo tenga; la forma del objeto es la de `crearAlmacenEnMemoria`.
 */
function configurePresence({ store, id } = {}) {
  if (store) almacenCompartido = store;
  if (id) instanciaActual = String(id);
}

function describePresence() {
  return {
    instance: instanciaActual,
    store: almacenCompartido.nombre || "custom",
    // Con un solo proceso la presencia es correcta; con varios, sin almacén
    // compartido solo se ve la mitad. Se dice, no se disimula.
    multiInstanceSafe: (almacenCompartido.nombre || "custom") !== "memory",
    ttlMs: PRESENCE_TTL_MS
  };
}

function toKey(userId) {
  return String(userId);
}

/**
 * Registra la conexión de un socket. Devuelve true si el usuario pasó a estar
 * en línea —localmente— y, en ese caso, se marca la instancia en el almacén.
 * Es sincrónica a propósito: la usan los manejadores del socket y su valor de
 * retorno decide si se anuncia el cambio.
 */
function socketConnected(userId, socketId) {
  const key = toKey(userId);
  const first = !onlineSockets.has(key);
  const sockets = onlineSockets.get(key) || new Set();
  sockets.add(socketId);
  onlineSockets.set(key, sockets);

  if (first) {
    // No se espera la promesa: si el almacén falla, la presencia local sigue
    // siendo correcta y el fallo no puede tumbar una conexión.
    Promise.resolve(almacenCompartido.add(key, instanciaActual)).catch(() => {});
  }

  return first;
}

/**
 * Refresca la marca de esta instancia para todos sus usuarios locales. Un
 * temporizador lo llama cada `PRESENCE_REFRESH_MS`: sin refresco, la marca
 * caduca a los 60 s aunque la persona siga conectada.
 */
async function refreshPresence() {
  await Promise.all(
    Array.from(onlineSockets.keys()).map((key) =>
      Promise.resolve(almacenCompartido.add(key, instanciaActual)).catch(() => {})
    )
  );
  return onlineSockets.size;
}

/** Libera un socket. Devuelve true si el usuario quedó sin conexiones (se fue en línea). */
function socketDisconnected(userId, socketId) {
  const key = toKey(userId);
  const sockets = onlineSockets.get(key);

  if (!sockets) {
    return false;
  }

  sockets.delete(socketId);

  if (sockets.size === 0) {
    onlineSockets.delete(key);
    // Solo se retira esta instancia: si la persona sigue abierta en otra, su
    // marca se queda y `isOnline` la ve.
    Promise.resolve(almacenCompartido.remove(key, instanciaActual)).catch(() => {});
    return true;
  }

  return false;
}

/**
 * ¿Está en línea en alguna instancia? Se consulta la fuente compartida y, si
 * no responde, se usa el registro local: ante un fallo del almacén, mejor una
 * respuesta parcial que dejar a todo el mundo «desconectado».
 */
async function isOnlineAsync(userId) {
  const key = toKey(userId);
  try {
    const instancias = await almacenCompartido.list(key);
    if (instancias.length > 0) return true;
    return false;
  } catch {
    const sockets = onlineSockets.get(key);
    return Boolean(sockets && sockets.size > 0);
  }
}

/**
 * Versión sincrónica: solo sabe de esta instancia. Se conserva para no romper
 * a quien la llama sin esperar y para las pruebas; las rutas REST usan la
 * asíncrona.
 */
function isOnline(userId) {
  const sockets = onlineSockets.get(toKey(userId));
  return Boolean(sockets && sockets.size > 0);
}

/** Solo para pruebas: vacía el mapa y el almacén sin tocar sockets reales. */
function resetPresence() {
  onlineSockets.clear();
  Promise.resolve(almacenCompartido.clear?.()).catch(() => {});
}

module.exports = {
  socketConnected,
  socketDisconnected,
  isOnline,
  isOnlineAsync,
  refreshPresence,
  configurePresence,
  describePresence,
  instanceId,
  crearAlmacenEnMemoria,
  PRESENCE_TTL_MS,
  PRESENCE_REFRESH_MS,
  resetPresence
};

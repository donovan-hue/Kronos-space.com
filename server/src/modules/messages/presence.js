/**
 * KRONOS-UI-020 — presencia en memoria.
 *
 * Registra qué usuarios tienen al menos una socket conectada en ESTA
 * instancia del servidor. Es de propósito deliberadamente simple:
 *
 * - No hay persistencia: al reiniciar el proceso la presencia se pierde
 *   (los clientes se reconectan y se repone en segundos).
 * - No hay multi-instanza: si el despliegue corre más de un proceso de
 *   servidor, cada uno ve solo a sus propios sockets. Con Render (una
 *   instancia) es correcto; queda declarado como límite explícito.
 *
 * La UI no depende de este mapa para funcionar: los endpoints REST
 * devuelven `online` como mejora opcional y el socket emite
 * `presence:changed` cuando el estado cambia.
 */
const onlineSockets = new Map(); // userId (string) -> Set<socketId>

function toKey(userId) {
  return String(userId);
}

/** Registra la conexión de un socket. Devuelve true si el usuario pasó a estar en línea. */
function socketConnected(userId, socketId) {
  const key = toKey(userId);
  const first = !onlineSockets.has(key);
  const sockets = onlineSockets.get(key) || new Set();
  sockets.add(socketId);
  onlineSockets.set(key, sockets);
  return first;
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
    return true;
  }

  return false;
}

function isOnline(userId) {
  const sockets = onlineSockets.get(toKey(userId));
  return Boolean(sockets && sockets.size > 0);
}

/** Solo para pruebas: vacía el mapa sin tocar sockets reales. */
function resetPresence() {
  onlineSockets.clear();
}

module.exports = {
  socketConnected,
  socketDisconnected,
  isOnline,
  resetPresence
};

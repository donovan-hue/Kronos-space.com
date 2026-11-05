const test = require("node:test");
const assert = require("node:assert");

const presence = require("../src/modules/messages/presence");
const { crearAlmacenRedis } = require("../src/modules/messages/presenceStore");

/**
 * Presencia entre instancias (bloque 1.4).
 *
 * Antes el mapa vivía en memoria de un proceso: dos personas conectadas a
 * réplicas distintas se veían desconectadas aunque estuvieran escribiendo.
 * Ahora la presencia local se publica en un almacén compartido con forma de
 * Redis, y `isOnlineAsync` pregunta ahí.
 */

test("sin almacén compartido la presencia sigue siendo local, y se declara", async () => {
  presence.resetPresence();
  presence.configurePresence({ store: presence.crearAlmacenEnMemoria(), id: "uno" });
  presence.socketConnected("user-a", "s1");
  assert.equal(await presence.isOnlineAsync("user-a"), true);

  const vista = presence.describePresence();
  assert.equal(vista.store, "memory");
  // Sin Redis no se presume de multi-instancia: el estado lo dice.
  assert.equal(vista.multiInstanceSafe, false);
  assert.equal(vista.ttlMs, presence.PRESENCE_TTL_MS);
});

test("dos instancias se ven entre sí a través del almacén compartido", async () => {
  presence.resetPresence();
  // Almacén propio + nombre propio: el almacén en memoria se identifica como
  // «memory», así que para probar el caso multi-instancia se le da un nombre
  // distinto, que es justo lo que hará el almacén de Redis.
  const almacen = { ...presence.crearAlmacenEnMemoria(), nombre: "redis-simulado" };
  presence.configurePresence({ store: almacen, id: "instancia-1" });

  // La persona está conectada en la instancia 2, no en esta.
  await almacen.add("user-b", "instancia-2");
  assert.equal(await presence.isOnlineAsync("user-b"), true);
  assert.equal(presence.isOnline("user-b"), false, "localmente no hay socket suya");

  // Al caer la instancia 2, deja de estar en línea.
  await almacen.remove("user-b", "instancia-2");
  assert.equal(await presence.isOnlineAsync("user-b"), false);

  assert.equal(presence.describePresence().multiInstanceSafe, true);
});

test("el almacén de Redis usa un conjunto por persona con caducidad", async () => {
  const llamadas = [];
  const datos = new Map();
  const cliente = {
    async sadd(clave, valor) {
      llamadas.push(["sadd", clave, valor]);
      if (!datos.has(clave)) datos.set(clave, new Set());
      datos.get(clave).add(valor);
      return 1;
    },
    async srem(clave, valor) {
      llamadas.push(["srem", clave, valor]);
      datos.get(clave)?.delete(valor);
      return 1;
    },
    async smembers(clave) {
      return Array.from(datos.get(clave) || []);
    },
    async expire(clave, segundos) {
      llamadas.push(["expire", clave, segundos]);
      return 1;
    },
    async del(clave) {
      llamadas.push(["del", clave]);
      datos.delete(clave);
      return 1;
    },
    async keys(patron) {
      llamadas.push(["keys", patron]);
      return Array.from(datos.keys());
    }
  };

  const almacen = crearAlmacenRedis(cliente);
  await almacen.add("user-c", "instancia-1");
  await almacen.add("user-c", "instancia-2");

  // La caducidad se renueva en cada alta: es lo que evita fantasmas si una
  // instancia muere sin desconectar.
  assert.deepEqual(llamadas.filter(([op]) => op === "expire").map(([, , s]) => s), [60, 60]);
  assert.equal((await almacen.list("user-c")).length, 2);

  await almacen.remove("user-c", "instancia-1");
  assert.deepEqual(await almacen.list("user-c"), ["instancia-2"]);

  // Al quedar vacío, la clave se borra en vez de quedarse con TTL corriendo.
  await almacen.remove("user-c", "instancia-2");
  assert.ok(llamadas.some(([op]) => op === "del"));
});

test("si el almacén falla, se responde con el registro local en vez de mentir", async () => {
  presence.resetPresence();
  presence.configurePresence({
    store: {
      nombre: "redis",
      async add() {},
      async remove() {},
      async list() { throw new Error("sin conexión"); }
    },
    id: "instancia-1"
  });

  presence.socketConnected("user-d", "s9");
  // El almacén revienta: se cae a lo local, que en esta instancia es correcto.
  assert.equal(await presence.isOnlineAsync("user-d"), true);
});

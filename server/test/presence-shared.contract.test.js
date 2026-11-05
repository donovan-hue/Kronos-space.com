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

/* ============================================================
   3 — adaptador de Socket.IO sobre Redis (26-11-05)
   ============================================================ */

const { montarAdaptadorSocketIO } = require("../src/modules/messages/presenceStore");

test("sin REDIS_URL no se monta adaptador: con una réplica no hace falta", async () => {
  let cambiado = false;
  const resultado = await montarAdaptadorSocketIO({ adapter: () => { cambiado = true; } }, { url: "" });

  assert.equal(resultado.montado, false);
  assert.match(resultado.motivo, /REDIS_URL/);
  assert.equal(cambiado, false, "el adaptador en memoria no debe sustituirse");
  // Cerrar sin haber montado nada no puede reventar el apagado.
  await resultado.cerrar();
});

test("si Redis no responde se arranca con memoria en vez de colgarse", async () => {
  const resultado = await montarAdaptadorSocketIO(
    { adapter: () => { throw new Error("no debería llegar aquí"); } },
    // Puerto cerrado a propósito: el tope de 6 s debe cortar el reintento del
    // cliente de `redis`, que por omisión no termina nunca.
    { url: "redis://127.0.0.1:6399" }
  );

  assert.equal(resultado.montado, false);
  assert.ok(resultado.motivo, "el motivo se registra para poder diagnosticarlo");
});

test("el arranque monta el adaptador antes de escuchar y lo cierra al apagar", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const fuente = fs.readFileSync(
    path.join(__dirname, "..", "src", "server.js"),
    "utf8"
  );

  const indiceAdaptador = fuente.indexOf("await montarAdaptadorSocketIO(io)");
  assert.ok(indiceAdaptador > 0);
  // Antes de `server.listen`: si un socket entra con el adaptador viejo, sus
  // salas quedan en el proceso equivocado.
  assert.ok(indiceAdaptador < fuente.indexOf("server.listen(PORT"), "el adaptador va antes de escuchar");
  // Y el apagado ordenado lo cierra.
  assert.match(fuente, /await adaptadorSocketIO\.cerrar\(\)/);
});

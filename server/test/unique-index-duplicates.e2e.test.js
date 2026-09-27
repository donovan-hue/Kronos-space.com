/**
 * Comprobación de duplicados de índices únicos — contra MongoDB REAL.
 *
 * La capa de contrato (`unique-index-duplicates.contract.test.js`) fija qué
 * consulta se envía. Esta fija lo único que de verdad importa: que el
 * veredicto del auditor coincida con lo que hace el motor.
 *
 * Para cada escenario, en una base TEMPORAL:
 *
 *   1. se insertan los documentos,
 *   2. se ejecuta el auditor del diagnóstico,
 *   3. se intenta crear ese mismo índice único de verdad.
 *
 * Y se exige la equivalencia en los dos sentidos:
 *
 *   LIMPIO      ⇔ createIndex funciona
 *   DUPLICADOS  ⇔ createIndex falla con E11000
 *
 * Un falso positivo (lo que ocurría con `users.googleId_1`) rompe la primera
 * implicación; un falso negativo rompe la segunda.
 *
 * NO se ejecuta contra producción ni contra ningún clúster que no se pueda
 * demostrar de pruebas: `assertE2ETarget` bloquea los hosts productivos y
 * omite los que no estén declarados. Sin MONGODB_URI, las pruebas se
 * OMITEN con el motivo; jamás se sustituyen por un MongoDB imitado.
 *
 *   MONGODB_URI='mongodb://127.0.0.1:27017/kronos_dev' \
 *   npm test --workspace=server -- test/unique-index-duplicates.e2e.test.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

/**
 * `mongoose` se carga TARDE, solo cuando se va a conectar de verdad.
 *
 * Cargarlo al importar hacía que este fichero reventara con MODULE_NOT_FOUND
 * en un árbol sin `npm ci`, en lugar de omitirse por la razón real (no hay
 * MongoDB). Si hay URI y falta la dependencia, el error sí sale: pediste una
 * ejecución real y no se puede hacer, que es un fallo, no una omisión.
 */
let mongoose = null;
function cargarMongoose() {
  if (!mongoose) mongoose = require("mongoose");
  return mongoose;
}

const SCRIPT = path.join(
  __dirname, "..", "..", "scripts", "db", "production-readonly-diagnostics.js"
);

const { inventarioIndices, duplicadosParaUnicos } = require(SCRIPT);

const {
  ESCENARIOS,
  ESCENARIOS_AUDITADOS,
  filaInventario,
  opcionesCreacion
} = require("./helpers/unique-index-scenarios");

const { assertE2ETarget } = require("./helpers/e2e-target-guard");

/** Base temporal propia: nunca se toca la base que traiga la URI. */
const baseTemporal = `kronos_e2e_${crypto.randomBytes(6).toString("hex")}`;

let habilitado = Boolean(process.env.MONGODB_URI);
let motivoOmision = "Requiere MONGODB_URI de un MongoDB real; no se simula ninguno.";

if (habilitado) {
  habilitado = assertE2ETarget({ uri: process.env.MONGODB_URI, dbName: baseTemporal });
  if (!habilitado) {
    motivoOmision =
      "El destino no se puede demostrar de pruebas (ver e2e-target-guard): no se conecta.";
  }
}

let conexion = null;
let db = null;

async function conectar() {
  if (db) return db;
  const mongoose = cargarMongoose();
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: baseTemporal,
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 15000
  });
  conexion = mongoose.connection;
  assert.equal(conexion.db.databaseName, baseTemporal, "la base de trabajo debe ser la temporal");
  db = conexion.db;
  return db;
}

/** Envuelve las pruebas que exigen MongoDB real. */
function mongoTest(nombre, fn) {
  test(nombre, async (t) => {
    if (!habilitado) {
      t.skip(motivoOmision);
      return;
    }
    await fn(t, await conectar());
  });
}

/** ¿Acepta MongoDB crear ese índice único sobre los datos ya insertados? */
async function intentarCrearIndice(coleccion, escenario) {
  try {
    await coleccion.createIndex(escenario.indice.key, opcionesCreacion(escenario));
    return { creado: true, code: null, message: null };
  } catch (error) {
    return { creado: false, code: error.code ?? null, message: error.message };
  }
}

for (const escenario of ESCENARIOS_AUDITADOS) {
  mongoTest(`MongoDB real · ${escenario.titulo}`, async (t, base) => {
    const nombre = `esc_${escenario.id.replace(/-/g, "_")}_${crypto.randomBytes(3).toString("hex")}`;
    const coleccion = base.collection(nombre);

    await coleccion.insertMany(escenario.documentos.map((documento) => ({ ...documento })));

    const [fila] = await duplicadosParaUnicos(base, [filaInventario(escenario, nombre)]);

    assert.ok(fila, "el auditor debe producir una fila para un índice único");
    assert.equal(fila.status, escenario.esperado, `${escenario.id}: ${escenario.porque}`);
    assert.equal(
      fila.documentsInDomain,
      escenario.documentosEnDominio,
      "el número de documentos que el índice indexa de verdad"
    );

    // El motor tiene la última palabra.
    const intento = await intentarCrearIndice(coleccion, escenario);

    if (escenario.esperado === "LIMPIO") {
      assert.ok(
        intento.creado,
        `el auditor dijo LIMPIO pero MongoDB rechazó el índice: ${intento.message}`
      );
    } else {
      assert.equal(
        intento.creado,
        false,
        "el auditor dijo DUPLICADOS pero MongoDB creó el índice sin problema"
      );
      assert.equal(intento.code, 11000, `se esperaba E11000 y llegó: ${intento.message}`);
    }
  });
}

mongoTest(
  "MongoDB real · la forma de producción (users.googleId_1) se lee del índice ya creado",
  async (t, base) => {
    // Cierra el circuito completo: listIndexes → inventarioIndices →
    // duplicadosParaUnicos, con el índice existiendo de verdad, que es la
    // situación de producción (el índice ya está creado y el informe decía
    // DUPLICADOS igualmente).
    const nombre = `users_produccion_${crypto.randomBytes(3).toString("hex")}`;
    const coleccion = base.collection(nombre);

    await coleccion.insertMany([
      { username: "google-1", googleId: "104729501234567890123" },
      ...Array.from({ length: 19 }, (_, i) => ({ username: `local-${i + 1}` }))
    ]);
    await coleccion.createIndex({ googleId: 1 }, { name: "googleId_1", unique: true, sparse: true });

    const indices = await inventarioIndices(base, [nombre]);
    const googleId = indices.find((indice) => indice.name === "googleId_1");

    assert.deepEqual(googleId.key, { googleId: 1 });
    assert.equal(googleId.unique, true);
    assert.equal(googleId.sparse, true);

    const filas = await duplicadosParaUnicos(base, indices);
    const fila = filas.find((item) => item.index === "googleId_1");

    assert.equal(fila.status, "LIMPIO", "20 documentos, 1 con googleId: no hay duplicado alguno");
    assert.equal(fila.documentsInDomain, 1);
    assert.equal(filas.some((item) => item.index === "_id_"), false, "`_id_` no se audita");
  }
);

mongoTest(
  "MongoDB real · un índice único parcial con su filtro leído de la base",
  async (t, base) => {
    const { Types } = cargarMongoose();
    const nombre = `messages_parcial_${crypto.randomBytes(3).toString("hex")}`;
    const coleccion = base.collection(nombre);
    const emisor = new Types.ObjectId();
    const receptor = new Types.ObjectId();

    await coleccion.insertMany([
      { sender: emisor, receiver: receptor, clientMessageId: "c-1" },
      { sender: emisor, receiver: receptor, clientMessageId: "c-2" },
      // Fuera del dominio: sin receiver/clientMessageId del tipo exigido.
      { sender: emisor, conversation: new Types.ObjectId() },
      { sender: emisor, conversation: new Types.ObjectId() },
      { sender: emisor, receiver: receptor, clientMessageId: null }
    ]);
    await coleccion.createIndex(
      { sender: 1, receiver: 1, clientMessageId: 1 },
      {
        name: "message_sender_receiver_clientMessageId_unique",
        unique: true,
        partialFilterExpression: {
          receiver: { $type: "objectId" },
          clientMessageId: { $type: "string" }
        }
      }
    );

    const indices = await inventarioIndices(base, [nombre]);
    const parcial = indices.find(
      (indice) => indice.name === "message_sender_receiver_clientMessageId_unique"
    );

    assert.deepEqual(parcial.partialFilterExpression, {
      receiver: { $type: "objectId" },
      clientMessageId: { $type: "string" }
    });

    const filas = await duplicadosParaUnicos(base, indices);
    const fila = filas.find((item) => item.index === parcial.name);

    assert.equal(fila.status, "LIMPIO");
    assert.equal(fila.partial, true);
    assert.equal(fila.documentsInDomain, 2, "solo los dos que cumplen el filtro del índice");
  }
);

test("limpieza de la base temporal", async (t) => {
  if (!habilitado || !db) {
    t.skip(motivoOmision);
    return;
  }

  // Doble comprobación antes de borrar: solo la base temporal de esta corrida.
  assert.equal(db.databaseName, baseTemporal);
  assert.match(baseTemporal, /^kronos_e2e_[0-9a-f]{12}$/);

  await db.dropDatabase();
  await mongoose.disconnect();
  conexion = null;
  db = null;
});

// Referencia usada solo para documentar el catálogo completo en la salida.
test("catálogo de escenarios cubierto", () => {
  assert.equal(ESCENARIOS.length, ESCENARIOS_AUDITADOS.length + 1, "solo `_id_` queda sin auditar");
  assert.ok(ESCENARIOS_AUDITADOS.length >= 11, "los casos exigidos están todos");
});

/**
 * Contrato de la comprobación de duplicados de índices ÚNICOS del
 * diagnóstico de producción (`scripts/db/production-readonly-diagnostics.js`).
 *
 * QUÉ DEMUESTRA ESTE FICHERO
 *   - Que el auditor reproduce el DOMINIO de cada índice: qué documentos
 *     mete MongoDB dentro de él (todos / solo los que tienen la clave /
 *     solo los que cumplen `partialFilterExpression`).
 *   - Que la clave de agrupación es la clave del índice, con la ausencia
 *     normalizada a null, que es como el índice la almacena.
 *   - Que el veredicto se deriva de esa agregación y que el formato del
 *     informe no cambia.
 *
 * QUÉ **NO** DEMUESTRA
 *   - Que MongoDB, con unos documentos concretos, devuelva ese resultado.
 *     Eso no se puede afirmar sin un MongoDB real, y aquí no se simula
 *     ninguno: la comprobación documento a documento vive en
 *     `unique-index-duplicates.e2e.test.js`, que usa un servidor real, una
 *     base temporal y contrasta cada veredicto contra el propio motor
 *     (LIMPIO ⇔ createIndex funciona · DUPLICADOS ⇔ E11000). Sin MongoDB
 *     declarado, esa prueba se OMITE; no se sustituye por una imitación.
 *
 * Origen: `users.googleId_1` (unique + sparse) se informaba como
 * DUPLICADOS en producción porque los 19 documentos sin `googleId` caían en
 * el mismo grupo. No había ningún duplicado real.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SCRIPT = path.join(
  __dirname, "..", "..", "scripts", "db", "production-readonly-diagnostics.js"
);

const {
  LIMITE_MUESTRAS_DUPLICADOS,
  clavesIndexadas,
  esIndiceId,
  filtroDominioIndice,
  agrupacionDuplicados,
  pipelineDuplicados,
  duplicadosParaUnicos
} = require(SCRIPT);

const {
  ESCENARIOS,
  ESCENARIOS_AUDITADOS,
  filaInventario
} = require("./helpers/unique-index-scenarios");

/* ---------------------------------------------------------------------------
 * Grabadora de consultas
 *
 * NO es un MongoDB de mentira: no interpreta filtros ni agrega nada. Solo
 * anota qué se le pidió y devuelve exactamente la respuesta que declara la
 * prueba, para poder fijar dos cosas que no dependen del motor: qué consulta
 * se envía y cómo se traduce su resultado a veredicto.
 * ------------------------------------------------------------------------ */
function grabadora({ respuesta = [], conteo = 0, fallo = null } = {}) {
  const llamadas = [];

  return {
    llamadas,
    collection(nombre) {
      return {
        async countDocuments(filtro) {
          if (fallo) throw fallo;
          llamadas.push({ tipo: "countDocuments", coleccion: nombre, filtro });
          return conteo;
        },
        aggregate(pipeline, opciones) {
          llamadas.push({ tipo: "aggregate", coleccion: nombre, pipeline, opciones });
          return {
            async toArray() {
              if (fallo) throw fallo;
              return respuesta;
            }
          };
        }
      };
    }
  };
}

const COLECCION = "coleccion_de_prueba";

function etapa(pipeline, nombre) {
  return pipeline.find((paso) => Object.keys(paso)[0] === nombre) || null;
}

/* ---------------------------------------------------------------------------
 * 1. Dominio del índice — el fallo corregido
 * ------------------------------------------------------------------------ */

for (const escenario of ESCENARIOS) {
  test(`dominio · ${escenario.titulo}`, () => {
    assert.deepEqual(
      filtroDominioIndice(escenario.indice),
      escenario.dominioEsperado,
      `${escenario.id}: ${escenario.porque}`
    );
  });
}

test("unique normal audita la colección entera: la ausencia del campo es una clave null", () => {
  // Manual de MongoDB: «a unique index stores a null value for a document
  // missing the indexed field». Filtrar aquí crearía un falso NEGATIVO.
  const indice = { name: "email_1", key: { email: 1 }, unique: true };
  const pipeline = pipelineDuplicados(indice);

  assert.equal(filtroDominioIndice(indice), null);
  // Sin filtro de dominio: la primera etapa ya es la agrupación, y el único
  // `$match` que queda es el de "grupos con más de uno".
  assert.equal(Object.keys(pipeline[0])[0], "$group");
  assert.deepEqual(
    pipeline.filter((paso) => Object.keys(paso)[0] === "$match"),
    [{ $match: { n: { $gt: 1 } } }]
  );
});

test("unique sparse excluye solo los documentos SIN la clave, no los que la tienen a null", () => {
  const indice = { name: "googleId_1", key: { googleId: 1 }, unique: true, sparse: true };
  const dominio = filtroDominioIndice(indice);

  assert.deepEqual(dominio, { googleId: { $exists: true } });
  // `$ne: null` dejaría fuera los null explícitos, que el índice sí indexa.
  assert.ok(!JSON.stringify(dominio).includes("$ne"), "no se puede filtrar por $ne: null");
});

test("unique sparse compuesto entra si existe AL MENOS UNA de las claves", () => {
  const indice = { name: "a_1_b_1", key: { a: 1, b: 1 }, unique: true, sparse: true };
  assert.deepEqual(filtroDominioIndice(indice), {
    $or: [{ a: { $exists: true } }, { b: { $exists: true } }]
  });
});

test("unique parcial usa el partialFilterExpression literal del índice", () => {
  const filtro = { receiver: { $type: "objectId" }, clientMessageId: { $type: "string" } };
  const indice = {
    name: "message_sender_receiver_clientMessageId_unique",
    key: { sender: 1, receiver: 1, clientMessageId: 1 },
    unique: true,
    partialFilterExpression: filtro
  };

  assert.deepEqual(filtroDominioIndice(indice), filtro);
});

test("partialFilterExpression vacío o ausente no inventa dominio", () => {
  for (const parcial of [null, undefined, {}]) {
    const indice = { name: "x_1", key: { x: 1 }, unique: true, partialFilterExpression: parcial };
    assert.equal(filtroDominioIndice(indice), null);
  }
});

test("sparse y partial juntos aplican los dos (el dominio más pequeño)", () => {
  // MongoDB los declara excluyentes, pero si un índice antiguo llegara con
  // ambos, suponer el dominio grande sería suponer a favor del ruido.
  const indice = {
    name: "x_1",
    key: { x: 1 },
    unique: true,
    sparse: true,
    partialFilterExpression: { activo: true }
  };

  assert.deepEqual(filtroDominioIndice(indice), {
    $and: [{ activo: true }, { x: { $exists: true } }]
  });
});

/* ---------------------------------------------------------------------------
 * 2. Clave de agrupación == clave del índice
 * ------------------------------------------------------------------------ */

test("la agrupación normaliza la ausencia a null, como hace el índice", () => {
  assert.deepEqual(agrupacionDuplicados(["a", "b"]), {
    k0: { $ifNull: ["$a", null] },
    k1: { $ifNull: ["$b", null] }
  });
});

test("las claves con punto no colapsan entre sí", () => {
  // `perfil.id` y `perfil_id` son campos distintos; sustituir el punto por
  // un guion bajo los habría mezclado en el mismo alias del $group.
  const agrupacion = agrupacionDuplicados(["perfil.id", "perfil_id"]);
  assert.equal(Object.keys(agrupacion).length, 2);
  assert.deepEqual(agrupacion, {
    k0: { $ifNull: ["$perfil.id", null] },
    k1: { $ifNull: ["$perfil_id", null] }
  });
});

for (const escenario of ESCENARIOS_AUDITADOS) {
  test(`agrupación · ${escenario.titulo}`, () => {
    const claves = clavesIndexadas(escenario.indice);
    const grupo = etapa(pipelineDuplicados(escenario.indice), "$group");

    assert.deepEqual(grupo.$group._id, agrupacionDuplicados(claves));
    assert.deepEqual(grupo.$group.n, { $sum: 1 });
    assert.deepEqual(claves, Object.keys(escenario.indice.key));
  });
}

/* ---------------------------------------------------------------------------
 * 3. Forma del pipeline — y que siga siendo de solo lectura
 * ------------------------------------------------------------------------ */

test("el pipeline es filtro → agrupación → repetidos → muestra", () => {
  const indice = { name: "googleId_1", key: { googleId: 1 }, unique: true, sparse: true };

  assert.deepEqual(pipelineDuplicados(indice), [
    { $match: { googleId: { $exists: true } } },
    { $group: { _id: { k0: { $ifNull: ["$googleId", null] } }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: LIMITE_MUESTRAS_DUPLICADOS }
  ]);
});

test("ninguna etapa del pipeline puede escribir", () => {
  const ETAPAS_DE_ESCRITURA = ["$out", "$merge", "$planCacheStats"];

  for (const escenario of ESCENARIOS_AUDITADOS) {
    for (const paso of pipelineDuplicados(escenario.indice)) {
      const nombre = Object.keys(paso)[0];
      assert.ok(
        !ETAPAS_DE_ESCRITURA.includes(nombre),
        `${escenario.id} usa la etapa ${nombre}`
      );
      assert.ok(
        ["$match", "$group", "$limit"].includes(nombre),
        `${escenario.id} usa una etapa no prevista: ${nombre}`
      );
    }
  }
});

test("un índice sin claves no genera consulta", () => {
  assert.equal(pipelineDuplicados({ name: "raro", key: {} }), null);
});

/* ---------------------------------------------------------------------------
 * 4. El índice _id queda fuera
 * ------------------------------------------------------------------------ */

test("índice _id excluido: por nombre y por forma de la clave", () => {
  assert.equal(esIndiceId({ name: "_id_", key: { _id: 1 } }), true);
  assert.equal(esIndiceId({ name: "otro_nombre", key: { _id: 1 } }), true);
  assert.equal(esIndiceId({ name: "email_1", key: { email: 1 } }), false);
  assert.equal(esIndiceId({ name: "_id_1_tenant_1", key: { _id: 1, tenant: 1 } }), false);
});

test("índice _id excluido: el auditor no lo consulta ni lo lista", async () => {
  const caso = ESCENARIOS.find((escenario) => escenario.id === "indice-id-excluido");
  const db = grabadora();

  const filas = await duplicadosParaUnicos(db, [filaInventario(caso, COLECCION)]);

  assert.deepEqual(filas, []);
  assert.deepEqual(db.llamadas, [], "no debe abrir ninguna consulta por `_id_`");
});

test("un compuesto que incluye _id conserva _id en la clave agrupada", () => {
  // Quitarlo (como hacía la versión anterior) agrupa por menos campos de los
  // que el índice compara: otro falso positivo.
  const indice = { name: "_id_1_tenant_1", key: { _id: 1, tenant: 1 }, unique: true };

  assert.deepEqual(clavesIndexadas(indice), ["_id", "tenant"]);
  assert.deepEqual(etapa(pipelineDuplicados(indice), "$group").$group._id, {
    k0: { $ifNull: ["$_id", null] },
    k1: { $ifNull: ["$tenant", null] }
  });
});

test("los índices no únicos no se auditan", async () => {
  const db = grabadora();
  const filas = await duplicadosParaUnicos(db, [
    {
      collection: COLECCION,
      name: "createdAt_-1",
      key: { createdAt: -1 },
      unique: false,
      sparse: false,
      partial: false,
      partialFilterExpression: null,
      ttl: null
    }
  ]);

  assert.deepEqual(filas, []);
  assert.deepEqual(db.llamadas, []);
});

/* ---------------------------------------------------------------------------
 * 5. Del resultado de la agregación al veredicto
 *
 * Aquí la respuesta la declara la prueba: se fija la traducción, no el
 * comportamiento de MongoDB.
 * ------------------------------------------------------------------------ */

const CASO_SPARSE = ESCENARIOS.find((escenario) => escenario.id === "unique-sparse-produccion");

test("sin grupos repetidos el veredicto es LIMPIO", async () => {
  const db = grabadora({ respuesta: [], conteo: 1 });
  const [fila] = await duplicadosParaUnicos(db, [filaInventario(CASO_SPARSE, "users")]);

  assert.equal(fila.status, "LIMPIO");
  assert.equal(fila.duplicates, 0);
  assert.equal(fila.documentsInDomain, 1);
  assert.match(fila.detail, /^Sin duplicados en la muestra\./);
  assert.match(fila.detail, /sparse/i, "un LIMPIO por sparse tiene que decir por qué");
});

test("con grupos repetidos el veredicto es DUPLICADOS", async () => {
  const db = grabadora({ respuesta: [{ _id: { k0: "x" }, n: 2 }], conteo: 2 });
  const [fila] = await duplicadosParaUnicos(db, [filaInventario(CASO_SPARSE, "users")]);

  assert.equal(fila.status, "DUPLICADOS");
  assert.equal(fila.duplicates, 1);
  assert.match(fila.detail, /^La creación del índice único fallaría con E11000/);
});

test("si la consulta falla, el informe dice ERROR y no LIMPIO", async () => {
  // Fail-closed: un fallo de lectura no puede parecer una base sana.
  const db = grabadora({ fallo: new Error("not authorized on kronos to execute command") });
  const [fila] = await duplicadosParaUnicos(db, [filaInventario(CASO_SPARSE, "users")]);

  assert.equal(fila.status, "ERROR");
  assert.equal(fila.duplicates, null);
  assert.match(fila.detail, /not authorized/);
});

test("la consulta que se envía es la del dominio del índice, sobre su colección", async () => {
  const db = grabadora({ respuesta: [], conteo: 1 });
  await duplicadosParaUnicos(db, [filaInventario(CASO_SPARSE, "users")]);

  const conteo = db.llamadas.find((llamada) => llamada.tipo === "countDocuments");
  const agregacion = db.llamadas.find((llamada) => llamada.tipo === "aggregate");

  assert.equal(conteo.coleccion, "users");
  assert.deepEqual(conteo.filtro, { googleId: { $exists: true } });
  assert.equal(agregacion.coleccion, "users");
  assert.deepEqual(agregacion.pipeline, pipelineDuplicados(CASO_SPARSE.indice));
  assert.deepEqual(agregacion.opciones, { allowDiskUse: true });
});

test("para un índice único normal se cuenta la colección entera", async () => {
  const caso = ESCENARIOS.find((escenario) => escenario.id === "unique-normal-limpio");
  const db = grabadora({ respuesta: [], conteo: 3 });
  const [fila] = await duplicadosParaUnicos(db, [filaInventario(caso, COLECCION)]);

  const conteo = db.llamadas.find((llamada) => llamada.tipo === "countDocuments");
  assert.deepEqual(conteo.filtro, {});
  assert.equal(fila.indexDomainFilter, null);
  assert.equal(fila.detail, "Sin duplicados en la muestra.");
});

/* ---------------------------------------------------------------------------
 * 6. Regresión del formato del informe
 * ------------------------------------------------------------------------ */

test("regresión: cada fila conserva los campos del informe y añade la trazabilidad", async () => {
  const db = grabadora({ respuesta: [], conteo: 1 });
  const [fila] = await duplicadosParaUnicos(db, [filaInventario(CASO_SPARSE, "users")]);

  for (const campo of ["collection", "index", "keys", "status", "duplicates", "detail"]) {
    assert.ok(campo in fila, `el informe pierde el campo ${campo}`);
  }
  // Añadidos: sin ellos, un LIMPIO no se puede auditar.
  for (const campo of ["sparse", "partial", "documentsInDomain", "indexDomainFilter"]) {
    assert.ok(campo in fila, `falta la evidencia ${campo}`);
  }

  assert.equal(fila.collection, "users");
  assert.equal(fila.index, "googleId_1");
  assert.deepEqual(fila.keys, ["googleId"]);
  assert.equal(fila.sparse, true);
  assert.equal(fila.partial, false);
});

test("regresión: los tres estados posibles siguen siendo LIMPIO, DUPLICADOS y ERROR", async () => {
  const fila = filaInventario(CASO_SPARSE, "users");

  const [limpio] = await duplicadosParaUnicos(grabadora({ respuesta: [] }), [fila]);
  const [duplicado] = await duplicadosParaUnicos(
    grabadora({ respuesta: [{ _id: { k0: "x" }, n: 2 }] }), [fila]
  );
  const [error] = await duplicadosParaUnicos(grabadora({ fallo: new Error("x") }), [fila]);

  assert.deepEqual(
    [limpio.status, duplicado.status, error.status],
    ["LIMPIO", "DUPLICADOS", "ERROR"]
  );
});

test("regresión: la sección y las columnas del informe no cambian", () => {
  const fuente = fs.readFileSync(SCRIPT, "utf8");

  assert.match(fuente, /----- UNIQUE INDEX DUPLICATE CHECKS -----/);
  assert.match(
    fuente,
    /\["colección", "índice", "claves", "estado", "muestras"\]/,
    "las columnas de la tabla son parte del formato acordado"
  );
  assert.match(fuente, /uniqueDuplicates: duplicados/, "la clave del JSON no cambia");
  assert.match(fuente, /d\.status/);
  assert.match(fuente, /d\.duplicates \?\? "n\/d"/);
});

test("regresión: el inventario de índices publica el filtro parcial", () => {
  // `partial: true` sin el filtro no permite reproducir el dominio.
  const fuente = fs.readFileSync(SCRIPT, "utf8");
  assert.match(fuente, /partialFilterExpression: index\.partialFilterExpression \?\? null/);
});

test("regresión: el auditor no vuelve a agrupar la colección entera de un índice sparse", () => {
  // La prueba que habría evitado el falso positivo de `users.googleId_1`.
  const indice = { name: "googleId_1", key: { googleId: 1 }, unique: true, sparse: true };
  const pipeline = pipelineDuplicados(indice);

  assert.equal(Object.keys(pipeline[0])[0], "$match", "el dominio se filtra ANTES de agrupar");
  assert.deepEqual(pipeline[0], { $match: { googleId: { $exists: true } } });
});

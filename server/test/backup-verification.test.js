const test = require("node:test");
const assert = require("node:assert/strict");
const SCRIPT_BACKUP = require("node:path").join(__dirname, "..", "..", "scripts", "backup-verify.js");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { EJSON, ObjectId, Binary } = require("bson");

const {
  MANIFEST_FORMAT,
  VERIFICATION,
  createContentDigest,
  legacyContentChecksum,
  normalizeIndexList,
  compararIndices,
  isLineDelimited,
  readBackupStream,
  stampVerification,
  stripDatabase
} = require("../../scripts/backup-verify");

const { loadBackupManifest } = require("../../scripts/db/migrate");

const RAIZ = path.join(__dirname, "..", "..");
const fuente = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

function directorioTemporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kronos-backup-test-"));
}

function escribirManifiesto(dir, manifest) {
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return dir;
}

/* ===================================================================== */
/* R-07 — CHECKSUM_VERIFIED y RESTORE_VERIFIED son estados distintos      */
/* ===================================================================== */

test("R-07: un respaldo solo con checksum NO autoriza la migración", () => {
  const dir = directorioTemporal();
  try {
    escribirManifiesto(dir, {
      mode: "json",
      database: "kronos_ensayo",
      verification: VERIFICATION.CHECKSUM,
      verifiedAt: new Date().toISOString(),
      checksumVerifiedAt: new Date().toISOString(),
      collections: {}
    });

    assert.throws(
      () => loadBackupManifest(dir),
      (error) => /RESTORE_VERIFIED/.test(error.message) && /CHECKSUM_VERIFIED/.test(error.message),
      "un checksum no puede pasar por prueba de restauración"
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R-07: un respaldo con restauración probada sí autoriza", () => {
  const dir = directorioTemporal();
  try {
    escribirManifiesto(dir, {
      mode: "json",
      database: "kronos_ensayo",
      verification: VERIFICATION.RESTORE,
      verifiedAt: new Date().toISOString(),
      restoreVerifiedAt: new Date().toISOString(),
      restoreTarget: "kronos_migration_test",
      collections: {}
    });

    const manifest = loadBackupManifest(dir);
    assert.equal(manifest.verification, "RESTORE_VERIFIED");
    assert.equal(manifest.database, "kronos_ensayo");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R-07: manifiesto antiguo con verifiedAt suelto se rechaza", () => {
  // Los respaldos creados antes de esta separación solo tienen `verifiedAt`.
  // Aceptarlos por compatibilidad sería reabrir exactamente el agujero.
  const dir = directorioTemporal();
  try {
    escribirManifiesto(dir, {
      mode: "json",
      database: "kronos_ensayo",
      verifiedAt: new Date().toISOString(),
      collections: {}
    });

    assert.throws(
      () => loadBackupManifest(dir),
      /manifiesto antiguo/,
      "un manifiesto sin nivel explícito no demuestra restauración"
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R-07: sin manifiesto, FAIL", () => {
  const dir = directorioTemporal();
  try {
    assert.throws(() => loadBackupManifest(dir), /manifest\.json/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R-07: el nivel de verificación nunca baja al recomprobar", () => {
  const dir = directorioTemporal();
  try {
    escribirManifiesto(dir, {
      mode: "json",
      database: "kronos_ensayo",
      verification: VERIFICATION.RESTORE,
      collections: {}
    });

    // Volver a pasar --check sobre un respaldo ya restaurado no puede
    // degradarlo: se perdería una prueba que sí se hizo.
    stampVerification(dir, { collections: 1, documents: 1 }, VERIFICATION.CHECKSUM);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    assert.equal(manifest.verification, "RESTORE_VERIFIED");

    // Y al revés sí sube.
    escribirManifiesto(dir, { mode: "json", verification: VERIFICATION.CHECKSUM, collections: {} });
    stampVerification(dir, { collections: 1, documents: 1, targetDatabase: "x" }, VERIFICATION.RESTORE);
    const subido = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    assert.equal(subido.verification, "RESTORE_VERIFIED");
    assert.equal(subido.restoreTarget, "x");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ===================================================================== */
/* R-06 — el respaldo no puede depender de cargar la base en memoria      */
/* ===================================================================== */

test("R-06: el digest de contenido guarda 32 bytes por documento, no el documento", () => {
  const digest = createContentDigest();
  const grande = "x".repeat(1024 * 1024); // 1 MB por documento
  for (let i = 0; i < 40; i += 1) digest.add(grande + i);
  const resultado = digest.close();
  assert.match(resultado, /^[0-9a-f]{64}$/);
});

test("R-06: el digest es independiente del orden pero sensible al contenido", () => {
  const docs = ["a", "b", "c", "d"];
  const directo = createContentDigest();
  docs.forEach((d) => directo.add(d));
  const inverso = createContentDigest();
  [...docs].reverse().forEach((d) => inverso.add(d));
  assert.equal(directo.close(), inverso.close(), "el orden del cursor no debe cambiar el checksum");

  const alterado = createContentDigest();
  ["a", "b", "c", "D"].forEach((d) => alterado.add(d));
  assert.notEqual(directo.close(), alterado.close(), "un cambio de contenido debe detectarse");
});

test("R-06: el volcado en streaming no materializa la colección", () => {
  const codigo = fuente("scripts/backup-verify.js");
  const inicio = codigo.indexOf("async function dumpCollectionStreaming");
  const fin = codigo.indexOf("function describeIndexes");
  assert.ok(inicio > 0 && fin > inicio, "no se encuentra el volcado en streaming");

  const cuerpo = codigo.slice(inicio, fin);
  assert.doesNotMatch(cuerpo, /\.toArray\(\)/, "toArray carga la colección entera en memoria");
  assert.match(cuerpo, /for await \(const document of cursor\)/, "debe recorrer el cursor documento a documento");
  assert.match(cuerpo, /createWriteStream/, "debe escribir en streaming");

  // El formato antiguo obligaba a releer el fichero entero para verificarlo.
  assert.equal(MANIFEST_FORMAT, "ejson-canonical-v2");
  assert.equal(isLineDelimited({ format: "ejson-canonical-v2" }), true);
  assert.equal(isLineDelimited({ format: "ejson-canonical-v1" }), false);
  assert.equal(isLineDelimited({}), false, "sin formato declarado se asume el antiguo");
});

test("R-06: ida y vuelta por líneas preservando tipos BSON", async () => {
  const dir = directorioTemporal();
  try {
    const archivo = path.join(dir, "muestra.json");
    const originales = [
      { _id: new ObjectId(), fecha: new Date("2026-09-26T12:00:00.000Z"), datos: new Binary(crypto.randomBytes(2048)) },
      { _id: new ObjectId(), lista: [1, "dos", { tres: true }], nulo: null }
    ];
    fs.writeFileSync(
      archivo,
      originales.map((doc) => EJSON.stringify(doc, { relaxed: false })).join("\n") + "\n"
    );

    const leidos = [];
    for await (const { document } of readBackupStream(archivo)) leidos.push(document);

    assert.equal(leidos.length, 2);
    assert.ok(leidos[0]._id.equals(originales[0]._id), "ObjectId preservado");
    assert.equal(leidos[0].fecha.getTime(), originales[0].fecha.getTime(), "fecha preservada");
    assert.equal(Buffer.compare(leidos[0].datos.buffer, originales[0].datos.buffer), 0, "binario preservado");
    assert.deepEqual(JSON.parse(JSON.stringify(leidos[1].lista)), [1, "dos", { tres: true }]);
    assert.equal(leidos[1].nulo, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R-06: los respaldos antiguos siguen siendo legibles", () => {
  const dir = directorioTemporal();
  try {
    const archivo = path.join(dir, "antiguo.json");
    const docs = [{ a: 1 }, { a: 2 }];
    fs.writeFileSync(archivo, EJSON.stringify(docs, { relaxed: false }));
    const checksum = legacyContentChecksum(EJSON.parse(fs.readFileSync(archivo, "utf8"), { relaxed: false }));
    assert.match(checksum, /^[0-9a-f]{64}$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ===================================================================== */
/* R-09 — la restauración debe reconstruir y comprobar los índices        */
/* ===================================================================== */

test("R-09: la restauración recrea los índices del manifiesto", () => {
  const codigo = fuente("scripts/backup-verify.js");
  const inicio = codigo.indexOf("async function runRestore");
  const fin = codigo.indexOf("function parseOptions");
  const cuerpo = codigo.slice(inicio, fin);

  assert.match(cuerpo, /restoreIndexes\(/, "runRestore debe recrear los índices");
  assert.match(cuerpo, /compararIndices\(/, "y compararlos con el manifiesto");
  assert.match(cuerpo, /índices sin restaurar/, "una diferencia de índices debe ser un problema declarado");

  const restore = codigo.slice(codigo.indexOf("async function restoreIndexes"), codigo.indexOf("function compararIndices"));
  assert.match(restore, /createIndex\(/, "debe crear el índice de verdad");
  assert.match(restore, /expireAfterSeconds/, "debe conservar los TTL");
  assert.match(restore, /unique/, "debe conservar las restricciones únicas");
});

test("R-09: la comparación detecta índices ausentes y definiciones distintas", () => {
  const esperados = normalizeIndexList([
    { name: "username_1", key: { username: 1 }, unique: true },
    { name: "expiresAt_1", key: { expiresAt: 1 }, expireAfterSeconds: 0 }
  ]);

  assert.equal(compararIndices(esperados, esperados).ok, true, "idénticos deben coincidir");

  // normalizeIndexList ordena por nombre: el primero es expiresAt_1.
  const faltaUno = compararIndices(esperados, esperados.slice(0, 1));
  assert.equal(faltaUno.ok, false);
  assert.deepEqual(faltaUno.faltan, ["username_1"]);

  // Mismo nombre, restricción perdida: el caso peligroso, porque la colección
  // «existe y tiene el índice» pero ya no impone nada.
  const sinUnique = normalizeIndexList([
    { name: "username_1", key: { username: 1 } },
    { name: "expiresAt_1", key: { expiresAt: 1 }, expireAfterSeconds: 0 }
  ]);
  const degradado = compararIndices(esperados, sinUnique);
  assert.equal(degradado.ok, false, "perder unique debe detectarse");
  assert.deepEqual(degradado.distintos, ["username_1"]);

  // Un TTL con otra ventana tampoco es el mismo índice.
  const otroTtl = normalizeIndexList([
    { name: "username_1", key: { username: 1 }, unique: true },
    { name: "expiresAt_1", key: { expiresAt: 1 }, expireAfterSeconds: 3600 }
  ]);
  assert.deepEqual(compararIndices(esperados, otroTtl).distintos, ["expiresAt_1"]);
});

test("R-09: _id_ se ignora porque MongoDB lo crea solo", () => {
  const lista = normalizeIndexList([
    { name: "_id_", key: { _id: 1 } },
    { name: "owner_1", key: { owner: 1 } }
  ]);
  assert.deepEqual(lista.map((index) => index.name), ["owner_1"]);
});

/* ===================================================================== */
/* R-08 — el ensayo de rollback debe distinguir la pérdida por TTL        */
/* ===================================================================== */

test("R-08: el ensayo de rollback clasifica la pérdida por TTL y no la confunde", () => {
  const codigo = fuente("scripts/db/rollback-drill.js");

  assert.match(codigo, /ttlIndexes/, "la instantánea debe registrar qué índices son TTL");
  assert.match(codigo, /allowTtlDeletions/, "tolerar la pérdida por TTL debe exigir una bandera explícita");
  assert.match(codigo, /down\(\) NO los recupera/, "debe decir que el rollback no recupera esos documentos");
  assert.match(
    codigo,
    /solo desde el respaldo previo al índice/,
    "debe indicar la única vía de recuperación"
  );
});

test("R-08: existe un ensayo específico con datos vencidos", () => {
  const codigo = fuente("scripts/db/ttl-drill.js");

  assert.match(codigo, /expireAfterSeconds: 0/, "debe usar el TTL inmediato del plan");
  assert.match(codigo, /vencido-unico/, "debe sembrar un documento vencido");
  assert.match(codigo, /vencido-multiple/, "y varios vencidos");
  assert.match(codigo, /etiqueta: "vigente"/, "y uno no vencido, que debe sobrevivir");
  assert.match(codigo, /sin-fecha/, "y uno sin fecha, que el TTL debe ignorar");
  assert.match(codigo, /dropIndex/, "debe demostrar qué hace el rollback");
  assert.match(codigo, /assertNotProductionDatabase/, "y no puede apuntar a producción");

  // Un ensayo que no pueda fallar no demuestra nada.
  assert.match(codigo, /fallos\.push/, "debe poder declarar el ensayo no superado");
  assert.match(codigo, /el ensayo no observó el efecto que debe demostrar/);
});

// ---------------------------------------------------------------------------
// R-06/R-09 · camino nativo mongodump/mongorestore
// ---------------------------------------------------------------------------

test("R-09: la URI de destino pierde la base antes de remapear espacios de nombres", () => {
  // mongorestore toma la base de la URI como destino fijo y entonces ignora
  // --nsFrom/--nsTo: la copia queda vacía y el respaldo parecía restaurado.
  assert.equal(stripDatabase("mongodb://h:27017/base"), "mongodb://h:27017/");
  assert.equal(
    stripDatabase("mongodb://u:p@h:27017/base?replicaSet=rs0"),
    "mongodb://u:p@h:27017/?replicaSet=rs0"
  );
  assert.equal(
    stripDatabase("mongodb+srv://u:p@c.net/prod?retryWrites=true"),
    "mongodb+srv://u:p@c.net/?retryWrites=true"
  );
  assert.equal(stripDatabase("mongodb://h:27017"), "mongodb://h:27017");

  // Que la función sea correcta no sirve de nada si el punto de llamada no la
  // usa: en CI la restauración nativa devolvió 0 documentos justamente por
  // pasar la URI con la base puesta junto a --nsFrom/--nsTo.
  const source = fs.readFileSync(SCRIPT_BACKUP, "utf8");
  const bloque = source.slice(
    source.indexOf("function mongorestoreArchive"),
    source.indexOf("async function runRestore")
  );
  assert.match(bloque, /stripDatabase\(targetUri\)/, "mongorestore debe recibir la URI sin base");
  assert.match(bloque, /--nsFrom=/);
  assert.match(bloque, /--nsTo=/);
});

test("R-06: las herramientas nativas no reciben la URI por línea de órdenes", () => {
  const source = fs.readFileSync(SCRIPT_BACKUP, "utf8");
  // `--uri=<credenciales>` queda visible en `ps` durante todo el volcado.
  assert.ok(
    !/`--uri=\$\{/.test(source),
    "la URI no puede viajar en argv: usar --config con permisos 0600"
  );
  assert.match(source, /--config=/, "debe pasarse por fichero de configuración");
  assert.match(source, /mode: 0o600/, "el fichero de configuración debe ser privado");
  assert.match(source, /rmSync/, "y borrarse al terminar");
});

test("R-09: los índices se recrean también tras mongorestore", () => {
  const source = fs.readFileSync(SCRIPT_BACKUP, "utf8");
  const bloque = source.slice(source.indexOf("async function runRestore"));
  assert.ok(
    /const indices = await restoreIndexes\(collection, esperado\.indexes\);/.test(bloque),
    "restoreIndexes debe aplicarse sin condicionar al modo del respaldo"
  );
  assert.ok(
    !/if \(manifest\.mode === "json"\) \{\s*indices = await restoreIndexes/.test(bloque),
    "no debe confiarse en que la herramienta nativa traiga los índices"
  );
});

test("R-07: el checksum de contenido se recalcula en los dos modos de respaldo", () => {
  const source = fs.readFileSync(SCRIPT_BACKUP, "utf8");
  const bloque = source.slice(source.indexOf("async function runRestore"));
  // Atarlo a json dejaba el digest sin calcular para mongodump y la
  // comparación declaraba distinta hasta la colección mejor restaurada.
  assert.ok(
    !/manifest\.mode === "json" && esperado\.contentSha256/.test(bloque),
    "el digest no puede depender del modo del respaldo"
  );
  assert.match(bloque, /if \(esperado\.contentSha256\) \{/);
});

test("R-06: la restauración comprueba que no alteró la base de origen", () => {
  const source = fs.readFileSync(SCRIPT_BACKUP, "utf8");
  // `mongorestore --drop` con remapeo puede vaciar el origen si el remapeo no
  // se aplica: contra producción ese fallo se paga una sola vez.
  assert.match(source, /async function comprobarOrigenIntacto/);
  assert.match(source, /LA RESTAURACIÓN ALTERÓ LA BASE DE ORIGEN/);
  const bloque = source.slice(source.indexOf("async function runRestore"));
  assert.match(bloque, /await comprobarOrigenIntacto\(manifest, options\.sourceUri\)/);
});

// ---------------------------------------------------------------------------
// R-07 · el runner es quien ejecuta: la guarda tiene que vivir también ahí
// ---------------------------------------------------------------------------

const { assertBackupAvailable, MigrationError } = require("../src/migrations/runner");

const migracion = { version: "004-indexes", requiresBackup: true };
const base = { databaseName: "kronos_ensayo" };

test("R-07: el runner rechaza un respaldo que solo tiene los checksums bien", () => {
  // Es el caso peligroso: el manifiesto existe, cuadra y nadie lo ha
  // restaurado nunca. Antes pasaba porque el runner ni miraba el campo.
  let error = null;
  try {
    assertBackupAvailable({
      migration: migracion,
      db: base,
      backup: { database: "kronos_ensayo", verification: "CHECKSUM_VERIFIED" },
      dryRun: false
    });
  } catch (e) {
    error = e;
  }
  assert.ok(error instanceof MigrationError, "debe lanzar MigrationError");
  assert.equal(error.code, "MIGRATION_BACKUP_NOT_RESTORED");
  assert.match(error.message, /CHECKSUM_VERIFIED/);
});

test("R-07: el runner rechaza un manifiesto sin campo de verificación", () => {
  let error = null;
  try {
    assertBackupAvailable({
      migration: migracion,
      db: base,
      backup: { database: "kronos_ensayo" },
      dryRun: false
    });
  } catch (e) {
    error = e;
  }
  assert.ok(error instanceof MigrationError, "debe lanzar MigrationError");
  assert.equal(error.code, "MIGRATION_BACKUP_NOT_RESTORED");
  assert.match(error.message, /sin verificar/);
});

test("R-07: el runner acepta el respaldo con restauración demostrada", () => {
  assert.doesNotThrow(() => assertBackupAvailable({
    migration: migracion,
    db: base,
    backup: { database: "kronos_ensayo", verification: "RESTORE_VERIFIED" },
    dryRun: false
  }));
});

test("R-07: los dos extremos nombran igual el nivel exigido", () => {
  // El runner no puede importar de scripts/, así que el literal está escrito
  // dos veces; si uno cambia y el otro no, la guarda se abre en silencio.
  const fuenteRunner = fs.readFileSync(
    require("node:path").join(__dirname, "..", "src", "migrations", "runner.js"),
    "utf8"
  );
  assert.match(fuenteRunner, /const RESTORE_VERIFIED = "RESTORE_VERIFIED";/);
  assert.equal(VERIFICATION.RESTORE, "RESTORE_VERIFIED");
});

test("R-08: 004-indexes advierte de que los TTL no son reversibles", () => {
  const fuente = fs.readFileSync(
    require("node:path").join(__dirname, "..", "src", "migrations", "004-indexes.js"),
    "utf8"
  );
  const cabecera = fuente.slice(0, fuente.indexOf("const {"));
  // Decía «crearlo o borrarlo nunca pierde documentos», que es falso para TTL.
  assert.ok(
    !/nunca pierde documentos, y/.test(cabecera),
    "la cabecera no puede afirmar que crear un índice nunca pierde documentos"
  );
  assert.match(cabecera, /expireAfterSeconds/);
  assert.match(cabecera, /NO devuelve lo ya borrado/);
});

/**
 * FASE C — el diagnóstico de producción no puede escribir.
 *
 * Dos clases de comprobación:
 *   1. Las guardas rechazan todo destino que no se pueda demostrar.
 *   2. El código fuente no contiene una sola operación de escritura.
 *
 * La segunda importa tanto como la primera: una guarda correcta hoy no impide
 * que alguien añada mañana un `updateMany` dentro del script.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SCRIPT = path.join(__dirname, "..", "..", "scripts", "db", "production-readonly-diagnostics.js");

const {
  ALLOW_VAR,
  EXIT,
  redactUri,
  databaseFromUri,
  evaluarGuardas
} = require(SCRIPT);

const URI_OK = "mongodb+srv://usuario:clave@cluster0.ab12c.mongodb.net/kronos_social_ai";

function env(extra = {}) {
  return { MONGODB_URI: URI_OK, [ALLOW_VAR]: "kronos_social_ai", ...extra };
}

/* ---------------------------------------------------------------------------
 * Guardas previas a la conexión
 * ------------------------------------------------------------------------ */

test("FASE C: sin MONGODB_URI no se conecta", () => {
  for (const uri of [undefined, "", "   "]) {
    const motivos = evaluarGuardas(env({ MONGODB_URI: uri }));
    assert.ok(motivos.length, `debe bloquear con MONGODB_URI=${JSON.stringify(uri)}`);
    assert.match(motivos[0], /Falta MONGODB_URI/);
  }
});

test("FASE C: una URI sin base explícita se rechaza", () => {
  // Sin base en la URI, el destino depende de un valor por defecto y el
  // informe podría atribuirse a la base equivocada.
  const motivos = evaluarGuardas(
    env({ MONGODB_URI: "mongodb+srv://u:p@cluster0.ab12c.mongodb.net" })
  );
  assert.ok(motivos.some((m) => /no incluye una base explícita/.test(m)));
});

test("FASE C: sin la base declarada a mano no se conecta", () => {
  const motivos = evaluarGuardas(env({ [ALLOW_VAR]: undefined }));
  assert.ok(motivos.some((m) => m.includes(ALLOW_VAR)));
});

test("FASE C: si la base declarada no coincide con la de la URI, se bloquea", () => {
  // Es el caso del copiar y pegar: la URI dice una cosa y el operador cree
  // otra. El informe resultante sería evidencia de la base equivocada.
  const motivos = evaluarGuardas(env({ [ALLOW_VAR]: "otra_base" }));
  assert.ok(motivos.some((m) => /no coinciden/.test(m)));
});

test("FASE C: apuntar el diagnóstico a una base de pruebas se bloquea", () => {
  for (const base of ["kronos_test", "kronos_ensayo", "staging_db", "kronos_ensayo_rollback"]) {
    const motivos = evaluarGuardas({
      MONGODB_URI: `mongodb://127.0.0.1:27017/${base}`,
      [ALLOW_VAR]: base
    });
    assert.ok(motivos.length, `debe bloquear ${base}`);
    assert.ok(motivos.some((m) => /pruebas o de ensayo/.test(m)), base);
  }
});

test("FASE C: una URI que no lo es se rechaza", () => {
  for (const uri of ["postgres://x/y", "no-es-uri", "http://host/base"]) {
    const motivos = evaluarGuardas(env({ MONGODB_URI: uri }));
    assert.ok(motivos.some((m) => /forma de URI/.test(m)), uri);
  }
});

test("FASE C: el caso legítimo pasa las guardas", () => {
  assert.deepEqual(evaluarGuardas(env()), []);
});

/* ---------------------------------------------------------------------------
 * No se filtran credenciales
 * ------------------------------------------------------------------------ */

test("FASE C: la URI se muestra sin credenciales", () => {
  const redactada = redactUri(URI_OK);
  assert.ok(!redactada.includes("clave"), "no puede aparecer la contraseña");
  assert.ok(!redactada.includes("usuario"), "no puede aparecer el usuario");
  assert.match(redactada, /<credenciales>/);
  assert.match(redactada, /cluster0\.ab12c\.mongodb\.net/, "el host sí, que no es secreto");
});

test("FASE C: la base se extrae de la URI correctamente", () => {
  assert.equal(databaseFromUri(URI_OK), "kronos_social_ai");
  assert.equal(databaseFromUri("mongodb://h:27017/base?x=1"), "base");
  assert.equal(databaseFromUri("mongodb://h:27017/"), null);
  assert.equal(databaseFromUri("mongodb://h:27017"), null);
});

/* ---------------------------------------------------------------------------
 * El código no puede escribir
 * ------------------------------------------------------------------------ */

/** Toda operación del driver capaz de modificar datos o esquema. */
const OPERACIONES_DE_ESCRITURA = [
  "insertOne", "insertMany", "updateOne", "updateMany", "replaceOne",
  "deleteOne", "deleteMany", "findOneAndUpdate", "findOneAndDelete",
  "findOneAndReplace", "bulkWrite", "createIndex", "createIndexes",
  "dropIndex", "dropIndexes", "dropDatabase", "renameCollection",
  "createCollection", "insertMany", "save", "remove", "findAndModify"
];

test("FASE C: el script no contiene ninguna operación de escritura", () => {
  const fuente = fs.readFileSync(SCRIPT, "utf8");
  // Se quitan los comentarios: la prosa explica lo que NO se hace y
  // mencionarlo no puede contar como hacerlo.
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const encontradas = [];
  for (const operacion of OPERACIONES_DE_ESCRITURA) {
    // `drop` a secas también, pero sin cazar `dropTarget` ni similares.
    const patron = new RegExp(`\\.\\s*${operacion}\\s*\\(`);
    if (patron.test(codigo)) encontradas.push(operacion);
  }
  if (/\.\s*drop\s*\(/.test(codigo)) encontradas.push("drop");

  assert.deepEqual(
    encontradas,
    [],
    `el diagnóstico contiene operaciones de escritura: ${encontradas.join(", ")}`
  );
});

test("FASE C: solo se usan las lecturas previstas", () => {
  const fuente = fs.readFileSync(SCRIPT, "utf8");
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  for (const lectura of [
    "listCollections", "listIndexes", "countDocuments", "aggregate",
    "stats", "serverInfo"
  ]) {
    assert.ok(
      new RegExp(`\\.\\s*${lectura}\\s*\\(`).test(codigo),
      `debe usar ${lectura}`
    );
  }
});

test("FASE C: la conexión desactiva la creación automática", () => {
  const fuente = fs.readFileSync(SCRIPT, "utf8");
  // Sin esto, Mongoose puede crear índices y colecciones por su cuenta
  // durante un diagnóstico que se anuncia como de solo lectura.
  assert.match(fuente, /autoIndex:\s*false/);
  assert.match(fuente, /autoCreate:\s*false/);
});

test("FASE C: la aserción final es obligatoria y tiene dos valores", () => {
  const fuente = fs.readFileSync(SCRIPT, "utf8");
  assert.match(fuente, /READ_ONLY_ASSERTION=PASS/);
  assert.match(fuente, /READ_ONLY_ASSERTION=BLOCKED/);
  // Un bloqueo tiene que notarse en el código de salida, no solo en el texto.
  assert.notEqual(EXIT.BLOCKED, 0);
  assert.notEqual(EXIT.ERROR, 0);
  assert.equal(EXIT.OK, 0);
});

test("FASE C: importar el script no lo ejecuta", () => {
  const fuente = fs.readFileSync(SCRIPT, "utf8");
  assert.match(fuente, /require\.main === module/);
});

/* ---------------------------------------------------------------------------
 * Ejecución real del CLI, sin base de datos
 * ------------------------------------------------------------------------ */

test("FASE C: ejecutado sin configuración, bloquea y sale con código != 0", () => {
  const { spawnSync } = require("node:child_process");
  const resultado = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, KRONOS_IGNORE_ENV_FILE: "1" },
    timeout: 30000
  });

  assert.match(resultado.stdout, /READ_ONLY_ASSERTION=BLOCKED/);
  assert.ok(!/READ_ONLY_ASSERTION=PASS/.test(resultado.stdout));
  assert.notEqual(resultado.status, 0, "un bloqueo debe fallar el proceso");
  assert.match(resultado.stdout, /No se abrió ninguna conexión/);
});

test("FASE C: ejecutado contra una base productiva sin declararla, bloquea", () => {
  const { spawnSync } = require("node:child_process");
  const resultado = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      KRONOS_IGNORE_ENV_FILE: "1",
      MONGODB_URI: URI_OK
    },
    timeout: 30000
  });

  assert.match(resultado.stdout, /READ_ONLY_ASSERTION=BLOCKED/);
  assert.notEqual(resultado.status, 0);
  // Y no puede haber filtrado la contraseña por el camino.
  assert.ok(!resultado.stdout.includes("clave"), "no puede filtrar la contraseña");
});

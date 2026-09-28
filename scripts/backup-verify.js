/**
 * FASE 2 del plan de migración — respaldo verificable y restauración probada.
 *
 * Tres modos:
 *   1. mongodump (preferido): volcado comprimido + manifiesto con conteos
 *      vivos; verificación por checksum del archivo.
 *   2. EJSON (alternativa sin herramientas de MongoDB): exportación por
 *      colección en Extended JSON canónico —ObjectId, fechas y binarios
 *      conservan su tipo— con SHA-256 del archivo y SHA-256 del contenido
 *      normalizado (independiente del orden de lectura).
 *   3. Restauración: vuelca un respaldo EJSON en una base AISLADA y demuestra
 *      la restauración comparando conteos y checksums de contenido.
 *
 * Uso:
 *   node scripts/backup-verify.js                       # crea y verifica en backups/
 *   node scripts/backup-verify.js --out DIR             # crea y verifica en DIR
 *   node scripts/backup-verify.js --check DIR           # verifica un respaldo
 *   MONGODB_TARGET_URI=mongodb://target-user@host/kronos_restore \
 *     node scripts/backup-verify.js --restore DIR --target-db kronos_restore
 *
 * Crear respaldos requiere MONGODB_URI. Restaurarlos exige una credencial
 * separada en MONGODB_TARGET_URI; una URI de destino nunca viaja en argv ni se
 * deriva de las credenciales de producción. Sale con código 1 ante cualquier
 * ambigüedad: un respaldo que no se puede verificar no cuenta como respaldo.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const BACKUPS_ROOT = path.join(ROOT, "backups");
const MANIFEST_FORMAT = "ejson-canonical-v2";
const LEGACY_FORMATS = new Set(["ejson-canonical-v1"]);

// Contrato cerrado para el único restore autorizado en esta fase. Estos
// nombres NO describen una verdad universal del producto: acotan esta
// operación concreta para que ninguna URI o bandera pueda ampliar su alcance.
const PRODUCTION_DATABASE = "kronos-space-com";
const AUTHORIZED_RESTORE_TARGET = "kronos_restore";
const TARGET_URI_ENV = "MONGODB_TARGET_URI";

/**
 * Estados de verificación de un respaldo. Son distintos a propósito.
 *
 * `CHECKSUM_VERIFIED` dice que los ficheros están intactos. No dice que los
 * datos puedan volver a entrar en Mongo: un archivo íntegro de un volcado
 * incompatible, o un EJSON perfecto de una base que ya no admite esos
 * documentos, pasa el checksum y no restaura. Antes ambos casos compartían
 * una sola marca, `verifiedAt`, y la migración la aceptaba como prueba.
 *
 * `RESTORE_VERIFIED` solo se sella tras meter los datos en una base real y
 * comprobar recuentos, contenido e índices contra el manifiesto.
 */
const VERIFICATION = {
  NONE: "NONE",
  CHECKSUM: "CHECKSUM_VERIFIED",
  RESTORE: "RESTORE_VERIFIED"
};

const VERIFICATION_RANK = { NONE: 0, CHECKSUM_VERIFIED: 1, RESTORE_VERIFIED: 2 };

// Los módulos viven en el workspace del servidor; el script vive en la
// raíz y debe funcionar con o sin dotenv instalado.
function requireServerModule(name) {
  const candidates = [
    name,
    path.join(ROOT, "node_modules", name),
    path.join(ROOT, "server", "node_modules", name)
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // siguiente candidato
    }
  }
  throw new Error(`No se pudo cargar ${name}. Ejecuta npm install antes del respaldo.`);
}

// Parser mínimo de .env (sin dependencias): solo fija lo que falta.
function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

try {
  requireServerModule("dotenv").config({ path: path.join(ROOT, "server", ".env"), quiet: true });
} catch {
  loadEnvFile(path.join(ROOT, "server", ".env"));
}

/** Extended JSON canónico: sin él, ObjectId y fechas no sobreviven al viaje. */
function ejson() {
  return requireServerModule("bson").EJSON;
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  // Escritura síncrona: process.exit no espera el buffer de stderr.
  try {
    fs.writeSync(2, `BACKUP_FAIL: ${message}\n`);
  } catch {
    // stderr cerrado: nada que hacer, el código de salida ya informa.
  }
  process.exit(1);
}

/** Nunca se imprime una URI con credenciales. */
function redactUri(uri) {
  return String(uri || "").replace(/\/\/[^@/]+@/, "//***@");
}

function loadUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    fail("Falta MONGODB_URI (server/.env). Sin conexión no hay respaldo verificable.");
  }
  return uri;
}

function databaseNameFromUri(uri) {
  const match = /\/\/[^/]+\/([^?]+)/.exec(String(uri || ""));
  return match ? decodeURIComponent(match[1]) : "";
}

/**
 * Deriva los invariantes declarados por las colecciones sin hardcodear el
 * tamaño del respaldo. Los campos verified* son evidencia redundante: cuando
 * existen tienen que coincidir con el detalle, nunca sustituirlo.
 */
function validateManifestInvariants(manifest) {
  const entries = Object.entries(manifest?.collections || {});
  let documents = 0;

  for (const [name, entry] of entries) {
    const count = typeof entry === "number" ? entry : entry?.count;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`La colección ${name} no declara un count entero no negativo.`);
    }
    documents += count;
    if (!Number.isSafeInteger(documents)) {
      throw new Error("El total de documentos del manifiesto excede el rango entero seguro.");
    }
  }

  const collections = entries.length;
  if (
    Object.prototype.hasOwnProperty.call(manifest, "verifiedCollections")
    && manifest.verifiedCollections !== collections
  ) {
    throw new Error(
      `Invariante de colecciones incumplido: el manifiesto declara ${manifest.verifiedCollections} verificadas, ` +
      `pero contiene ${collections}.`
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(manifest, "verifiedDocuments")
    && manifest.verifiedDocuments !== documents
  ) {
    throw new Error(
      `Invariante de documentos incumplido: el manifiesto declara ${manifest.verifiedDocuments} verificados, ` +
      `pero la suma de collection.count es ${documents}.`
    );
  }

  return { collections, documents };
}

/** El restore de esta fase solo admite el backup de producción identificado. */
function validateProductionManifest(manifest) {
  if (manifest?.database !== PRODUCTION_DATABASE) {
    throw new Error(
      `Origen no autorizado: el manifest pertenece a "${manifest?.database || "(sin nombre)"}"; ` +
      `se exige exactamente "${PRODUCTION_DATABASE}".`
    );
  }
  return validateManifestInvariants(manifest);
}

/** Identidad de usuario sin conservar ni devolver la contraseña. */
function credentialUser(uri, label) {
  try {
    const parsed = new URL(String(uri || ""));
    if (!/^mongodb(?:\+srv)?:$/.test(parsed.protocol)) throw new Error("protocolo no soportado");
    return decodeURIComponent(parsed.username || "");
  } catch {
    throw new Error(`La URI de ${label} no es una URI MongoDB válida.`);
  }
}

/**
 * La URI de destino vive en una variable distinta y, cuando la URI de origen
 * declara usuario, exige otro principal. Así no es posible reutilizar por
 * accidente la credencial de la aplicación de producción.
 */
function validateCredentialSeparation(sourceUri, targetUri) {
  if (!targetUri || !String(targetUri).trim()) {
    throw new Error(`Falta ${TARGET_URI_ENV} con la URI y el usuario exclusivos del target.`);
  }
  if (sourceUri && String(sourceUri).trim() === String(targetUri).trim()) {
    throw new Error("La URI del target no puede ser la misma URI de producción.");
  }

  const targetUser = credentialUser(targetUri, "target");
  if (sourceUri) {
    const sourceUser = credentialUser(sourceUri, "producción");
    if (sourceUser && !targetUser) {
      throw new Error("La URI del target debe declarar un usuario separado del usuario de producción.");
    }
    if (sourceUser && sourceUser === targetUser) {
      throw new Error(`El usuario "${targetUser}" del target coincide con el usuario de producción.`);
    }
  }
}

/** Contrato de nombre solicitado, nombre en URI y separación origen/destino. */
function validateRestoreTarget({ sourceDatabase, requestedTarget, targetUri, sourceUri }) {
  const targetDatabase = databaseNameFromUri(targetUri);

  // Esta comprobación es incondicional y ocurre antes de considerar cualquier
  // allowlist. `--force-same-target` dejó de existir: no hay bypass posible.
  if (targetDatabase && targetDatabase === sourceDatabase) {
    throw new Error(`El destino (${targetDatabase}) coincide con el origen del respaldo. Operación prohibida.`);
  }
  if (!requestedTarget || requestedTarget === true) {
    throw new Error(`Falta --target-db ${AUTHORIZED_RESTORE_TARGET}.`);
  }
  if (requestedTarget !== AUTHORIZED_RESTORE_TARGET) {
    throw new Error(
      `Target no autorizado: "${requestedTarget}". Solo se permite "${AUTHORIZED_RESTORE_TARGET}".`
    );
  }
  if (targetDatabase !== requestedTarget) {
    throw new Error(
      `La URI de target resuelve la base "${targetDatabase || "(sin nombre)"}", ` +
      `pero --target-db declara "${requestedTarget}".`
    );
  }

  validateCredentialSeparation(sourceUri, targetUri);
  return targetDatabase;
}

/** Guarda posterior a la conexión y anterior a cualquier acceso de escritura. */
function assertConnectedTarget(actualDatabase, expectedDatabase) {
  if (actualDatabase !== expectedDatabase) {
    throw new Error(
      `La conexión quedó en "${actualDatabase || "(sin nombre)"}" y el target autorizado es ` +
      `"${expectedDatabase}". No se escribió nada.`
    );
  }
}

/** Un restore reproducible parte siempre de una base que no contiene colecciones. */
function assertEmptyTarget(collections) {
  const names = (collections || []).map((item) => typeof item === "string" ? item : item?.name).filter(Boolean);
  if (names.length) {
    throw new Error(
      `El target no está vacío; contiene ${names.length} colecciones: ${names.slice(0, 10).join(", ")}. ` +
      "No se ejecutará dropDatabase ni deleteMany. Usa una base nueva."
    );
  }
}

async function connectMongoose(uri) {
  const mongoose = requireServerModule("mongoose");
  // `autoIndex: false` es obligatorio en toda herramienta que se conecte:
  // basta con que alguien importe el registro de colecciones (por ejemplo
  // para etiquetar por dominio) para que Mongoose registre los 27 modelos y
  // construya sus 61 índices nada más conectar. Aquí sería especialmente
  // grave: --restore escribe en la base DESTINO, así que la copia
  // "restaurada" dejaría de ser comparable con el origen y la prueba de
  // restauración compararía datos que la propia herramienta modificó.
  // Hoy este script no carga ningún modelo; la opción evita que mañana
  // dependa de que nadie añada un require.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, autoIndex: false });
  return mongoose;
}

function sha256(filePath) {
  const contents = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(contents).digest("hex");
}

/**
 * Checksum del CONTENIDO (no del archivo): documentos ordenados por _id y
 * serializados en EJSON canónico. Dos exportaciones de los mismos datos dan
 * el mismo valor aunque cambie el orden de lectura o el formato del archivo.
 * Es lo que permite demostrar que una restauración devolvió los mismos datos.
 */
/**
 * Checksum de contenido v1 (heredado): materializa una cadena canónica por
 * documento, las ordena y las concatena. Mantiene compatibilidad con los
 * respaldos antiguos, y arrastra su defecto: exige el contenido entero en
 * memoria tres veces. Solo se usa para releer respaldos `v1`.
 */
function legacyContentChecksum(documents) {
  const EJSON = ejson();
  const canonical = [...documents]
    .map((document) => EJSON.stringify(document, { relaxed: false }))
    .sort();
  return crypto.createHash("sha256").update(canonical.join("\n")).digest("hex");
}

/**
 * Acumulador de checksum de contenido v2, independiente del orden y con
 * memoria proporcional al NÚMERO de documentos, no a su tamaño.
 *
 * De cada documento se guarda solo su resumen de 32 bytes; al cerrar se
 * ordenan los resúmenes y se encadenan. Un millón de documentos ocupa 32 MB
 * pase lo que pase dentro de ellos, así que un GridFS de cualquier tamaño
 * deja de importar. El v1 guardaba la cadena canónica completa de cada
 * documento y por eso reventaba.
 */
function createContentDigest() {
  const digests = [];
  return {
    add(canonicalString) {
      digests.push(crypto.createHash("sha256").update(canonicalString).digest());
    },
    close() {
      digests.sort(Buffer.compare);
      const hash = crypto.createHash("sha256");
      for (const digest of digests) hash.update(digest);
      return hash.digest("hex");
    }
  };
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Estado del diario de migraciones: qué versión de esquema respalda esto. */
async function schemaVersionOf(db) {
  try {
    const records = await db.collection("kronos_migrations").find({}).toArray();
    const applied = records.filter((record) => record.direction !== "down").map((record) => record.version);
    return { applied: applied.sort((a, b) => a - b), latest: applied.length ? Math.max(...applied) : 0 };
  } catch {
    return { applied: [], latest: 0 };
  }
}

/**
 * Vuelca una colección al disco documento a documento.
 *
 * La versión anterior hacía `find({}).toArray()` y `EJSON.stringify` del
 * array completo: mantenía en memoria el grafo de objetos, la cadena entera
 * y una tercera copia dentro del checksum. Medido en este repositorio, el
 * pico era ~4x el tamaño binario de la colección y `EJSON.stringify` abortaba
 * con `Invalid string length` al superar el tope de cadena de V8 (512 MB),
 * es decir alrededor de 384 MB de GridFS en una sola colección.
 *
 * Ahora el cursor se recorre en streaming y cada documento se escribe y se
 * descarta. No hay techo de tamaño ni límite arbitrario: el pico depende del
 * documento más grande, que en GridFS es un chunk de 255 KB.
 */
async function dumpCollectionStreaming(collection, filePath) {
  const EJSON = ejson();
  const stream = fs.createWriteStream(filePath, { encoding: "utf8" });
  const digest = createContentDigest();
  const fileHash = crypto.createHash("sha256");
  let count = 0;

  const write = (chunk) => {
    fileHash.update(chunk);
    if (!stream.write(chunk)) {
      return new Promise((resolve, reject) => {
        stream.once("drain", resolve);
        stream.once("error", reject);
      });
    }
    return null;
  };

  // Un documento canónico por línea. El formato de array obligaba a releer
  // el fichero entero para verificarlo o restaurarlo, que es justo lo que se
  // quería evitar; delimitado por líneas se recorre en ambos sentidos con
  // memoria constante.
  const cursor = collection.find({});
  try {
    for await (const document of cursor) {
      const canonical = EJSON.stringify(document, { relaxed: false });
      digest.add(canonical);
      const pending = await write(`${canonical}\n`);
      if (pending) await pending;
      count += 1;
    }
  } finally {
    await cursor.close().catch(() => {});
  }

  await new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.end(resolve);
  });

  return { count, contentSha256: digest.close(), sha256: fileHash.digest("hex") };
}

/** Definiciones de índice que el manifiesto guarda y la restauración recrea. */
function describeIndexes(indexes) {
  return indexes
    .filter((index) => index.name !== "_id_")
    .map((index) => ({
      name: index.name,
      key: index.key,
      unique: Boolean(index.unique),
      sparse: Boolean(index.sparse),
      expireAfterSeconds: index.expireAfterSeconds ?? null,
      partialFilterExpression: index.partialFilterExpression || null
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function jsonBackup(uri, targetDir) {
  const mongoose = await connectMongoose(uri);
  const manifest = {
    mode: "json",
    format: MANIFEST_FORMAT,
    createdAt: new Date().toISOString(),
    database: databaseNameFromUri(uri),
    source: redactUri(uri),
    schemaVersion: null,
    verification: VERIFICATION.NONE,
    collections: {}
  };
  try {
    manifest.schemaVersion = await schemaVersionOf(mongoose.connection.db);
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      const filePath = path.join(targetDir, `${collection.collectionName}.json`);
      const result = await dumpCollectionStreaming(collection, filePath);
      const indexes = await collection.listIndexes().toArray().catch(() => []);
      manifest.collections[collection.collectionName] = {
        count: result.count,
        sha256: result.sha256,
        contentSha256: result.contentSha256,
        bytes: fs.statSync(filePath).size,
        indexes: describeIndexes(indexes)
      };
      log(`  ${collection.collectionName}: ${result.count} documentos`);
    }
    fs.writeFileSync(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  } finally {
    await mongoose.disconnect();
  }
  return manifest;
}

/** ¿Este respaldo usa el formato delimitado por líneas? */
function isLineDelimited(manifest) {
  return !LEGACY_FORMATS.has(manifest?.format || "ejson-canonical-v1");
}

/**
 * Recorre un respaldo delimitado por líneas entregando documento a documento.
 * Nunca hay más de una línea en memoria.
 */
async function* readBackupStream(filePath) {
  const EJSON = ejson();
  const readline = require("node:readline");
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line) continue;
      yield { document: EJSON.parse(line, { relaxed: false }), canonical: line };
    }
  } finally {
    lines.close();
    input.destroy();
  }
}

/**
 * Lee un respaldo ANTIGUO (array completo) en memoria. Solo para formatos
 * `v1`; los nuevos se recorren con `readBackupStream`.
 */
function readLegacyBackupFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return ejson().parse(raw, { relaxed: false });
  } catch {
    return JSON.parse(raw);
  }
}

async function verifyJsonBackup(targetDir) {
  const manifestPath = path.join(targetDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail("El respaldo no tiene manifest.json: no verificable.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const lineDelimited = isLineDelimited(manifest);
  let total = 0;

  for (const [name, entry] of Object.entries(manifest.collections || {})) {
    const filePath = path.join(targetDir, `${name}.json`);
    if (!fs.existsSync(filePath)) fail(`Falta ${name}.json en el respaldo.`);
    if (sha256(filePath) !== entry.sha256) fail(`${name}.json no coincide con su checksum: respaldo corrupto.`);

    let count = 0;
    let contentSha256 = null;

    if (lineDelimited) {
      const digest = createContentDigest();
      for await (const { canonical } of readBackupStream(filePath)) {
        digest.add(canonical);
        count += 1;
      }
      contentSha256 = digest.close();
    } else {
      // Respaldo antiguo: el formato de array obliga a cargarlo entero.
      const documents = readLegacyBackupFile(filePath);
      if (!Array.isArray(documents)) fail(`${name}.json no contiene un array de documentos.`);
      count = documents.length;
      contentSha256 = legacyContentChecksum(documents);
    }

    if (count !== entry.count) {
      fail(`${name}.json tiene ${count} documentos, el manifiesto espera ${entry.count}.`);
    }
    if (entry.contentSha256 && contentSha256 !== entry.contentSha256) {
      fail(`${name}.json cambió de contenido respecto al manifiesto: respaldo corrupto.`);
    }
    total += count;
  }

  return { collections: Object.keys(manifest.collections || {}).length, documents: total };
}

/**
 * Pasa la URI a las herramientas nativas sin dejarla en la tabla de procesos.
 *
 * `--uri=` aparece entero en `ps`, y la URI de producción lleva usuario y
 * contraseña: cualquiera con acceso a la máquina las lee mientras dura el
 * volcado. mongodump y mongorestore aceptan `uri` dentro de `--config`, que
 * es un fichero YAML que se crea con permisos 0600 y se borra al terminar.
 */
function withUriConfig(uri, fn) {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "kronos-mongo-cfg-")),
    "config.yaml"
  );
  fs.writeFileSync(file, `uri: ${JSON.stringify(uri)}\n`, { mode: 0o600 });
  try {
    return fn(`--config=${file}`);
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
}

/**
 * Quita la base de datos de la URI conservando host, credenciales y opciones.
 *
 * mongorestore toma la base de la URI como destino fijo, y entonces entra en
 * conflicto con `--nsFrom/--nsTo`: el remapeo se ignora y la restauración
 * queda vacía o a medias. Con la URI sin base, el remapeo manda.
 */
function stripDatabase(uri) {
  const match = /^(mongodb(?:\+srv)?:\/\/[^/]+)\/([^?]*)(\?.*)?$/.exec(uri);
  if (!match) return uri;
  return `${match[1]}/${match[3] || ""}`;
}

async function mongodumpBackup(uri, targetDir) {
  const dump = withUriConfig(uri, (configFlag) => spawnSync("mongodump", [
    configFlag,
    `--archive=${path.join(targetDir, "dump.archive")}`,
    "--gzip"
  ], { encoding: "utf8" }));
  if (dump.error || dump.status !== 0) {
    log("  mongodump no disponible o falló; usando respaldo JSON verificable.");
    return null;
  }
  const mongoose = await connectMongoose(uri);
  const collections = {};
  let schemaVersion = null;
  try {
    schemaVersion = await schemaVersionOf(mongoose.connection.db);
    const EJSON = ejson();
    for (const collection of await mongoose.connection.db.collections()) {
      // El manifiesto de mongodump solo guardaba un número por colección, así
      // que tras restaurar no había nada con lo que comparar el contenido ni
      // los índices. Se recorre el cursor en streaming: memoria constante.
      const digest = createContentDigest();
      let count = 0;
      const cursor = collection.find({});
      try {
        for await (const document of cursor) {
          digest.add(EJSON.stringify(document, { relaxed: false }));
          count += 1;
        }
      } finally {
        await cursor.close().catch(() => {});
      }
      const indexes = await collection.listIndexes().toArray().catch(() => []);
      collections[collection.collectionName] = {
        count,
        contentSha256: digest.close(),
        indexes: describeIndexes(indexes)
      };
    }
  } finally {
    await mongoose.disconnect();
  }
  const manifest = {
    mode: "mongodump",
    format: MANIFEST_FORMAT,
    verification: VERIFICATION.NONE,
    createdAt: new Date().toISOString(),
    database: databaseNameFromUri(uri),
    source: redactUri(uri),
    schemaVersion,
    archive: "dump.archive",
    sha256: sha256(path.join(targetDir, "dump.archive")),
    bytes: fs.statSync(path.join(targetDir, "dump.archive")).size,
    collections
  };
  fs.writeFileSync(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function verifyMongodumpBackup(targetDir) {
  const manifestPath = path.join(targetDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail("El respaldo no tiene manifest.json: no verificable.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const archive = path.join(targetDir, manifest.archive || "dump.archive");
  if (!fs.existsSync(archive)) fail("Falta dump.archive en el respaldo.");
  if (manifest.bytes && fs.statSync(archive).size !== manifest.bytes) {
    fail("dump.archive cambió de tamaño respecto al manifiesto.");
  }
  if (sha256(archive) !== manifest.sha256) fail("dump.archive no coincide con su checksum: respaldo corrupto.");
  const entradas = Object.values(manifest.collections || {});
  const documentos = entradas.reduce((suma, entrada) => suma + (typeof entrada === "number" ? entrada : entrada.count || 0), 0);
  return { collections: Object.keys(manifest.collections || {}).length, documents: documentos };
}

/**
 * Sella el manifiesto con el NIVEL de verificación alcanzado.
 *
 * `verifiedAt` seguía existiendo como marca única y no distinguía entre
 * «los ficheros están intactos» y «los datos vuelven a entrar en Mongo». La
 * migración leía esa marca y daba por probado lo segundo. Ahora el nivel es
 * explícito y nunca baja: comprobar el checksum de un respaldo ya restaurado
 * no borra la prueba de restauración.
 */
function stampVerification(targetDir, result, level) {
  const manifestPath = path.join(targetDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const previo = VERIFICATION_RANK[manifest.verification] || 0;
  const nuevo = VERIFICATION_RANK[level] || 0;

  manifest.verification = nuevo >= previo ? level : manifest.verification;
  manifest.verifiedAt = new Date().toISOString();
  manifest.verifiedCollections = result.collections;
  manifest.verifiedDocuments = result.documents;

  if (level === VERIFICATION.CHECKSUM) manifest.checksumVerifiedAt = manifest.verifiedAt;
  if (level === VERIFICATION.RESTORE) {
    manifest.restoreVerifiedAt = manifest.verifiedAt;
    manifest.restoreTarget = result.targetDatabase || null;
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

/** Ruta legible: relativa dentro del repositorio, absoluta fuera de él. */
function displayPath(target) {
  const relative = path.relative(ROOT, target);
  return relative.startsWith("..") ? target : relative;
}

/**
 * `--out <directorio>` fija dónde se escribe el respaldo (volumen montado,
 * ruta de un runner, disco externo). Sin la bandera se usa `backups/` con
 * marca de tiempo, como hasta ahora.
 */
async function runBackup(options = {}) {
  const uri = loadUri();
  const requested = typeof options.out === "string" && options.out.trim() ? options.out.trim() : "";
  const targetDir = requested
    ? path.resolve(requested)
    : path.join(BACKUPS_ROOT, `kronos-backup-${timestamp()}`);

  if (fs.existsSync(path.join(targetDir, "manifest.json"))) {
    fail(`${displayPath(targetDir)} ya contiene un respaldo. Usa otro directorio para no mezclar dos copias.`);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  log(`Respaldo de ${databaseNameFromUri(uri)} → ${displayPath(targetDir)}`);
  const mongodumpManifest = await mongodumpBackup(uri, targetDir);
  let result;
  if (mongodumpManifest) {
    result = await verifyMongodumpBackup(targetDir);
    log(`Verificado (mongodump): ${result.collections} colecciones, ${result.documents} documentos.`);
  } else {
    await jsonBackup(uri, targetDir);
    result = await verifyJsonBackup(targetDir);
    log(`Verificado (ejson+sha256): ${result.collections} colecciones, ${result.documents} documentos.`);
  }
  stampVerification(targetDir, result, VERIFICATION.CHECKSUM);
  log(`OK: ${displayPath(targetDir)} · estado ${VERIFICATION.CHECKSUM}`);
  log("   Crear el respaldo NO demuestra que se pueda restaurar. Para migrar hace");
  log("   falta --restore contra una base de ensayo, que sella RESTORE_VERIFIED.");
}

async function runCheck(targetDir) {
  if (!targetDir) fail("Uso: node scripts/backup-verify.js --check <directorio>");
  const absolute = path.resolve(targetDir);
  if (!fs.existsSync(absolute)) fail(`No existe ${absolute}`);
  const manifestPath = path.join(absolute, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail("El respaldo no tiene manifest.json: no verificable.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  // Elegir por contrato, no por excepción: los verificadores terminan con
  // fail() ante corrupción. Intentar primero mongodump hacía imposible
  // comprobar JSON y un fallback podría ocultar un respaldo corrupto.
  let result;
  if (manifest.mode === "mongodump") result = await verifyMongodumpBackup(absolute);
  else if (manifest.mode === "json") result = await verifyJsonBackup(absolute);
  else fail("Modo de respaldo no soportado. Se requiere json o mongodump.");
  stampVerification(absolute, result, VERIFICATION.CHECKSUM);
  log(`OK: respaldo verificado (${result.collections} colecciones, ${result.documents} documentos).`);
  log(`   Estado: ${VERIFICATION.CHECKSUM}. Comprueba ficheros y checksums, no restaurabilidad.`);
}

/**
 * Restauración probada sobre una base AISLADA.
 *
 * Reglas duras:
 *   - Exige MONGODB_TARGET_URI y --target-db kronos_restore; nunca deriva el
 *     destino de MONGODB_URI ni pone credenciales en argv.
 *   - El origen debe ser kronos-space-com y el destino nunca puede coincidir.
 *     No existe bandera de bypass.
 *   - Tras conectar confirma el nombre real y exige cero colecciones ANTES de
 *     cualquier escritura. Nunca ejecuta dropDatabase ni deleteMany.
 *   - Al terminar compara conteos, checksums de contenido e índices exactos:
 *     si no cuadran, la restauración NO se declara correcta.
 */
/** Forma común para comparar índices vengan de donde vengan. */
function normalizeIndexList(list) {
  return (list || [])
    .filter((index) => index && index.name !== "_id_")
    .map((index) => ({
      name: index.name,
      key: index.key,
      unique: Boolean(index.unique),
      sparse: Boolean(index.sparse),
      expireAfterSeconds: index.expireAfterSeconds ?? null,
      partialFilterExpression: index.partialFilterExpression || null
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Recrea los índices que el manifiesto declara y comprueba que quedaron.
 *
 * La restauración solo metía documentos: el manifiesto guardaba las
 * definiciones de índice y nadie las aplicaba, así que la copia «restaurada»
 * quedaba sin una sola restricción —ni las 14 únicas— y sin los TTL. Una base
 * así no sirve ni para ensayar la migración ni para recuperarse de verdad.
 */
async function restoreIndexes(collection, esperados) {
  const objetivo = normalizeIndexList(esperados);
  for (const index of objetivo) {
    const options = { name: index.name };
    if (index.unique) options.unique = true;
    if (index.sparse) options.sparse = true;
    if (index.expireAfterSeconds !== null) options.expireAfterSeconds = index.expireAfterSeconds;
    if (index.partialFilterExpression) options.partialFilterExpression = index.partialFilterExpression;
    await collection.createIndex(index.key, options);
  }
  const vivos = normalizeIndexList(await collection.listIndexes().toArray().catch(() => []));
  return { esperados: objetivo, vivos };
}

function compararIndices(esperados, vivos) {
  const porNombre = new Map(vivos.map((index) => [index.name, index]));
  const nombresEsperados = new Set(esperados.map((index) => index.name));
  const faltan = esperados.filter((index) => !porNombre.has(index.name)).map((index) => index.name);
  const distintos = esperados
    .filter((index) => porNombre.has(index.name))
    .filter((index) => JSON.stringify(index) !== JSON.stringify(porNombre.get(index.name)))
    .map((index) => index.name);
  const extras = vivos.filter((index) => !nombresEsperados.has(index.name)).map((index) => index.name);
  return {
    faltan,
    distintos,
    extras,
    ok: faltan.length === 0 && distintos.length === 0 && extras.length === 0
  };
}

/** Inserta un respaldo delimitado por líneas por lotes, sin cargarlo entero. */
async function insertStreaming(collection, filePath, loteMaximo = 500) {
  let lote = [];
  let insertados = 0;
  const vaciar = async () => {
    if (!lote.length) return;
    await collection.insertMany(lote, { ordered: false });
    insertados += lote.length;
    lote = [];
  };
  for await (const { document } of readBackupStream(filePath)) {
    lote.push(document);
    if (lote.length >= loteMaximo) await vaciar();
  }
  await vaciar();
  return insertados;
}

/** Restauración nativa de un archivo de mongodump sobre la base de ensayo. */
function mongorestoreArchive(archivePath, targetUri, sourceDatabase, targetDatabase) {
  // Sin base en la URI: si la lleva, mongorestore la impone como destino y
  // anula el remapeo de espacios de nombres. El target ya fue demostrado
  // vacío, por lo que --drop no es necesario ni está permitido.
  const result = withUriConfig(stripDatabase(targetUri), (configFlag) => {
    const args = [
      configFlag,
      `--archive=${archivePath}`,
      "--gzip",
      `--nsFrom=${sourceDatabase}.*`,
      `--nsTo=${targetDatabase}.*`
    ];
    return spawnSync("mongorestore", args, { encoding: "utf8" });
  });
  if (result.error || result.status !== 0) {
    const detalle = redactUri(`${result.stderr || ""}${result.error?.message || ""}`.trim().split("\n").slice(-3).join(" | "));
    fail(
      "mongorestore no disponible o falló, así que la restauración NO queda demostrada. " +
      `Instala mongodb-database-tools en el equipo que restaura. Detalle: ${detalle || "sin salida"}`
    );
  }
}

/**
 * Restauración probada sobre una base AISLADA.
 *
 * Único camino que sella RESTORE_VERIFIED. Comprueba recuentos, contenido e
 * índices contra el manifiesto; cualquier diferencia deja el respaldo sin
 * sellar y la migración lo rechazará.
 */
async function runRestore(targetDir, options = {}) {
  if (!targetDir) {
    fail(
      `Uso: ${TARGET_URI_ENV}=<uri-target> node scripts/backup-verify.js ` +
      `--restore <directorio> --target-db ${AUTHORIZED_RESTORE_TARGET}`
    );
  }
  const absolute = path.resolve(targetDir);
  const manifestPath = path.join(absolute, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail("El respaldo no tiene manifest.json: no restaurable.");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.mode !== "json" && manifest.mode !== "mongodump") {
    fail("Modo de respaldo no soportado. Se requiere json o mongodump.");
  }
  if (manifest.format !== MANIFEST_FORMAT) {
    fail(`Formato no autorizado para este restore: se exige ${MANIFEST_FORMAT}.`);
  }

  // Toda la validación del manifiesto ocurre antes de abrir una conexión.
  const manifestTotals = validateProductionManifest(manifest);
  if (options.targetUri) {
    fail(`--target-uri no está permitido: usa ${TARGET_URI_ENV} para que la credencial no viaje en argv.`);
  }
  if (options.forceSameTarget) {
    fail("--force-same-target no existe: origen y destino iguales están prohibidos sin excepción.");
  }
  if (options.dropTargetCollections) {
    fail("--drop-target-collections no está permitido: el target debe estar vacío.");
  }

  const sourceDatabase = manifest.database;
  const targetUri = process.env[TARGET_URI_ENV];
  const targetDatabase = validateRestoreTarget({
    sourceDatabase,
    requestedTarget: options.targetDb,
    targetUri,
    sourceUri: options.sourceUri
  });

  // Verifica el payload completo antes de conectar al target. Esta llamada es
  // de solo lectura: no usa stampVerification ni modifica manifest.json.
  const payloadTotals = manifest.mode === "json"
    ? await verifyJsonBackup(absolute)
    : await verifyMongodumpBackup(absolute);
  if (
    payloadTotals.collections !== manifestTotals.collections
    || payloadTotals.documents !== manifestTotals.documents
  ) {
    fail(
      `Los totales verificados del payload (${payloadTotals.collections} colecciones, ` +
      `${payloadTotals.documents} documentos) no coinciden con el manifiesto ` +
      `(${manifestTotals.collections}, ${manifestTotals.documents}).`
    );
  }

  const lineDelimited = isLineDelimited(manifest);
  const restored = [];
  const problems = [];
  const mongoose = await connectMongoose(targetUri);

  try {
    const db = mongoose.connection.db;

    // Guardas posteriores a conectar y anteriores a TODA escritura. Ni
    // db.collection(), ni mongorestore, ni createIndex se alcanzan antes.
    assertConnectedTarget(db.databaseName, targetDatabase);
    const existingCollections = await db.listCollections({}, { nameOnly: true }).toArray();
    assertEmptyTarget(existingCollections);

    if (manifest.mode === "mongodump") {
      const archivePath = path.join(absolute, manifest.archive || "dump.archive");
      log(`Restaurando archivo de mongodump en ${targetDatabase}…`);
      mongorestoreArchive(archivePath, targetUri, sourceDatabase, targetDatabase);
    }

    for (const [name, entry] of Object.entries(manifest.collections || {})) {
      const esperado = typeof entry === "number" ? { count: entry, indexes: [] } : entry;
      const collection = db.collection(name);

      if (manifest.mode === "json") {
        const filePath = path.join(absolute, `${name}.json`);
        // El payload completo ya pasó verifyJsonBackup antes de conectar. Se
        // conserva la comprobación local para que este punto nunca dependa de
        // una precondición distante si se refactoriza en el futuro.
        if (!fs.existsSync(filePath)) fail(`Falta ${name}.json en el respaldo.`);
        if (sha256(filePath) !== esperado.sha256) fail(`${name}.json no coincide con su checksum: respaldo corrupto.`);

        if (lineDelimited) {
          await insertStreaming(collection, filePath);
        } else {
          const documents = readLegacyBackupFile(filePath);
          if (documents.length) await collection.insertMany(documents, { ordered: false });
        }
      }

      // Los índices se recrean desde el manifiesto en los dos modos.
      // Confiar en que mongorestore los traiga deja la copia a merced de cómo
      // remapee la herramienta; aplicarlos siempre garantiza las restricciones
      // únicas y TTL que declara el manifiesto.
      const indices = await restoreIndexes(collection, esperado.indexes);
      const comparacion = compararIndices(indices.esperados, indices.vivos);

      const count = await collection.countDocuments({});
      let checksum = null;
      if (esperado.contentSha256) {
        const digest = createContentDigest();
        const EJSON = ejson();
        const cursor = collection.find({});
        try {
          for await (const document of cursor) digest.add(EJSON.stringify(document, { relaxed: false }));
        } finally {
          await cursor.close().catch(() => {});
        }
        checksum = digest.close();
      }

      const countOk = count === esperado.count;
      const checksumOk = !esperado.contentSha256 || checksum === esperado.contentSha256;

      if (!countOk) problems.push(`${name}: ${count} documentos restaurados, el manifiesto espera ${esperado.count}`);
      if (!checksumOk) problems.push(`${name}: el contenido restaurado no coincide con el checksum del respaldo`);
      if (!comparacion.ok) {
        problems.push(
          `${name}: índices sin restaurar [${comparacion.faltan.join(", ") || "-"}] · ` +
          `con definición distinta [${comparacion.distintos.join(", ") || "-"}] · ` +
          `extra [${comparacion.extras.join(", ") || "-"}]`
        );
      }

      restored.push({
        collection: name,
        sourceDocuments: esperado.count,
        documents: count,
        difference: count - esperado.count,
        countOk,
        checksumOk,
        sourceIndexes: indices.esperados.length,
        indexes: indices.vivos.length,
        indexesOk: comparacion.ok,
        indexDifferences: {
          missing: comparacion.faltan,
          different: comparacion.distintos,
          extra: comparacion.extras
        },
        explanation: countOk && checksumOk && comparacion.ok
          ? "recuento, contenido e índices coinciden con el manifiesto"
          : [
            countOk ? null : `faltan o sobran ${Math.abs(count - esperado.count)} documentos`,
            checksumOk ? null : "el contenido difiere",
            comparacion.ok ? null : "los índices no coinciden"
          ].filter(Boolean).join("; ")
      });

      log(`  ${name}: ${count} documentos · ${indices.vivos.length}/${indices.esperados.length} índices (${countOk && checksumOk && comparacion.ok ? "coincide" : "DIFERENCIA"})`);
    }
  } finally {
    await mongoose.disconnect();
  }

  const total = restored.reduce((sum, item) => sum + item.documents, 0);
  const totalSource = restored.reduce((sum, item) => sum + item.sourceDocuments, 0);
  const totalIndexes = restored.reduce((sum, item) => sum + item.indexes, 0);

  if (restored.length !== manifestTotals.collections) {
    problems.push(
      `se procesaron ${restored.length} colecciones y el manifiesto exige ${manifestTotals.collections}`
    );
  }
  if (totalSource !== manifestTotals.documents || total !== manifestTotals.documents) {
    problems.push(
      `total de documentos inválido: origen detallado ${totalSource}, restaurado ${total}, ` +
      `manifiesto ${manifestTotals.documents}`
    );
  }
  if (problems.length) fail(`Restauración NO verificada:\n  - ${problems.join("\n  - ")}`);

  const headers = ["Colección", "Origen", "Restaurado", "Índices", "Diferencia", "Resultado"];
  const rows = restored.map((item) => [
    item.collection,
    String(item.sourceDocuments),
    String(item.documents),
    `${item.indexes}/${item.sourceIndexes}`,
    String(item.difference),
    item.countOk && item.checksumOk && item.indexesOk ? "IDÉNTICA" : "DIFERENCIA"
  ]);
  rows.push(["TOTAL", String(totalSource), String(total), String(totalIndexes), String(total - totalSource), "IDÉNTICO"]);

  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column].length))
  );
  const renderRow = (cells) => `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(" | ")} |`;

  log("");
  log(`Comparación ${sourceDatabase} → ${targetDatabase}`);
  log(renderRow(headers));
  log(`|${widths.map((width) => "-".repeat(width + 2)).join("|")}|`);
  rows.forEach((row) => log(renderRow(row)));

  const proofPath = path.join(absolute, "restore-proof.json");
  fs.writeFileSync(
    proofPath,
    JSON.stringify(
      {
        restoredAt: new Date().toISOString(),
        mode: manifest.mode,
        verification: VERIFICATION.RESTORE,
        sourceDatabase,
        targetDatabase,
        collections: restored,
        totalSourceDocuments: totalSource,
        totalDocuments: total,
        totalIndexes,
        totalDifference: total - totalSource
      },
      null,
      2
    )
  );

  stampVerification(absolute, {
    collections: restored.length,
    documents: total,
    targetDatabase
  }, VERIFICATION.RESTORE);

  log(`OK: restauración verificada en ${targetDatabase} (${restored.length} colecciones, ${total} documentos, ${totalIndexes} índices).`);
  log(`Estado del respaldo: ${VERIFICATION.RESTORE}. Prueba guardada en ${path.relative(ROOT, proofPath)}`);
}

function parseOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    options[key] = next && !next.startsWith("--") ? next : true;
  }
  return options;
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseOptions(argv);

  const checkIndex = argv.indexOf("--check");
  if (checkIndex !== -1) {
    await runCheck(argv[checkIndex + 1]);
    return;
  }

  const restoreIndex = argv.indexOf("--restore");
  if (restoreIndex !== -1) {
    // La URI de origen solo permite comprobar que el principal de destino es
    // distinto. runRestore no abre una conexión al origen.
    await runRestore(argv[restoreIndex + 1], { ...options, sourceUri: process.env.MONGODB_URI || null });
    return;
  }

  await runBackup(options);
}

// Ejecutable como herramienta y cargable como módulo: las funciones puras
// (niveles de verificación, digest de contenido, comparación de índices,
// lectura en streaming) se prueban sin necesidad de un MongoDB real.
if (require.main === module) {
  main().catch((error) => fail(error?.message || error));
}

module.exports = {
  MANIFEST_FORMAT,
  LEGACY_FORMATS,
  PRODUCTION_DATABASE,
  AUTHORIZED_RESTORE_TARGET,
  TARGET_URI_ENV,
  VERIFICATION,
  VERIFICATION_RANK,
  databaseNameFromUri,
  validateManifestInvariants,
  validateProductionManifest,
  validateCredentialSeparation,
  validateRestoreTarget,
  assertConnectedTarget,
  assertEmptyTarget,
  createContentDigest,
  legacyContentChecksum,
  describeIndexes,
  normalizeIndexList,
  compararIndices,
  isLineDelimited,
  readBackupStream,
  readLegacyBackupFile,
  stampVerification,
  stripDatabase
};

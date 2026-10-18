const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { assertE2ETarget } = require("./e2e-target-guard");

const E2E_DATABASE = "test";
const PROTECTED_DATABASES = new Set([
  "kronos-space-com",
  "kronos_restore",
  "kronos_social_ai"
]);

function makeRunId() {
  return (
    process.env.KRONOS_E2E_RUN_ID?.trim() ||
    `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`
  );
}

const e2eRunId = makeRunId();
let state = null;

/**
 * DIAGNÓSTICO POR ETAPAS (instrumentación, 2026-10-18).
 *
 * El 2026-10-18 el job `atlas` del E2E se cortó a los 25 minutos sin llegar a
 * un veredicto, contra un MongoDB local que hace lo mismo en 1m46s. Sin saber
 * en qué etapa se va el tiempo (conexión, snapshot, limpieza o pruebas) no hay
 * forma de distinguir "el clúster va lento" de "nuestra limpieza se degrada
 * porque la base `test` acumula documentos".
 *
 * Cada archivo E2E escribe una línea JSON por etapa en `KRONOS_E2E_DIAG_FILE`,
 * y el workflow las publica como anotaciones del run (donde sí se leen cuando
 * el log crudo vive en un almacén al que no se llega desde la API).
 *
 * La medición del 2026-10-18 mostró que ~10 de los 21 minutos de Atlas eran
 * esta limpieza recorriendo las 82 colecciones de la base compartida `test`.
 * Desde entonces el snapshot y el borrado se limitan a las colecciones de la
 * app, no se vuelve a fotografiar al final, y se omite la ronda si no hubo
 * escrituras. Los documentos que ya estaban siguen protegidos.
 */
const DIAG_FILE = process.env.KRONOS_E2E_DIAG_FILE?.trim() || null;

function diag(event, extra = {}) {
  if (!DIAG_FILE) return;
  const archivo = path.basename(process.argv[1] || "desconocido");
  const registro = {
    evento: event,
    archivo,
    runId: e2eRunId,
    ts: new Date().toISOString(),
    ...extra
  };
  try {
    fs.appendFileSync(DIAG_FILE, `${JSON.stringify(registro)}\n`);
  } catch {
    // El diagnóstico nunca debe romper la suite: si el disco falla, se sigue.
  }
}

function uriForE2E() {
  const uri = process.env.KRONOS_E2E_MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("E2E_TARGET_BLOCKED: falta KRONOS_E2E_MONGODB_URI");
  }
  return uri;
}

/**
 * `listCollections` es la primera llamada que un usuario sin rol sobre la base
 * no puede hacer, y el error que devuelve el driver no dice qué hacer. Aquí se
 * traduce a una instrucción concreta: en Atlas, el usuario E2E necesita el rol
 * readWrite sobre `test`. No se amplían privilegios ni se improvisa una
 * limpieza alternativa: sin poder enumerar, no se puede garantizar que sólo se
 * borre lo creado por esta ejecución, así que la suite se detiene.
 */
function esFaltaDePermisoParaListar(error) {
  const mensaje = String(error?.message || "");
  return (
    error?.code === 8000 ||
    /not allowed to do action \[listCollections\]/.test(mensaje) ||
    /unauthorized/i.test(String(error?.codeName || ""))
  );
}

async function listarColecciones(db) {
  try {
    return await db.collections();
  } catch (error) {
    if (esFaltaDePermisoParaListar(error)) {
      throw new Error(
        "E2E_ATLAS_SIN_PERMISO: el usuario de KRONOS_E2E_MONGODB_URI no puede enumerar " +
          'las colecciones de la base "test". El E2E necesita ese permiso para saber qué ' +
          "documentos ya existían y borrar únicamente los de esta ejecución. " +
          "En MongoDB Atlas: Database Access → usuario E2E → Edit → Add Built-in Role → " +
          'readWrite sobre la base "test". Si el rol ya existe, revisa que el usuario ' +
          "apunte a ese usuario y no a otro. " +
          `Detalle del servidor: ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Colecciones que la app escribe de verdad: los modelos de mongoose y el
 * bucket GridFS. La base compartida `test` acumula decenas de colecciones
 * ajenas; fotografiarlas y borrarlas en cada ronda es lo que llevó el job
 * de Atlas de ~3 min a 21 min (82 find + 82 deleteMany por la red).
 */
const COLECCIONES_FIJAS = ["kronosUploads.files", "kronosUploads.chunks"];

const COMANDOS_LECTURA = new Set([
  "find",
  "aggregate",
  "count",
  "distinct",
  "listCollections",
  "listIndexes",
  "listDatabases",
  "ping",
  "hello",
  "ismaster",
  "isMaster",
  "saslStart",
  "saslContinue",
  "endSessions",
  "getMore",
  "killCursors",
  "explain",
  "collStats",
  "dbStats",
  "serverStatus",
  "whatsmyuri",
  "buildInfo",
  "getParameter",
  "hostInfo",
  "connectionStatus",
  "getCmdLineOpts",
  "atlasVersion",
  "replSetGetStatus"
]);

function nombresVigilados() {
  const nombres = new Set(COLECCIONES_FIJAS);
  for (const model of Object.values(mongoose.models)) {
    if (model.collection?.name) nombres.add(model.collection.name);
  }
  return nombres;
}

function marcarSiEscribe(event) {
  if (!state || state.limpiando) return;
  const comando = event?.commandName;
  if (!comando || COMANDOS_LECTURA.has(comando)) return;
  state.limpio = false;
}

function vigilarEscrituras(connection) {
  if (connection.__kronosE2EWriteWatch) return;
  connection.__kronosE2EWriteWatch = true;
  connection.on("commandStarted", (event) => {
    if (state) state.vioComandos = true;
    marcarSiEscribe(event);
  });
}

async function snapshotDatabase(db) {
  const collections = await listarColecciones(db);
  const vigiladas = nombresVigilados();
  const baseline = new Map();
  const nombresExistentes = new Set();
  let fotografiadas = 0;
  for (const collection of collections) {
    const nombre = collection.collectionName;
    nombresExistentes.add(nombre);
    if (!vigiladas.has(nombre)) continue;
    const ids = await collection.find({}, { projection: { _id: 1 } }).toArray();
    baseline.set(nombre, ids.map(({ _id }) => _id));
    fotografiadas += 1;
  }
  for (const nombre of vigiladas) {
    if (!baseline.has(nombre)) baseline.set(nombre, []);
  }
  return {
    baseline,
    nombresExistentes,
    existentes: collections.length,
    fotografiadas
  };
}

async function connectE2E() {
  if (state) return state;

  const uri = uriForE2E();
  const allowed = assertE2ETarget({
    uri,
    dbName: E2E_DATABASE,
    env: {
      ...process.env,
      MONGODB_URI: uri
    }
  });
  if (!allowed) {
    throw new Error("E2E_TARGET_BLOCKED: el destino E2E no fue demostrado");
  }

  const t_conectar = Date.now();
  const connection = await mongoose.connect(uri, {
    dbName: E2E_DATABASE,
    serverSelectionTimeoutMS: 15000,
    monitorCommands: true
  });
  diag("conexion", { ms: Date.now() - t_conectar });

  const databaseName = connection.connection.db.databaseName;
  if (PROTECTED_DATABASES.has(databaseName) || databaseName !== E2E_DATABASE) {
    await mongoose.disconnect().catch(() => {});
    throw new Error(
      `E2E_TARGET_BLOCKED: la base efectiva "${databaseName}" no es exactamente "${E2E_DATABASE}"`
    );
  }

  const t_snapshot = Date.now();
  const foto = await snapshotDatabase(connection.connection.db);
  const documentosBase = [...foto.baseline.values()].reduce(
    (suma, ids) => suma + ids.length,
    0
  );
  diag("snapshot", {
    ms: Date.now() - t_snapshot,
    colecciones: foto.fotografiadas,
    existentes: foto.existentes,
    vigiladas: foto.baseline.size,
    documentosBase
  });

  state = {
    connection: connection.connection,
    db: connection.connection.db,
    baseline: foto.baseline,
    nombresExistentes: foto.nombresExistentes,
    runId: e2eRunId,
    limpio: true,
    limpiando: false,
    vioComandos: false,
    vigilaEscrituras: false
  };
  vigilarEscrituras(connection.connection);
  state.vigilaEscrituras = true;
  // Prueba de que el monitor está vivo. Sin un comando observado no se
  // omite ninguna limpieza: ante la duda, se limpia.
  await connection.connection.db.command({ ping: 1 });
  return state;
}

/**
 * El snapshot constituye el registro de IDs que no pertenecían a esta
 * ejecución. Al finalizar solo se eliminan los IDs nuevos; nunca se usa una
 * limpieza global. Esto también cubre documentos secundarios creados por las
 * rutas de la aplicación en colecciones conocidas.
 */
async function clearNewDocuments() {
  if (!state) return;
  // El `before` de cada archivo llama aquí justo después del snapshot, y el
  // `after` del archivo anterior ya dejó la base limpia. Si el monitor no ha
  // visto escrituras, esa ronda no borra nada y solo paga la latencia de
  // Atlas. No se omite si el monitor no llegó a demostrar que funciona.
  if (state.vigilaEscrituras && state.vioComandos && state.limpio) {
    diag("limpieza", {
      omitida: true,
      ms: 0,
      msReSnapshot: 0,
      colecciones: state.baseline.size,
      borrados: 0
    });
    return;
  }
  const t_limpieza = Date.now();
  state.limpiando = true;
  let borrados = 0;
  let dropeadas = 0;
  const vigiladas = nombresVigilados();
  try {
    const currentCollections = await listarColecciones(state.db);
    for (const collection of currentCollections) {
      const nombre = collection.collectionName;
      const baselineIds = state.baseline.get(nombre);
      const esNueva = !state.nombresExistentes.has(nombre);
      // Colección creada por esta ejecución y que no es de la app
      // (escenarios de índices únicos): se elimina entera. Las que ya
      // existían y no son de la app no se tocan.
      if (baselineIds === undefined && esNueva && !vigiladas.has(nombre)) {
        await state.db.dropCollection(nombre).catch(() => {});
        dropeadas += 1;
        continue;
      }
      if (baselineIds === undefined) continue;
      const resultado = await collection.deleteMany({ _id: { $nin: baselineIds } });
      borrados += resultado?.deletedCount || 0;
    }
  } finally {
    state.limpiando = false;
  }
  // Solo si la ronda terminó. Si lanzó, la siguiente no debe creer que
  // la base ya quedó limpia.
  if (state.vigilaEscrituras) state.limpio = true;
  diag("limpieza", {
    omitida: false,
    ms: Date.now() - t_limpieza,
    msReSnapshot: 0,
    colecciones: state.baseline.size,
    borrados,
    dropeadas
  });
}

async function cleanupE2E() {
  if (!state) return;
  await clearNewDocuments();
  await mongoose.disconnect();
  state = null;
}

function assertE2EDatabaseName(name) {
  if (String(name) !== E2E_DATABASE || PROTECTED_DATABASES.has(String(name))) {
    throw new Error(
      `E2E_TARGET_BLOCKED: la base E2E debe ser "${E2E_DATABASE}" y nunca una base protegida`
    );
  }
  return true;
}

module.exports = {
  E2E_DATABASE,
  PROTECTED_DATABASES,
  e2eRunId,
  connectE2E,
  cleanupE2E,
  clearNewDocuments,
  assertE2EDatabaseName
};

/**
 * KRONOS — arranque común de las herramientas de base de datos.
 *
 * Responsabilidades:
 *   - Cargar `server/.env` sin depender de que dotenv esté instalado.
 *   - Resolver módulos del workspace del servidor desde la raíz.
 *   - Conectar a MongoDB con una URI REAL (nunca una base simulada).
 *   - No imprimir jamás credenciales: la URI se muestra redactada.
 *   - Salir con códigos estables para que CI pueda decidir.
 *
 * Códigos de salida:
 *   0 correcto · 1 fallo de ejecución · 2 uso incorrecto · 3 falta configuración
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");

const EXIT = {
  OK: 0,
  FAILURE: 1,
  USAGE: 2,
  NOT_CONFIGURED: 3
};

/** Carga un módulo instalado en la raíz o en el workspace del servidor. */
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

  throw new Error(`No se pudo cargar "${name}". Ejecuta npm ci antes de usar las herramientas de base de datos.`);
}

/** Parser mínimo de .env: solo define lo que aún no está en el entorno. */
function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

function loadEnvironment() {
  // Las pruebas de contrato necesitan medir el caso "sin configuración"
  // incluso en una máquina con server/.env real.
  if (process.env.KRONOS_IGNORE_ENV_FILE === "1") return;

  const envPath = path.join(ROOT, "server", ".env");
  try {
    requireServerModule("dotenv").config({ path: envPath, quiet: true });
  } catch {
    loadEnvFile(envPath);
  }
}

/**
 * URI sin credenciales, apta para logs e informes.
 * mongodb+srv://user:pass@cluster/base → mongodb+srv://***@cluster/base
 */
function redactUri(uri) {
  return String(uri || "").replace(/\/\/[^@/]+@/, "//***@");
}

function databaseNameFromUri(uri) {
  const match = /\/\/[^/]+\/([^?]+)/.exec(String(uri || ""));
  return match ? decodeURIComponent(match[1]) : "";
}

/** Devuelve la URI configurada o termina el proceso con código 3. */
function requireUri() {
  loadEnvironment();
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    process.stderr.write(
      "CONFIG_FALTANTE: define MONGODB_URI (server/.env o variable de entorno).\n" +
      "Estas herramientas trabajan contra MongoDB real: no existe modo simulado.\n"
    );
    process.exit(EXIT.NOT_CONFIGURED);
  }

  return uri;
}

/**
 * Conecta a MongoDB y devuelve `{ mongoose, connection, db, close }`.
 * Todas las herramientas usan esta función: una sola forma de conectar.
 */
async function connect({ uri = requireUri(), timeoutMs } = {}) {
  const mongoose = requireServerModule("mongoose");
  const serverSelectionTimeoutMS = Number(
    timeoutMs || process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 15000
  );

  await mongoose.connect(uri, { serverSelectionTimeoutMS });

  return {
    mongoose,
    connection: mongoose.connection,
    db: mongoose.connection.db,
    uri,
    redactedUri: redactUri(uri),
    async close() {
      await mongoose.disconnect();
    }
  };
}

/** Lectura de banderas de línea de comandos, sin dependencias. */
function parseArgs(argv = process.argv.slice(2)) {
  const flags = {};
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=");
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];

    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
    } else if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }

  return { flags, positional };
}

/** Escribe un informe JSON reproducible y devuelve su ruta. */
function writeReport(name, payload) {
  const directory = path.join(ROOT, "docs", "db", "reports");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, name);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return path.relative(ROOT, file);
}

/** Ejecuta una herramienta cerrando siempre la conexión y fijando el código. */
async function run(main) {
  let context = null;

  try {
    context = await connect();
    const code = (await main(context)) ?? EXIT.OK;
    await context.close();
    process.exit(code);
  } catch (error) {
    if (context) await context.close().catch(() => {});
    const message = error?.message || String(error);
    process.stderr.write(`ERROR: ${redactUri(message)}\n`);
    process.exit(EXIT.FAILURE);
  }
}

module.exports = {
  ROOT,
  EXIT,
  requireServerModule,
  loadEnvironment,
  redactUri,
  databaseNameFromUri,
  requireUri,
  connect,
  parseArgs,
  writeReport,
  run
};

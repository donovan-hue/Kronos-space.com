require("dotenv").config();

if (!process.env.JWT_SECRET) {
  console.error("STARTUP_ERROR: JWT_SECRET no configurado");
  process.exit(1);
}

const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const { resolveAutoIndex, isProductionEnv } = require("./config/db");
const { isKnownNonProductionEnvironment, normalizeEnvironment } = require("./config/environment");
const { getBuildInfo } = require("./config/buildInfo");
const { isProductionProcessEnv } = require("./config/environment");
const { ensureMessageIndexes } = require("./modules/messages/message-indexes");
const capsuleRoutes = require("./modules/capsules/capsules.routes");
const { getFeatureFlags } = require("./config/featureFlags");
const { requestContext } = require("./middleware/requestContext");
const inputSanitizer = require("./middleware/inputSanitizer");
const { serveDurableUpload } = require("./config/durableUploads");
const { mediaAcl } = require("./middleware/mediaAcl");
const { registerRoutes } = require("./http/registerRoutes");
const { restoreApiPrefix } = require("./http/restoreApiPrefix");
const { notFound, errorHandler } = require("./http/errorHandlers");
const { registerSocketHandlers } = require("./realtime/registerSocketHandlers");
const app = express();
const server = http.createServer(app);

// Las cápsulas del tiempo se abren en startServer(), no aquí. Estar en el
// ámbito del módulo tenía dos efectos: el callback referencia `io`, que se
// declara después (funcionaba solo porque el intervalo tarda 60 s
// en dispararse, no por ninguna garantía), y cualquier `require("./server")`
// arrancaba un temporizador que a los 60 s lanza trabajo contra la base — lo
// hacen ~90 archivos de pruebas. Ver `capsuleTimer` en startServer.

const PORT = process.env.PORT || 5000;

// Render y otros proxies deben declararse explícitamente para que req.ip y
// rate limiting no confíen en cabeceras reenviadas sin autorización.
if (process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

app.locals.requestMetrics = {
  total: 0,
  byStatus: {},
  startedAt: new Date().toISOString(),
  lastRequestAt: null
};

function normalizeOrigin(origin) {
  return String(origin || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/[/.]+$/, "");
}

/**
 * Aviso de configuración del proxy inverso, como función pura para poder
 * comprobarla sin arrancar el proceso.
 *
 * `trust proxy` solo se activa con TRUST_PROXY=1|true. Detrás de Render o
 * Vercel, sin él, `req.ip` es la dirección del proxy y no la del visitante:
 * los tres limitadores (300 API / 60 acciones / 20 credenciales por 15 minutos)
 * pasan a repartirse entre TODOS los usuarios en un solo cubo, y la plataforma
 * entera cae en 429 en cuanto hay algo de tráfico. Es una mala configuración
 * silenciosa —no falla nada, simplemente deja de proteger y empieza a bloquear
 * a quien no debe—, así que se avisa al arrancar igual que CAPSULE_SECRET.
 *
 * Devuelve `null` cuando no hay nada que avisar.
 */
function trustProxyWarning(env = process.env) {
  const valor = String(env.TRUST_PROXY || "").trim().toLowerCase();
  const activo = valor === "1" || valor === "true";

  if (activo || !isProductionProcessEnv()) return null;

  return (
    "CONFIG_WARNING: TRUST_PROXY no activado en producción — req.ip es la IP del proxy y los " +
    "rate limits (300 API / 60 acciones / 20 credenciales por 15 min) se reparten entre todos " +
    "los usuarios en un solo cubo. Detrás de Render o Vercel debe valer TRUST_PROXY=1."
  );
}

function parseAllowedOrigins(rawValue = process.env.CLIENT_URL || "http://localhost:3000") {
  return String(rawValue || "")
    .split(/[,;\s]+/)
    .map(normalizeOrigin)
    .filter(Boolean);
}

const allowedOrigins = parseAllowedOrigins();

const KRONOS_VERCEL_ORIGIN_PATTERN =
  /^https:\/\/(?:kronos-space-com|kronos-social-ai-client|kronos-space(?:com)?-[a-z0-9-]+-oficialkronosspace-1215)\.vercel\.app$/;

function isAllowedCorsOrigin(origin, configuredOrigins = allowedOrigins, env = process.env) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (configuredOrigins.includes(normalized)) return true;
  if (
    (normalized === "https://www.kronos-space.com" && configuredOrigins.includes("https://kronos-space.com")) ||
    (normalized === "https://kronos-space.com" && configuredOrigins.includes("https://www.kronos-space.com"))
  ) {
    return true;
  }
  if (String(env.ALLOW_VERCEL_PREVIEWS || "").trim().toLowerCase() === "false") {
    return false;
  }
  return (
    (configuredOrigins.includes("https://kronos-space.com") ||
      configuredOrigins.includes("https://www.kronos-space.com")) &&
    KRONOS_VERCEL_ORIGIN_PATTERN.test(normalized)
  );
}

function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  return callback(null, isAllowedCorsOrigin(origin));
}

app.disable("x-powered-by");
app.use(requestContext);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(cors({ origin: corsOrigin, credentials: true }));
// Antes de /uploads y del limitador: un build con VITE_API_URL sin /api
// llama a /auth/login y recibía 404. Los archivos de /uploads no se tocan.
app.use(restoreApiPrefix);

// uploads static — AUDIT-005 media posts
const uploadsRoot = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });
// /uploads consulta la base en cada petición (mediaAcl). Sin límite, una
// ráfaga anónima sobre rutas de media agota la base. El límite por defecto
// es alto para no penalizar la carga normal de feeds con muchas imágenes.
const mediaLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: rateLimitFromEnv("MEDIA_RATE_LIMIT_MAX", 3000), standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Demasiadas solicitudes de archivos. Intenta más tarde." } });
app.use("/uploads", mediaLimiter);
app.use("/uploads", mediaAcl);
// `mediaAcl` decide la política de caché y la deja en
// `res.locals.mediaCacheControl`: pública (una semana) para lo que es público,
// `private, no-store` para adjuntos de mensajes, historias, borradores y media
// de audiencias restringidas. Sin `setHeaders` ese valor no lo leía nadie en
// el camino habitual —el archivo servido desde disco— y express.static
// respondía su `public, max-age=0`, que autoriza a cualquier caché compartida
// a guardar media privada. El defecto por omisión es el privado: si mediaAcl
// no llegó a decidir, no se publica nada.
app.use(
  "/uploads",
  express.static(uploadsRoot, {
    etag: true,
    setHeaders(res) {
      res.setHeader(
        "Cache-Control",
        res.locals.mediaCacheControl || "private, no-store"
      );
      res.vary("Cookie");
    }
  })
);
// Si el disco del proceso ya no tiene el archivo (redespliegue), se sirve
// la copia de GridFS. express.static llama a next() cuando no lo encuentra.
app.use("/uploads", serveDurableUpload);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(inputSanitizer);
// Los límites son configurables por entorno (por ejemplo en pruebas E2E
// que hacen muchas peticiones reales) sin cambiar el valor por defecto.
function rateLimitFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: rateLimitFromEnv("API_RATE_LIMIT_MAX", 300), standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Demasiadas solicitudes. Intenta nuevamente más tarde." } });
app.use("/api", apiLimiter);
const abuseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: rateLimitFromEnv("ABUSE_RATE_LIMIT_MAX", 60),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error:
      "Vas muy rápido. Tómate un momento."
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: rateLimitFromEnv("AUTH_RATE_LIMIT_MAX", 20),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error:
      "Demasiados intentos. Intenta nuevamente más tarde."
  }
});

// El commit se resuelve UNA vez al arrancar: dentro del proceso no cambia, y
// recalcularlo en cada petición solo añadiría trabajo a un endpoint que los
// balanceadores consultan constantemente.
const BUILD_INFO = getBuildInfo();

/**
 * Identidad de la instancia que está respondiendo.
 *
 * Con una sola réplica este campo no sirve de nada; con dos es lo único que
 * permite correlacionar un pico de errores, un índice que tarda o un reinicio
 * con un proceso concreto: mientras el monitor vea «el health responde OK» sin
 * saber *cuál* respondió, una réplica mala se esconde detrás de la buena.
 *
 * Render expone `RENDER_INSTANCE_ID`; fuera de él se fabrica un identificador
 * con hostname y pid, que es legible en el log del hosting. Ninguna de las dos
 * formas contiene credencial ni URI: es un nombre, no un secreto.
 */
const INSTANCE_INFO = Object.freeze({
  id: String(process.env.RENDER_INSTANCE_ID || `${os.hostname()}:${process.pid}`).trim().slice(0, 120),
  host: os.hostname(),
  pid: process.pid
});

const healthResponse = (req, res) => {
  const database = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  const healthy = database === "connected";
  res.status(healthy ? 200 : 503).json({
    // --- contrato existente, sin tocar ---
    ok: healthy,
    service: "kronos-space",
    database,
    // Derivado, no un literal. Era `realtime: true` a pelo: el endpoint
    // afirmaba que el tiempo real estaba sano sin comprobar nada, así que un
    // monitor nunca se enteraría de que Socket.IO no llegó a arrancar.
    //
    // El valor y el conjunto de claves del contrato NO cambian (health.test.js
    // los fija, y en producción `realtime:true` sigue siendo verdad): en
    // cualquier despliegue real `io.engine`
    // existe y esto sigue dando true. Lo que cambia es que ahora significa
    // algo —el motor de Engine.IO está acoplado al servidor HTTP— en vez de
    // ser una constante. Una sonda más profunda (ida y vuelta real de
    // websocket) o publicar el número de clientes conectados sí alterarían el
    // contrato y quedan como decisión del propietario.
    realtime: Boolean(io?.engine),
    timestamp: new Date().toISOString(),
    // --- añadido: trazabilidad REPO -> COMMIT -> DEPLOY -> SERVICE -> HEALTH
    // Sin esto no hay forma auditable de saber qué código está ejecutándose
    // contra la base de producción. Son identificadores públicos de la
    // compilación; aquí no se expone ninguna credencial ni la URI.
    build: {
      commit: BUILD_INFO.commit,
      commitShort: BUILD_INFO.commitShort,
      branch: BUILD_INFO.branch,
      repo: BUILD_INFO.repo,
      serviceName: BUILD_INFO.service,
      startedAt: BUILD_INFO.startedAt,
      traceable: BUILD_INFO.traceable
    },
    // Dos banderas de configuración que la lista de pre-producción exige
    // comprobar y que hoy solo se pueden mirar en el panel del proveedor.
    // Ninguna es un secreto: una dice el entorno, la otra si Mongoose puede
    // crear índices por su cuenta.
    // Entorno EFECTIVO, el que las guardas aplican de verdad. Si NODE_ENV
    // faltara o fuese desconocido, el criterio fail-closed lo trata como
    // producción, y eso es lo que hay que ver aquí.
    environment: isProductionEnv() ? "production" : normalizeEnvironment(process.env.NODE_ENV),
    // Distingue «NODE_ENV=production declarado» de «NODE_ENV ausente y
    // tratado como producción por defecto». El punto 10 de la lista de
    // pre-producción exige exactamente esa diferencia, y sin este campo las
    // dos situaciones se ven idénticas desde fuera.
    environmentDeclared: isKnownNonProductionEnvironment(process.env.NODE_ENV)
      || normalizeEnvironment(process.env.NODE_ENV) === "production",
    autoIndex: resolveAutoIndex(),
    // Tercera bandera del mismo tipo que las dos de arriba: si `trust proxy`
    // está activado en este proceso. Es un booleano, no un dato interno, y es
    // lo único que permite comprobar desde fuera que los tres limitadores se
    // reparten por visitante y no entre toda la plataforma en un solo cubo
    // (docs/production-access.md §4bis). Se lee en la petición y no en el
    // arranque para que lo publicado sea el valor del proceso que responde.
    trustProxy: Boolean(app.get("trust proxy")),
    // Cuarta bandera del mismo bloque: quién está respondiendo. Ver
    // `INSTANCE_INFO` arriba para el porqué (una réplica mala no puede
    // esconderse detrás del verde de las demás).
    instance: INSTANCE_INFO
  });
};

app.get("/health", healthResponse);
app.get("/api/health", healthResponse);

// FASE 0 — feature flags: el cliente pregunta una vez al arrancar.
// Pública por diseño: solo dice qué funciones están encendidas.
app.get("/api/flags", (req, res) => {
  return res.json({ flags: getFeatureFlags() });
});


registerRoutes(app, { authLimiter, abuseLimiter });

// Los terminales van después de todas las rutas, nunca antes.
app.use(notFound);
app.use(errorHandler);
const io = new Server(server, { cors: { origin: corsOrigin, credentials: true } });

registerSocketHandlers(io);
app.set("io", io);

/** Handle del barrido de cápsulas; null hasta que startServer lo arranca. */
let capsuleTimer = null;
let shuttingDown = false;

/**
 * Apagado ordenado.
 *
 * No había ninguno: Render y cualquier orquestador envían SIGTERM y el proceso
 * moría en seco, con las peticiones en vuelo cortadas a mitad, los sockets sin
 * cerrar y la conexión de Mongoose sin liberar. El contenedor termina igual,
 * pero así termina después de dejar de aceptar trabajo nuevo y de cerrar lo que
 * ya estaba atendiendo.
 *
 * Se registra dentro de startServer() a propósito: quien importa este módulo
 * (las ~90 suites de pruebas) no instala manejadores de señales que no le
 * pertenecen.
 */
function registerShutdownHandlers() {
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`SHUTDOWN: ${signal} recibido, cerrando`);

    if (capsuleTimer) {
      clearInterval(capsuleTimer);
      capsuleTimer = null;
    }

    // Fuerza la salida si algo se queda colgado: un apagado que no termina es
    // peor que uno brusco, porque el orquestador espera hasta su propio límite.
    const deadline = setTimeout(() => {
      console.error("SHUTDOWN_TIMEOUT: cerrando de todos modos");
      process.exit(1);
    }, 10_000);
    deadline.unref();

    // 1. Dejar de aceptar conexiones nuevas y terminar las existentes.
    io.close(() => {
      server.close(async () => {
        try {
          await mongoose.connection.close();
        } catch (error) {
          console.error("SHUTDOWN_DB_CLOSE_ERROR", { message: error?.message || "" });
        }
        clearTimeout(deadline);
        console.log("SHUTDOWN: cerrado en orden");
        process.exit(0);
      });
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

async function startServer() {
  // Las cápsulas del tiempo cifran su contenido con CAPSULE_SECRET y, si
  // falta, derivan la clave de JWT_SECRET. Funciona, pero la clave de
  // cifrado no debería depender del secreto de sesión: rotarlo dejaría las
  // cápsulas ilegibles. Un aviso explícito evita que pase inadvertido.
  if (!process.env.CAPSULE_SECRET?.trim()) {
    console.warn(
      "CONFIG_WARNING: CAPSULE_SECRET no configurado — las cápsulas se cifran con JWT_SECRET (ver docs/server/KRONOS-CAPSULES.md)"
    );
  }

  const avisoProxy = trustProxyWarning();

  if (avisoProxy) {
    console.warn(avisoProxy);
  }

  // En producción el origen del frontend no puede quedar implícito:
  // CORS debe usar los dominios reales (Vercel y Cloudflare Pages).
  // `NODE_ENV === "production"` exacto dejaba arrancar sin CLIENT_URL a
  // cualquier despliegue que escribiera el entorno de otra forma, o que no
  // lo escribiera: justo los casos en que esta comprobación hace falta.
  if (
    isProductionProcessEnv() &&
    !process.env.CLIENT_URL
  ) {
    console.error(
      "STARTUP_ERROR: CLIENT_URL no configurado. Define los orígenes reales del frontend separados por comas."
    );

    process.exit(1);
  }

  try {
    await connectDB();
    await ensureMessageIndexes();
    server.listen(PORT, () =>
      console.log(
        `KRONOS SPACE API: http://localhost:${PORT} (orígenes CORS: ${allowedOrigins.join(", ")})`
      )
    );

    // Cápsulas del tiempo (Fase 5): apertura idempotente cada minuto. Se
    // arranca aquí, con `io` ya construido y la base conectada, y se guarda el
    // identificador para limpiarlo en el apagado.
    capsuleTimer = setInterval(() => {
      capsuleRoutes.openDueCapsules(io).catch((error) => {
        // Antes era `.catch(() => {})`: si la apertura fallaba no quedaba ni
        // una línea en el log, y una cápsula sin abrir en su fecha es justo el
        // tipo de fallo que nadie nota hasta que un usuario pregunta.
        console.error("CAPSULE_SWEEP_ERROR", {
          name: error?.name || "Error",
          message: error?.message || ""
        });
      });
    }, 60_000);
    capsuleTimer.unref();

    registerShutdownHandlers();
  } catch (error) {
    console.error("STARTUP_ERROR:", error.message);
    process.exit(1);
  }
}

module.exports = {
  app,
  server,
  io,
  startServer,
  trustProxyWarning,
  normalizeOrigin,
  parseAllowedOrigins,
  isAllowedCorsOrigin,
  registerShutdownHandlers
};

// Solo arranca cuando el archivo es el punto de entrada
// (`npm start` / `node src/server.js`); al importarlo en pruebas
// no se abre ningún puerto.
if (require.main === module) {
  startServer();
}

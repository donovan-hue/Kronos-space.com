require("dotenv").config();

if (!process.env.JWT_SECRET) {
  console.error("STARTUP_ERROR: JWT_SECRET no configurado");
  process.exit(1);
}

const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const authRoutes = require("./modules/auth/auth.routes");
const sessionRoutes = require("./modules/auth/session.routes");
const userRoutes = require("./modules/users/users.routes");
const postRoutes = require("./modules/posts/posts.routes");
const messageRoutes = require("./modules/messages/messages.routes");
const notificationRoutes = require("./modules/notifications/notifications.routes");
const moderationRoutes = require("./modules/moderation/moderation.routes");
const draftRoutes = require("./modules/drafts/drafts.routes");
const imageRoutes = require("./modules/image-ai/image.routes");
const videoRoutes = require("./modules/video-ai/video.routes");
const scriptRoutes = require("./modules/script-ai/script.routes");
const chatRoutes = require("./modules/ai-core/routes/chat.routes");
const inputSanitizer = require("./middleware/inputSanitizer");
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/$/, "");
}

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(cors({ origin(origin, callback) { if (!origin) return callback(null, true); return callback(null, allowedOrigins.includes(normalizeOrigin(origin))); }, credentials: true }));

// uploads static — AUDIT-005 media posts
const uploadsRoot = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });
app.use("/uploads", express.static(uploadsRoot, { maxAge: "7d", etag: true }));
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
      "Demasiadas acciones en poco tiempo. Intenta nuevamente más tarde."
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

const healthResponse = (req, res) => {
  const database = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  const healthy = database === "connected";
  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    service: "kronos-social-ai",
    database,
    realtime: true,
    timestamp: new Date().toISOString()
  });
};

app.get("/health", healthResponse);
app.get("/api/health", healthResponse);


// Ciclo de vida de la sesión (KRONOS-AUDIT-002). Se monta antes del
// limitador estricto de credenciales: hidratar la sesión o cerrarla no
// debe consumir el presupuesto de intentos de login.
app.use("/api/auth", sessionRoutes);

app.use(
  "/api/auth",
  authLimiter,
  authRoutes
);

app.use("/api/users", userRoutes);
app.use("/api/posts", abuseLimiter, postRoutes);
app.use("/api/messages", abuseLimiter, messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/moderation", abuseLimiter, moderationRoutes);
app.use("/api/drafts", draftRoutes);
app.use("/api/ai/images", imageRoutes);
app.use("/api/ai/videos", videoRoutes);
app.use("/api/ai/scripts", scriptRoutes);
app.use("/api/ai", chatRoutes);
app.use((err, req, res, next) => { console.error("API_ERROR:", err); if (res.headersSent) return next(err); const status = Number.isInteger(err.statusCode) ? err.statusCode : Number.isInteger(err.status) ? err.status : 500; res.status(status).json({ error: status >= 500 ? "Error interno del servidor" : err.message || "Error de solicitud" }); });
const io = new Server(server, { cors: { origin: allowedOrigins, credentials: true } });
io.use((socket, next) => { const token = socket.handshake.auth?.token || socket.handshake.headers.authorization; if (typeof token !== "string" || !token.trim()) return next(new Error("AUTH_REQUIRED")); try { const decoded = jwt.verify(token.replace(/^Bearer\s+/i, "").trim(), process.env.JWT_SECRET, { algorithms: ["HS256"] }); if (typeof decoded.id !== "string" || !decoded.id.trim()) return next(new Error("AUTH_INVALID")); socket.userId = decoded.id; return next(); } catch { return next(new Error("AUTH_INVALID")); } });
app.set("io", io);
io.on("connection", (socket) => { socket.join(`user:${socket.userId}`); socket.on("disconnect", () => {}); });
async function startServer() {
  // En producción el origen del frontend no puede quedar implícito:
  // CORS debe usar los dominios reales (Vercel y Cloudflare Pages).
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.CLIENT_URL
  ) {
    console.error(
      "STARTUP_ERROR: CLIENT_URL no configurado. Define los orígenes reales del frontend separados por comas."
    );

    process.exit(1);
  }

  try {
    await connectDB();
    server.listen(PORT, () =>
      console.log(
        `KRONOS SOCIAL AI API: http://localhost:${PORT} (orígenes CORS: ${allowedOrigins.join(", ")})`
      )
    );
  } catch (error) {
    console.error("STARTUP_ERROR:", error.message);
    process.exit(1);
  }
}

module.exports = { app, server, io, startServer };

// Solo arranca cuando el archivo es el punto de entrada
// (`npm start` / `node src/server.js`); al importarlo en pruebas
// no se abre ningún puerto.
if (require.main === module) {
  startServer();
}

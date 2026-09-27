const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const User = require("../users/User");
const auth = require("../../middleware/auth");
const {
  issueSession,
  revokeUserRefreshTokens,
  verifySessionToken,
  isSessionRevoked,
  isRefreshFamilyActive
} = require("./session.service");

const router = express.Router();
const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
const MAX_PASSWORD_LENGTH = 128;
const MAX_DISPLAY_NAME_LENGTH = 100;

/**
 * Payload de sesión del usuario (contrato existente + campos
 * aditivos que ya se hidrataban con `/auth/me`: cover y role).
 */
function sessionUserPayload(user) {
  return {
    id: user._id,
    _id: user._id,
    username: user.username,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    displayName: user.displayName,
    avatar: user.avatar,
    cover: user.cover,
    bio: user.bio,
    role: user.role || "user"
  };
}

function requestContext(req) {
  return {
    userAgent: req.get("user-agent") || "",
    ip: req.ip || ""
  };
}

function normalizeEmail(email) {
  return typeof email === "string"
    ? email.trim().toLowerCase()
    : "";
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashResetToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function getFrontendOrigin() {
  const origins = (process.env.CLIENT_URL || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return origins[0] || "http://localhost:3000";
}

// ---------------------------------------------------------------
// KRONOS-AUTH-GOOGLE — "Continuar con Google" (Google Identity Services)
//
// El navegador entrega el ID token que Google firmó; este servidor lo
// verifica con google-auth-library (firma, audiencia y expiración) y,
// si es válido, reutiliza issueSession() para emitir el mismo par
// JWT + refresh token rotativo que usan login/registro. No hay
// Client Secret implicado: solo GOOGLE_CLIENT_ID.
// ---------------------------------------------------------------

let googleOAuthClient = null;

function getGoogleClientId() {
  return (process.env.GOOGLE_CLIENT_ID || "").trim();
}

function getGoogleOAuthClient() {
  const clientId = getGoogleClientId();

  if (!clientId) {
    const error = new Error("GOOGLE_CLIENT_ID_NOT_CONFIGURED");
    error.statusCode = 503;
    error.code = "GOOGLE_NOT_CONFIGURED";
    throw error;
  }

  if (!googleOAuthClient) {
    googleOAuthClient = new OAuth2Client(clientId);
  }

  return googleOAuthClient;
}

/**
 * Convierte un origen arbitrario (nombre de Google o parte local del
 * email) en una base válida de username: /^[a-z0-9_]+$/, sin acentos.
 */
function toUsernameBase(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

/**
 * Username disponible derivado del nombre/correo de Google. Deja margen
 * para el sufijo _N dentro del límite de 30 caracteres del esquema.
 */
async function buildUniqueUsername({ email, name, googleSub }) {
  const emailLocal = String(email || "").split("@")[0] || "";
  const googleSuffix = String(googleSub || "").replace(/\D/g, "").slice(-10);

  const seeds = [
    toUsernameBase(name),
    toUsernameBase(emailLocal),
    googleSuffix ? `g_${googleSuffix}` : ""
  ].filter((seed) => seed.length >= 3);

  const candidates = seeds.length > 0 ? seeds : ["kronos_user"];

  for (const base of candidates) {
    let candidate = base;

    for (let suffix = 1; suffix < 1000; suffix += 1) {
      const taken = await User.exists({ username: candidate });

      if (!taken) {
        return candidate;
      }

      candidate = `${base}_${suffix}`.slice(0, 30);
    }
  }

  return `k${Date.now().toString(36)}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 30);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Envío genérico de correo transaccional vía Resend. Centraliza la
 * validación de configuración y el manejo de errores HTTP para que
 * verificación de email y recuperación de contraseña no dupliquen
 * (y no diverjan) la misma lógica de bajo nivel.
 */
async function sendTransactionalEmail({
  email,
  subject,
  html
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    const error = new Error("EMAIL_SERVICE_NOT_CONFIGURED");
    error.code = "EMAIL_SERVICE_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let response;
  try {
    response = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject,
          html
        }),
        signal: controller.signal
      }
    );
  } catch (error) {
    const emailError = new Error(
      error.name === "AbortError" ? "EMAIL_SEND_TIMEOUT" : "EMAIL_SEND_FAILED"
    );
    emailError.code = emailError.message;
    emailError.cause = error;
    throw emailError;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    console.error("RESEND_ERROR:", body);
    const error = new Error("EMAIL_SEND_FAILED");
    error.code = "EMAIL_SEND_FAILED";
    throw error;
  }
}

async function sendVerificationEmail({
  email,
  username,
  verifyUrl
}) {
  const safeUsername = escapeHtml(username || "usuario");
  const safeVerifyUrl = escapeHtml(verifyUrl);

  await sendTransactionalEmail({
    email,
    subject: "Verifica tu correo en Kronos Space",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px;margin:auto">
        <h2>Kronos Space</h2>
        <p>Hola ${safeUsername}.</p>
        <p>Gracias por unirte a Kronos. Haz clic en el botón para verificar tu dirección de correo electrónico:</p>
        <p>
          <a
            href="${safeVerifyUrl}"
            style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:8px"
          >
            Verificar mi correo
          </a>
        </p>
        <p>Este enlace expirará en 24 horas.</p>
        <p>Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
      </div>
    `
  });
}

/**
 * KRONOS-AUTH-FIX — Faltaba esta función: el endpoint /forgot-password
 * la invocaba sin que existiera, provocando un ReferenceError silencioso
 * (capturado por el catch del endpoint) que devolvía siempre 503,
 * dejando el flujo de recuperación de contraseña completamente inoperante
 * sin importar la configuración de RESEND_API_KEY / RESEND_FROM_EMAIL.
 */
async function sendPasswordResetEmail({
  email,
  username,
  resetUrl
}) {
  const safeUsername = escapeHtml(username || "usuario");
  const safeResetUrl = escapeHtml(resetUrl);

  await sendTransactionalEmail({
    email,
    subject: "Recupera tu contraseña en Kronos Space",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px;margin:auto">
        <h2>Kronos Space</h2>
        <p>Hola ${safeUsername}.</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón para crear una nueva contraseña:</p>
        <p>
          <a
            href="${safeResetUrl}"
            style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:8px"
          >
            Restablecer mi contraseña
          </a>
        </p>
        <p>Este enlace expirará en 30 minutos.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este mensaje: tu contraseña actual seguirá funcionando.</p>
      </div>
    `
  });
}

router.post("/register", async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      displayName
    } = req.body || {};

    if (
      typeof username !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !username.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        error: "username, email y password son obligatorios"
      });
    }

    if (displayName !== undefined && displayName !== null && typeof displayName !== "string") {
      return res.status(400).json({ error: "El nombre visible no es válido" });
    }

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = normalizeEmail(email);

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      return res.status(400).json({
        error: "El usuario debe tener entre 3 y 30 caracteres: solo letras minúsculas, números y guion bajo"
      });
    }

    if (!validEmail(normalizedEmail) || normalizedEmail.length > 254) {
      return res.status(400).json({ error: "Email inválido" });
    }

    if (password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `La contraseña debe tener entre 8 y ${MAX_PASSWORD_LENGTH} caracteres`
      });
    }

    if (typeof displayName === "string" && displayName.trim().length > MAX_DISPLAY_NAME_LENGTH) {
      return res.status(400).json({ error: "El nombre visible no puede superar 100 caracteres" });
    }

    const exists = await User.findOne({
      $or: [
        { username: normalizedUsername },
        { email: normalizedEmail }
      ]
    });

    if (exists) {
      return res.status(409).json({
        error:
          "El usuario o email ya existe"
      });
    }

    const passwordHash =
      await bcrypt.hash(password, 12);

    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash,
      displayName:
        displayName?.trim() ||
        normalizedUsername
    });

    const session = await issueSession(user, requestContext(req));

    return res.status(201).json({
      token: session.token,
      expiresAt: session.expiresAt,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
      user: sessionUserPayload(user)
    });
  } catch (error) {
    console.error("REGISTER_ERROR:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        error:
          "El usuario o email ya existe"
      });
    }

    return res.status(500).json({
      error: "Error creando usuario"
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        error: "email y password son obligatorios"
      });
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: "La contraseña no es válida" });
    }

    const normalizedEmail = normalizeEmail(email);

    const user = await User.findOne({
      email: normalizedEmail
    });

    if (!user) {
      return res.status(401).json({
        error: "Credenciales inválidas"
      });
    }

    let valid = false;

    if (
      typeof user.passwordHash === "string" &&
      user.passwordHash.length > 0
    ) {
      valid = await bcrypt.compare(
        password,
        user.passwordHash
      );
    } else {
      const legacyUser =
        await User.collection.findOne({
          _id: user._id
        });

      if (
        legacyUser &&
        typeof legacyUser.password === "string" &&
        legacyUser.password.length > 0
      ) {
        valid = await bcrypt.compare(
          password,
          legacyUser.password
        );

        if (valid) {
          await User.collection.updateOne(
            { _id: user._id },
            {
              $set: {
                passwordHash:
                  legacyUser.password
              },
              $unset: {
                password: ""
              }
            }
          );

          user.passwordHash =
            legacyUser.password;
        }
      }
    }

    if (!valid) {
      return res.status(401).json({
        error: "Credenciales inválidas"
      });
    }

    const session = await issueSession(user, requestContext(req));

    return res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
      user: sessionUserPayload(user)
    });
  } catch (error) {
    console.error("LOGIN_ERROR:", error);

    return res.status(500).json({
      error: "Error iniciando sesión"
    });
  }
});

/**
 * GET /api/auth/google/config
 * Configuración pública del botón "Continuar con Google". El Client ID
 * de OAuth es público por diseño (viaja en cada página que usa Google
 * Identity Services), así que el frontend lo consulta para decidir si
 * muestra el botón y cómo inicializarlo. Sin variable configurada
 * responde enabled=false y el cliente simplemente no muestra nada.
 */
router.get("/google/config", (req, res) => {
  const clientId = getGoogleClientId();

  return res.json({
    enabled: Boolean(clientId),
    clientId: clientId || null
  });
});

/**
 * POST /api/auth/google — KRONOS-AUTH-GOOGLE
 * Body: { credential } (ID token de Google Identity Services).
 *
 * 1. Verifica firma/audiencia/expiración del token contra GOOGLE_CLIENT_ID.
 * 2. Usuario ya vinculado (googleId) -> inicia sesión.
 * 3. Email local existente y verificado por Google -> vincula googleId
 *    (nunca al revés: el email debe estar confirmado por Google).
 * 4. Usuario nuevo -> crea la cuenta sin contraseña local, con email
 *    verificado, avatar y displayName que entrega Google.
 * En todos los casos emite la misma sesión (JWT + refresh) que el
 * login/registro tradicionales vía issueSession().
 */
router.post("/google", async (req, res) => {
  try {
    const credential =
      typeof req.body?.credential === "string"
        ? req.body.credential.trim()
        : "";

    if (!credential) {
      return res.status(400).json({
        error: "Falta el token (credential) de Google."
      });
    }

    const clientId = getGoogleClientId();

    if (!clientId) {
      return res.status(503).json({
        error: "El acceso con Google no está configurado en este servidor.",
        code: "GOOGLE_NOT_CONFIGURED"
      });
    }

    let payload;

    try {
      const client = getGoogleOAuthClient();
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: clientId
      });
      payload = ticket.getPayload();
    } catch (verifyError) {
      console.error("GOOGLE_VERIFY_ERROR:", verifyError.message);

      return res.status(401).json({
        error:
          "No pudimos verificar tu cuenta de Google. Intenta nuevamente.",
        code: "GOOGLE_TOKEN_INVALID"
      });
    }

    const googleId = String(payload?.sub || "").trim();
    const email = normalizeEmail(payload?.email);

    if (!googleId || !validEmail(email)) {
      return res.status(401).json({
        error: "La cuenta de Google no expuso un identificador válido."
      });
    }

    // Sin email_verified Google no garantiza la titularidad del correo,
    // así que no se vincula ni se crea la cuenta.
    if (payload.email_verified !== true) {
      return res.status(401).json({
        error:
          "Google no confirmó tu correo. Verifícalo en tu cuenta de Google e intenta de nuevo."
      });
    }

    let user = await User.findOne({ googleId }).select("+googleId");

    if (!user) {
      user = await User.findOne({ email }).select("+googleId");

      if (user) {
        // Cuenta local preexistente: se enlaza con Google.
        user.googleId = googleId;

        if (!user.emailVerified) {
          user.emailVerified = true;
        }

        if (!user.avatar && payload.picture) {
          user.avatar = String(payload.picture).slice(0, 2000);
        }

        await user.save();
      }
    }

    let created = false;

    if (!user) {
      const username = await buildUniqueUsername({
        email,
        name: payload.name,
        googleSub: googleId
      });

      user = await User.create({
        username,
        email,
        googleId,
        emailVerified: true,
        displayName:
          String(payload.name || "").trim().slice(0, 100) || username,
        avatar: String(payload.picture || "").slice(0, 2000)
      });

      created = true;
    }

    const session = await issueSession(user, requestContext(req));

    return res.status(created ? 201 : 200).json({
      token: session.token,
      expiresAt: session.expiresAt,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
      user: sessionUserPayload(user)
    });
  } catch (error) {
    console.error("GOOGLE_AUTH_ERROR:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        error:
          "Ese correo ya está asociado a otra cuenta. Inicia sesión con tu contraseña y vuelve a intentarlo."
      });
    }

    return res.status(500).json({
      error: "Error iniciando sesión con Google"
    });
  }
});

router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("username email emailVerified displayName avatar cover bio role followers following").lean();
    if (!user) return res.status(401).json({ error: "Sesión inválida", code: "USER_NOT_FOUND" });
    return res.json({ user: { ...user, id: user._id } });
  } catch (error) {
    console.error("ME_ERROR:", error);
    return res.status(500).json({ error: "No se pudo validar la sesión" });
  }
});

router.post("/forgot-password", async (req, res) => {
  const genericResponse = {
    message:
      "Si existe una cuenta con ese correo, recibirás instrucciones para restablecer tu contraseña."
  };

  let debugStage = "inicio";

  try {
    debugStage = "normalizar_email";
    const email = normalizeEmail(req.body?.email);

    if (!validEmail(email)) {
      return res.json(genericResponse);
    }

    debugStage = "buscar_usuario";
    const user = await User.findOne({
      email
    }).select(
      "+passwordResetTokenHash +passwordResetExpiresAt"
    );

    if (!user) {
      return res.json(genericResponse);
    }

    debugStage = "generar_token";
    const resetToken =
      crypto.randomBytes(32).toString("hex");

    const tokenHash =
      hashResetToken(resetToken);

    const expiresAt =
      new Date(Date.now() + 30 * 60 * 1000);

    debugStage = "guardar_token";
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: expiresAt
        }
      }
    );

    debugStage = "crear_url";
    const resetUrl =
      `${getFrontendOrigin()}/reset-password?token=${encodeURIComponent(resetToken)}`;

    try {
      debugStage = "enviar_email";
      await sendPasswordResetEmail({
        email: user.email,
        username: user.username,
        resetUrl
      });
    } catch (emailError) {
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            passwordResetTokenHash: null,
            passwordResetExpiresAt: null
          }
        }
      );

      console.error(
        "PASSWORD_RESET_EMAIL_ERROR:",
        emailError.message
      );

      return res.status(503).json({
        error:
          emailError.code === "EMAIL_SERVICE_NOT_CONFIGURED"
            ? "El servicio de correo no está configurado. Contacta al administrador."
            : "El servicio de correo no está disponible. Intenta nuevamente más tarde.",
        code: emailError.code || "EMAIL_SEND_FAILED"
      });
    }

    return res.json(genericResponse);
  } catch (error) {
    console.error("FORGOT_PASSWORD_ERROR:", {
      stage: debugStage,
      name: error?.name || "Error",
      message: error?.message || "Unknown error",
      code: error?.code || null
    });

    return res.status(500).json({
      error: "No fue posible procesar la solicitud."
    });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const {
      token,
      password
    } = req.body || {};

    if (
      typeof token !== "string" ||
      token.length < 40
    ) {
      return res.status(400).json({
        error: "Token de recuperación inválido."
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
      return res.status(400).json({
        error: `La contraseña debe tener entre 8 y ${MAX_PASSWORD_LENGTH} caracteres.`
      });
    }

    const tokenHash =
      hashResetToken(token);

    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: {
        $gt: new Date()
      }
    }).select(
      "+passwordResetTokenHash +passwordResetExpiresAt"
    );

    if (!user) {
      return res.status(400).json({
        error:
          "El enlace de recuperación es inválido o ya expiró."
      });
    }

    const newPasswordHash =
      await bcrypt.hash(password, 12);

    const updateResult =
      await User.collection.updateOne(
        {
          _id: user._id,
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: { $gt: new Date() }
        },
        {
          $set: {
            passwordHash: newPasswordHash,
            passwordResetTokenHash: null,
            passwordResetExpiresAt: null
          },
          $unset: {
            password: ""
          }
        }
      );

    if (updateResult.matchedCount !== 1) {
      return res.status(400).json({
        error:
          "El enlace de recuperación es inválido o ya expiró."
      });
    }

    // Cambiar la contraseña invalida las sesiones existentes, incluidas las
    // sesiones que pudieron haber quedado abiertas en otro dispositivo.
    await revokeUserRefreshTokens(user._id, "password_reset");

    return res.json({
      message:
        "Contraseña actualizada correctamente."
    });
  } catch (error) {
    console.error(
      "RESET_PASSWORD_ERROR:",
      error
    );

    return res.status(500).json({
      error:
        "No fue posible actualizar la contraseña."
    });
  }
});

/**
 * POST /api/auth/verify-email/request — KRONOS-UI-004
 * Genera un token de verificación de correo y lo envía por email si está configurado.
 */
router.post("/verify-email/request", async (req, res) => {
  const genericResponse = {
    message: "Si la cuenta existe, recibirás un enlace para verificar tu correo."
  };

  try {
    let user = null;
    const authHeader = req.headers.authorization;
    const email = normalizeEmail(req.body?.email);

    if (!authHeader && (!email || !validEmail(email))) {
      return res.status(400).json({ error: "Email inválido" });
    }

    // Puede invocarse con token JWT o pasando el email directamente.
    //
    // El token se VERIFICA (firma, expiración, algoritmo y revocación) antes
    // de usarlo como identidad. Antes se usaba `jwt.decode`, que no valida la
    // firma: cualquiera podía enviar un JWT sin firmar con el `id` de otra
    // cuenta y provocar la emisión de un token de verificación de correo para
    // ese usuario. Un token inválido ya NO cae al camino por email: se
    // rechaza, para que una credencial presente y mala nunca se degrade a una
    // identidad distinta.
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const rawToken = authHeader.slice(7).trim();

      if (!rawToken) {
        return res.status(401).json({
          error: "Token inválido",
          code: "TOKEN_MISSING"
        });
      }

      let decoded;

      try {
        decoded = verifySessionToken(rawToken);
      } catch (error) {
        return res.status(401).json({
          error:
            error?.name === "TokenExpiredError"
              ? "Token expirado"
              : "Token inválido",
          code:
            error?.name === "TokenExpiredError"
              ? "TOKEN_EXPIRED"
              : "TOKEN_INVALID"
        });
      }

      if (typeof decoded?.id !== "string" || !decoded.id.trim()) {
        return res.status(401).json({
          error: "Token inválido",
          code: "TOKEN_MALFORMED"
        });
      }

      if (await isSessionRevoked(decoded, rawToken)) {
        return res.status(401).json({
          error: "Sesión cerrada",
          code: "TOKEN_REVOKED"
        });
      }

      if (
        typeof decoded.sid === "string" &&
        decoded.sid.trim() &&
        !await isRefreshFamilyActive(decoded.id, decoded.sid)
      ) {
        return res.status(401).json({
          error: "Sesión cerrada",
          code: "SESSION_REVOKED"
        });
      }

      user = await User.findById(decoded.id).select("+emailVerificationTokenHash +emailVerificationExpiresAt");
    }

    if (!user && email && validEmail(email)) {
      user = await User.findOne({ email }).select("+emailVerificationTokenHash +emailVerificationExpiresAt");
    }

    if (!user) {
      return res.json(genericResponse);
    }

    if (user.emailVerified) {
      return res.json({ message: "El correo ya está verificado.", emailVerified: true });
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(verificationToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          emailVerificationTokenHash: tokenHash,
          emailVerificationExpiresAt: expiresAt
        }
      }
    );

    const verifyUrl = `${getFrontendOrigin()}/verify-email?token=${encodeURIComponent(verificationToken)}`;

    try {
      await sendVerificationEmail({
        email: user.email,
        username: user.username,
        verifyUrl
      });
    } catch (emailError) {
      // Si el servicio de correo no está configurado o falla, registramos el error sin tumbar
      console.warn("VERIFY_EMAIL_DISPATCH_WARN:", emailError.message);
    }

    return res.json(genericResponse);
  } catch (error) {
    console.error("VERIFY_EMAIL_REQUEST_ERROR:", error);
    return res.status(500).json({ error: "No fue posible procesar la solicitud de verificación." });
  }
});

/**
 * POST /api/auth/verify-email — KRONOS-UI-004
 * Body: { token }
 */
router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body || {};

    if (typeof token !== "string" || token.length < 32) {
      return res.status(400).json({
        error: "Token de verificación inválido."
      });
    }

    const tokenHash = hashResetToken(token);

    const user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: { $gt: new Date() }
    }).select("+emailVerificationTokenHash +emailVerificationExpiresAt");

    if (!user) {
      return res.status(400).json({
        error: "El enlace de verificación es inválido o ya expiró."
      });
    }

    const updateResult = await User.updateOne(
      {
        _id: user._id,
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: { $gt: new Date() }
      },
      {
        $set: {
          emailVerified: true,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null
        }
      }
    );

    if (updateResult.matchedCount !== 1) {
      return res.status(400).json({ error: "El enlace de verificación es inválido o ya expiró." });
    }

    return res.json({
      message: "Email verificado correctamente.",
      emailVerified: true
    });
  } catch (error) {
    console.error("VERIFY_EMAIL_ERROR:", error);
    return res.status(500).json({
      error: "No fue posible verificar el email."
    });
  }
});

/**
 * GET /api/auth/verify-email — KRONOS-UI-004
 * Query: ?token=...
 */
router.get("/verify-email", async (req, res) => {
  try {
    const token = typeof req.query?.token === "string" ? req.query.token : "";

    if (token.length < 32) {
      return res.status(400).json({
        error: "Token de verificación inválido."
      });
    }

    const tokenHash = hashResetToken(token);

    const user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: { $gt: new Date() }
    }).select("+emailVerificationTokenHash +emailVerificationExpiresAt");

    if (!user) {
      return res.status(400).json({
        error: "El enlace de verificación es inválido o ya expiró."
      });
    }

    const updateResult = await User.updateOne(
      {
        _id: user._id,
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: { $gt: new Date() }
      },
      {
        $set: {
          emailVerified: true,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null
        }
      }
    );

    if (updateResult.matchedCount !== 1) {
      return res.status(400).json({ error: "El enlace de verificación es inválido o ya expiró." });
    }

    return res.json({
      message: "Email verificado correctamente.",
      emailVerified: true
    });
  } catch (error) {
    console.error("VERIFY_EMAIL_GET_ERROR:", error);
    return res.status(500).json({
      error: "No fue posible verificar el email."
    });
  }
});

module.exports = router;
// Expuesto para las pruebas de contrato: la lista blanca de campos que puede
// ver un cliente autenticado es una decisión de seguridad, no un detalle.
module.exports.sessionUserPayload = sessionUserPayload;

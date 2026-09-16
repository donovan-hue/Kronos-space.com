const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../users/User");

const router = express.Router();

function createToken(user) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET_NOT_CONFIGURED");
  }

  return jwt.sign(
    {
      id: user._id.toString(),
      username: user.username
    },
    secret,
    {
      expiresIn: "7d"
    }
  );
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

  return origins[0] || "http://localhost:5173";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendPasswordResetEmail({
  email,
  username,
  resetUrl
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");
  }

  const safeUsername = escapeHtml(username || "usuario");
  const safeResetUrl = escapeHtml(resetUrl);

  const response = await fetch(
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
        subject: "Restablece tu contraseña de Kronos Social AI",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px;margin:auto">
            <h2>Kronos Social AI</h2>
            <p>Hola ${safeUsername}.</p>
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
            <p>
              <a
                href="${safeResetUrl}"
                style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:8px"
              >
                Restablecer contraseña
              </a>
            </p>
            <p>Este enlace expirará en 30 minutos.</p>
            <p>Si tú no solicitaste este cambio, puedes ignorar este correo.</p>
          </div>
        `
      })
    }
  );

  if (!response.ok) {
    const body = await response.text();
    console.error("RESEND_ERROR:", body);
    throw new Error("EMAIL_SEND_FAILED");
  }
}

router.post("/register", async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      displayName
    } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        error:
          "username, email y password son obligatorios"
      });
    }

    const normalizedUsername =
      username.trim().toLowerCase();

    const normalizedEmail =
      normalizeEmail(email);

    if (!validEmail(normalizedEmail)) {
      return res.status(400).json({
        error: "Email inválido"
      });
    }

    if (normalizedUsername.length < 3) {
      return res.status(400).json({
        error:
          "El usuario debe tener mínimo 3 caracteres"
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        error:
          "La contraseña debe tener mínimo 8 caracteres"
      });
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

    const token = createToken(user);

    return res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar
      }
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error:
          "email y password son obligatorios"
      });
    }

    const normalizedEmail =
      normalizeEmail(email);

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

          console.log(
            "AUTH_MIGRATION_OK:",
            user.username
          );
        }
      }
    }

    if (!valid) {
      return res.status(401).json({
        error: "Credenciales inválidas"
      });
    }

    const token = createToken(user);

    return res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error("LOGIN_ERROR:", error);

    return res.status(500).json({
      error: "Error iniciando sesión"
    });
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
    console.log("PASSWORD_RESET_DEBUG: buscando usuario");

    const user = await User.findOne({
      email
    }).select(
      "+passwordResetTokenHash +passwordResetExpiresAt"
    );

    console.log(
      "PASSWORD_RESET_DEBUG: usuario=",
      user ? "ENCONTRADO" : "NO_ENCONTRADO"
    );

    if (!user) {
      return res.json(genericResponse);
    }

    console.log(
      "PASSWORD_RESET_DEBUG: usuario válido, preparando token"
    );

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
          "El servicio de correo no está disponible. Intenta nuevamente más tarde.",
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
      password.length < 8
    ) {
      return res.status(400).json({
        error:
          "La contraseña debe tener mínimo 8 caracteres."
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

module.exports = router;

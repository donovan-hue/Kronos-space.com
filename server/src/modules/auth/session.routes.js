const express = require("express");
const User = require("../users/User");
const auth = require("../../middleware/auth");
const {
  RefreshToken,
  getTokenDescriptor,
  revokeSession,
  revokeRefreshFamily,
  rotateRefreshToken,
  signSessionToken,
  hashToken
} = require("./session.service");

/**
 * KRONOS-AUDIT-002 — rutas de ciclo de vida de la sesión.
 *
 * Se montan en `/api/auth` ANTES del limitador estricto de credenciales:
 * - `GET /session` valida la sesión persistida (hidratación de la SPA y
 *   detección de expiración o revocación).
 * - `POST /logout` cierra la sesión de verdad: revoca el token actual
 *   para que no pueda reutilizarse.
 * - `GET /token` describe el token propio (expiración y si fue revocado)
 *   sin exponer el secreto.
 *
 * KRONOS-UI-007 (bloque 007-016) añade:
 * - `POST /refresh` rota el refresh token y entrega un access token
 *   nuevo. Un refresh ya rotado revoca la familia completa (detección
 *   de reutilización). No requiere access token válido porque se usa
 *   justamente cuando este expiró.
 *
 * No duplican ni reemplazan register/login/me/forgot-password/reset-password.
 */
const router = express.Router();

function noStore(res) {
  res.set("Cache-Control", "no-store");

  return res;
}

function sessionUser(user) {
  return { ...user, id: user._id };
}

const PUBLIC_USER_FIELDS =
  "username email displayName avatar cover bio role followers following profilePrivacy";

async function findSessionUser(userId) {
  return User.findById(userId)
    .select(PUBLIC_USER_FIELDS)
    .lean();
}

function requestContext(req) {
  return {
    userAgent: req.get("user-agent") || "",
    ip: req.ip || ""
  };
}

router.get("/session", auth, async (req, res) => {
  try {
    const user = await findSessionUser(req.user.id);

    if (!user) {
      return res.status(401).json({
        error: "Sesión inválida",
        code: "USER_NOT_FOUND"
      });
    }

    return noStore(res).json({
      valid: true,
      expiresAt: req.auth.expiresAt,
      tokenId: req.auth.tokenId,
      user: sessionUser(user)
    });
  } catch (error) {
    console.error("SESSION_ERROR:", error);

    return res.status(500).json({
      error: "No se pudo validar la sesión",
      code: "SESSION_FAILED"
    });
  }
});

/**
 * POST /api/auth/refresh — KRONOS-UI-007
 * Body: { refreshToken }
 * Respuesta: { token, expiresAt, refreshToken, refreshExpiresAt, user }
 */
router.post("/refresh", async (req, res) => {
  const provided =
    typeof req.body?.refreshToken === "string"
      ? req.body.refreshToken
      : "";

  try {
    const rotated = await rotateRefreshToken(
      provided,
      requestContext(req)
    );

    const user = await findSessionUser(rotated.userId);

    if (!user) {
      await revokeRefreshFamily(
        rotated.familyId,
        "user_not_found"
      );

      return res.status(401).json({
        error: "Sesión inválida",
        code: "USER_NOT_FOUND"
      });
    }

    // `rotateRefreshToken` ya emitió el refresh nuevo de la familia: aquí
    // solo se firma el access token, para no dejar refresh extra vivos.
    const access = signSessionToken(user);

    return noStore(res).json({
      token: access.token,
      expiresAt: access.expiresAt,
      expiresIn: access.expiresIn,
      refreshToken: rotated.token,
      refreshExpiresAt: rotated.expiresAt,
      user: sessionUser(user)
    });
  } catch (error) {
    if (error.code && error.statusCode === 401) {
      const message =
        error.code === "REFRESH_EXPIRED"
          ? "La sesión expiró. Inicia sesión nuevamente."
          : "Refresh token inválido";

      return noStore(res).status(401).json({
        error: message,
        code: error.code
      });
    }

    console.error("REFRESH_ERROR:", error);

    return res.status(500).json({
      error: "No se pudo renovar la sesión",
      code: "REFRESH_FAILED"
    });
  }
});

router.post("/logout", auth, async (req, res) => {
  try {
    const revoked = await revokeSession(
      req.user,
      req.auth.token,
      "logout"
    );

    // Si el cliente envía su refresh token, se cierra también esa
    // sesión/dispositivo (toda la familia de rotaciones). Sin él, el
    // comportamiento anterior no cambia: solo se revoca el access.
    const provided =
      typeof req.body?.refreshToken === "string"
        ? req.body.refreshToken.trim()
        : "";

    let refreshRevoked = 0;

    if (provided) {
      const record = await RefreshToken.findOne({
        tokenHash: hashToken(provided)
      })
        .select("familyId userId")
        .lean();

      if (
        record &&
        String(record.userId) === String(req.user.id)
      ) {
        refreshRevoked = await revokeRefreshFamily(
          record.familyId,
          "logout"
        );
      }
    }

    return noStore(res).json({
      ok: true,
      revoked,
      refreshRevoked
    });
  } catch (error) {
    console.error("LOGOUT_ERROR:", error);

    return res.status(500).json({
      error: "No se pudo cerrar la sesión",
      code: "LOGOUT_FAILED"
    });
  }
});

router.get("/token", auth, (req, res) => {
  try {
    const descriptor = getTokenDescriptor(req.auth.token);

    return noStore(res).json({
      valid: true,
      revoked: false,
      tokenId: descriptor.revocationId,
      expiresAt: descriptor.expiresAt
    });
  } catch (error) {
    return res.status(401).json({
      error: "Token inválido o expirado",
      code: "TOKEN_INVALID"
    });
  }
});

module.exports = router;

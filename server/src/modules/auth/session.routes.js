const express = require("express");
const User = require("../users/User");
const auth = require("../../middleware/auth");
const {
  getTokenDescriptor,
  revokeSession
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

router.get("/session", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("username email displayName avatar bio followers following")
      .lean();

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

router.post("/logout", auth, async (req, res) => {
  try {
    const revoked = await revokeSession(
      req.user,
      req.auth.token,
      "logout"
    );

    return noStore(res).json({
      ok: true,
      revoked
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

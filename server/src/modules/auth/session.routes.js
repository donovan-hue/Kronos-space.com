const express = require("express");
const mongoose = require("mongoose");
const User = require("../users/User");
const auth = require("../../middleware/auth");
const {
  RefreshToken,
  getTokenDescriptor,
  revokeSession,
  revokeRefreshFamily,
  revokeUserRefreshTokens,
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
  "username email emailVerified displayName avatar cover bio role followers following profilePrivacy";

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

/** Cierra sockets vivos de una sesión revocada, sin exponer datos de token. */
function disconnectSockets(req, matches) {
  const io = req.app?.get("io");
  if (!io?.sockets?.sockets) return;
  for (const socket of io.sockets.sockets.values()) {
    if (matches(socket)) socket.disconnect(true);
  }
}

function socketBelongsTo(socket, userId) {
  return String(socket?.userId || "") === String(userId || "");
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
    const access = signSessionToken(user, { sessionId: rotated.familyId });

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

// ---------------------------------------------------------------
// KRONOS-UI-032 — sesiones y dispositivos
// ---------------------------------------------------------------
function sessionDescriptor(record, currentSessionId) {
  return {
    id: record.familyId,
    current: Boolean(currentSessionId && record.familyId === currentSessionId),
    createdAt: record.createdAt,
    lastSeenAt: record.updatedAt || record.createdAt,
    expiresAt: record.expiresAt,
    userAgent: record.userAgent || "Dispositivo sin identificar",
    // La IP se conserva para detección de anomalías, pero no se expone
    // completa a la interfaz: minimiza datos personales innecesarios.
    ipHint: record.ip ? String(record.ip).replace(/(.+)[.:][^.:]+$/, "$1.•••") : ""
  };
}

router.get("/sessions", auth, async (req, res) => {
  try {
    const sessions = await RefreshToken.find({
      userId: req.user.id,
      revokedAt: null,
      expiresAt: { $gt: new Date() }
    })
      .select("familyId userAgent ip createdAt updatedAt expiresAt")
      .sort({ updatedAt: -1 })
      .lean();

    // Las rotaciones dejan un solo refresh activo por familia. La
    // deduplicación protege los datos existentes creados por versiones
    // previas sin alterar ni migrar documentos.
    const unique = new Map();
    for (const session of sessions) {
      if (!unique.has(session.familyId)) unique.set(session.familyId, session);
    }

    return noStore(res).json({
      sessions: [...unique.values()].map((item) => sessionDescriptor(item, req.user.sid))
    });
  } catch (error) {
    console.error("LIST_SESSIONS_ERROR:", error);
    return res.status(500).json({ error: "No se pudieron obtener las sesiones", code: "SESSIONS_FAILED" });
  }
});

router.delete("/sessions/:familyId", auth, async (req, res) => {
  const familyId = typeof req.params.familyId === "string" ? req.params.familyId.trim() : "";

  if (!mongoose.Types.ObjectId.isValid(familyId)) {
    return res.status(400).json({ error: "ID de sesión inválido", code: "INVALID_SESSION" });
  }

  try {
    const owned = await RefreshToken.exists({ userId: req.user.id, familyId });
    if (!owned) return res.status(404).json({ error: "Sesión no encontrada", code: "SESSION_NOT_FOUND" });

    const revoked = await revokeRefreshFamily(familyId, "device_revoked");
    disconnectSockets(req, (socket) => socketBelongsTo(socket, req.user.id) && socket.data?.sessionId === familyId);
    return noStore(res).json({ revoked, current: Boolean(req.user.sid && req.user.sid === familyId) });
  } catch (error) {
    console.error("REVOKE_SESSION_ERROR:", error);
    return res.status(500).json({ error: "No se pudo cerrar la sesión", code: "SESSION_REVOKE_FAILED" });
  }
});

router.delete("/sessions", auth, async (req, res) => {
  const exceptCurrent = Boolean(req.body?.exceptCurrent);

  try {
    if (!exceptCurrent || !req.user.sid) {
      const revoked = await revokeUserRefreshTokens(req.user.id, "logout_all");
      disconnectSockets(req, (socket) => socketBelongsTo(socket, req.user.id));
      return noStore(res).json({ revoked, currentRevoked: true });
    }

    const records = await RefreshToken.find({
      userId: req.user.id,
      familyId: { $ne: req.user.sid },
      revokedAt: null
    }).select("familyId").lean();
    const familyIds = [...new Set(records.map((record) => record.familyId))];
    const revoked = await Promise.all(familyIds.map((familyId) => revokeRefreshFamily(familyId, "logout_others")));
    disconnectSockets(req, (socket) => socketBelongsTo(socket, req.user.id) && familyIds.includes(socket.data?.sessionId));
    return noStore(res).json({ revoked: revoked.reduce((total, count) => total + count, 0), currentRevoked: false });
  } catch (error) {
    console.error("REVOKE_ALL_SESSIONS_ERROR:", error);
    return res.status(500).json({ error: "No se pudieron cerrar las sesiones", code: "SESSIONS_REVOKE_FAILED" });
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
    let revokedFamilyId = "";

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
        revokedFamilyId = record.familyId;
      }
    }

    disconnectSockets(req, (socket) => socketBelongsTo(socket, req.user.id) && (
      socket.data?.tokenId === req.auth.tokenId ||
      (revokedFamilyId && socket.data?.sessionId === revokedFamilyId)
    ));

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

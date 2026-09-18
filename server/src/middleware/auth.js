const jwt = require("jsonwebtoken");
const {
  isSessionRevoked,
  isRefreshFamilyActive
} = require("../modules/auth/session.service");

/**
 * Además de la firma/expiración del JWT, comprueba que la sesión no
 * haya sido cerrada (revocación por logout). El resto del contrato
 * (códigos, mensajes y `req.user`) se mantiene igual.
 */
module.exports = async function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Token requerido"
    });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error("JWT_SECRET no configurado");
    return res.status(500).json({
      error: "Configuración de seguridad incompleta"
    });
  }

  try {
    const token = header.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        error: "Token inválido",
        code: "TOKEN_MISSING"
      });
    }

    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"]
    });
    
    if (
      typeof decoded.id !== "string" ||
      !decoded.id.trim()
    ) {
      return res.status(401).json({
        error: "Token inválido",
        code: "TOKEN_MALFORMED"
      });
    }

    try {
      const revoked = await isSessionRevoked(
        decoded,
        token
      );

      if (revoked) {
        return res.status(401).json({
          error: "Sesión cerrada",
          code: "TOKEN_REVOKED"
        });
      }

      // Los JWT emitidos desde el BLOQUE 011 incluyen la familia de
      // refresh (`sid`). Si ese dispositivo se revoca, el access token
      // también deja de servir inmediatamente. Tokens históricos sin sid
      // conservan su expiración original para evitar una migración rota.
      if (typeof decoded.sid === "string" && decoded.sid.trim()) {
        const activeFamily = await isRefreshFamilyActive(decoded.id, decoded.sid);
        if (!activeFamily) {
          return res.status(401).json({
            error: "Sesión cerrada",
            code: "SESSION_REVOKED"
          });
        }
      }
    } catch (revocationError) {
      if (revocationError instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({
          error: "Token inválido",
          code: "TOKEN_INVALID"
        });
      }

      console.error("AUTH_REVOCATION_CHECK_ERROR", {
        name: revocationError?.name || "Error",
        code: revocationError?.code || ""
      });

      return res.status(503).json({
        error: "Servicio de autenticación no disponible",
        code: "AUTH_STORAGE_UNAVAILABLE"
      });
    }

    req.user = decoded;
    req.auth = {
      token,
      tokenId:
        typeof decoded.jti === "string"
          ? decoded.jti
          : "",
      expiresAt: decoded.exp
        ? new Date(decoded.exp * 1000).toISOString()
        : ""
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Token expirado",
        code: "TOKEN_EXPIRED"
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Token inválido",
        code: "TOKEN_INVALID"
      });
    }

    return res.status(401).json({
      error: "Token inválido o expirado",
      code: "TOKEN_ERROR"
    });
  }
};

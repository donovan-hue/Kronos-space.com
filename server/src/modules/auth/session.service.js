const crypto = require("crypto");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const ALGORITHM = "HS256";
const DEFAULT_EXPIRES_IN = "7d";
const MAX_REVOCATION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const revocationSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    reason: {
      type: String,
      default: "logout",
      maxlength: 40
    },

    revokedAt: {
      type: Date,
      default: Date.now
    },

    expiresAt: {
      type: Date,
      required: true
    }
  },
  {
    versionKey: false,
    strict: true
  }
);

revocationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

const SessionRevocation =
  mongoose.models.SessionRevocation ||
  mongoose.model(
    "SessionRevocation",
    revocationSchema
  );

function getSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    const error = new Error(
      "JWT_SECRET_NOT_CONFIGURED"
    );

    error.statusCode = 500;
    error.code = "AUTH_CONFIG";
    throw error;
  }

  return secret;
}

function getExpiresIn() {
  const configured =
    typeof process.env.JWT_EXPIRES_IN === "string"
      ? process.env.JWT_EXPIRES_IN.trim()
      : "";

  return configured || DEFAULT_EXPIRES_IN;
}

const DURATION_UNITS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000
};

function parseDuration(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value)) * 1000;
  }

  const raw = String(value || "").trim();

  if (!raw) {
    return parseDuration(DEFAULT_EXPIRES_IN);
  }

  if (/^\d+$/.test(raw)) {
    return Number(raw) * 1000;
  }

  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/i);

  if (!match) {
    return parseDuration(DEFAULT_EXPIRES_IN);
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  return Math.max(
    1,
    Math.floor(amount * DURATION_UNITS[unit])
  );
}

function getExpiresInSeconds() {
  return Math.floor(parseDuration(getExpiresIn()) / 1000);
}

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token))
    .digest("hex");
}

function getRevocationId(decoded, rawToken) {
  if (
    decoded &&
    typeof decoded.jti === "string" &&
    decoded.jti.trim()
  ) {
    return decoded.jti.trim();
  }

  if (typeof rawToken === "string" && rawToken.trim()) {
    return `h:${hashToken(rawToken.trim())}`;
  }

  return "";
}

function getTokenExpiryDate(decoded) {
  if (
    decoded &&
    typeof decoded.exp === "number" &&
    Number.isFinite(decoded.exp)
  ) {
    return new Date(decoded.exp * 1000);
  }

  return new Date(Date.now() + parseDuration(getExpiresIn()));
}

function signSessionToken(user, { sessionId = "" } = {}) {
  const secret = getSecret();
  const expiresInSeconds = getExpiresInSeconds();
  const tokenId = new mongoose.Types.ObjectId().toString();
  const payload = {
    id: user._id.toString(),
    username: user.username
  };

  // BLOQUE 011 — enlaza el access token a su familia de refresh. Los JWT
  // anteriores sin `sid` continúan válidos hasta expirar, sin migración.
  if (typeof sessionId === "string" && sessionId.trim()) {
    payload.sid = sessionId.trim();
  }

  const token = jwt.sign(
    payload,
    secret,
    {
      algorithm: ALGORITHM,
      expiresIn: expiresInSeconds,
      // jsonwebtoken copia `jwtid` al payload como `jti`.
      jwtid: tokenId
    }
  );

  const decoded = jwt.decode(token) || {};

  return {
    token,
    tokenId,
    expiresIn: expiresInSeconds,
    expiresAt: getTokenExpiryDate(decoded).toISOString()
  };
}

function verifySessionToken(rawToken) {
  return jwt.verify(rawToken, getSecret(), {
    algorithms: [ALGORITHM]
  });
}

async function isSessionRevoked(decoded, rawToken) {
  const revocationId = getRevocationId(decoded, rawToken);

  if (!revocationId) {
    return false;
  }

  const found = await SessionRevocation.findById(
    revocationId
  )
    .select("_id")
    .lean();

  return Boolean(found);
}

async function revokeSession(decoded, rawToken, reason = "logout") {
  const revocationId = getRevocationId(decoded, rawToken);

  if (!revocationId) {
    return false;
  }

  const expiresAt = getTokenExpiryDate(decoded);
  const boundedExpiry = new Date(
    Math.min(
      Math.max(expiresAt.getTime(), Date.now() + 1000),
      Date.now() + MAX_REVOCATION_TTL_MS
    )
  );

  await SessionRevocation.updateOne(
    { _id: revocationId },
    {
      $set: {
        userId:
          decoded && decoded.id
            ? decoded.id
            : null,
        reason: String(reason || "logout").slice(0, 40),
        revokedAt: new Date(),
        expiresAt: boundedExpiry
      }
    },
    { upsert: true }
  );

  return true;
}

function getTokenDescriptor(rawToken) {
  const decoded = verifySessionToken(rawToken);

  return {
    decoded,
    expiresAt: getTokenExpiryDate(decoded).toISOString(),
    revocationId: getRevocationId(decoded, rawToken)
  };
}

// ---------------------------------------------------------------
// KRONOS-UI-007 — refresh tokens con rotación (bloque 007-016)
//
// El access token sigue siendo el JWT de siempre (firma, `jti`,
// expiración y revocación intactas). Se añade un refresh token opaco
// que solo se guarda hasheado, con rotación en cada uso y detección
// de reutilización: si un refresh ya rotado vuelve a aparecer, se
// revoca la familia completa (posible robo de token).
// ---------------------------------------------------------------

const REFRESH_TOKEN_PREFIX = "krt_";
const DEFAULT_REFRESH_EXPIRES_IN = "30d";
const MAX_SESSIONS_PER_USER = 20;

const refreshTokenSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    familyId: {
      type: String,
      required: true,
      index: true
    },

    tokenHash: {
      type: String,
      required: true
    },

    userAgent: {
      type: String,
      default: "",
      maxlength: 200
    },

    ip: {
      type: String,
      default: "",
      maxlength: 60
    },

    replacedBy: {
      type: String,
      default: null
    },

    revokedAt: {
      type: Date,
      default: null
    },

    revokedReason: {
      type: String,
      default: "",
      maxlength: 40
    },

    expiresAt: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true
  }
);

refreshTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

const RefreshToken =
  mongoose.models.RefreshToken ||
  mongoose.model("RefreshToken", refreshTokenSchema);

function getRefreshExpiresIn() {
  const configured =
    typeof process.env.JWT_REFRESH_EXPIRES_IN === "string"
      ? process.env.JWT_REFRESH_EXPIRES_IN.trim()
      : "";

  return configured || DEFAULT_REFRESH_EXPIRES_IN;
}

function getRefreshExpiresInSeconds() {
  return Math.floor(
    parseDuration(getRefreshExpiresIn()) / 1000
  );
}

function buildRefreshTokenValue() {
  return `${REFRESH_TOKEN_PREFIX}${crypto
    .randomBytes(48)
    .toString("base64url")}`;
}

function getRequestContext(context = {}) {
  return {
    userAgent: String(context.userAgent || "").slice(0, 200),
    ip: String(context.ip || "").slice(0, 60)
  };
}

/**
 * Emite un refresh token nuevo. `familyId` mantiene la cadena de
 * rotaciones de una misma sesión/dispositivo.
 */
async function issueRefreshToken(
  user,
  { familyId = "", userAgent = "", ip = "" } = {}
) {
  const userId = String(user && (user._id || user.id) || "");

  if (!userId) {
    const error = new Error("REFRESH_USER_REQUIRED");
    error.statusCode = 400;
    error.code = "REFRESH_USER_REQUIRED";
    throw error;
  }

  const token = buildRefreshTokenValue();
  const tokenId = new mongoose.Types.ObjectId().toString();
  const resolvedFamily =
    familyId || new mongoose.Types.ObjectId().toString();
  const expiresAt = new Date(
    Date.now() + parseDuration(getRefreshExpiresIn())
  );
  const context = getRequestContext({ userAgent, ip });

  await RefreshToken.create({
    _id: tokenId,
    userId,
    familyId: resolvedFamily,
    tokenHash: hashToken(token),
    userAgent: context.userAgent,
    ip: context.ip,
    expiresAt
  });

  await pruneUserRefreshTokens(userId);

  return {
    token,
    tokenId,
    familyId: resolvedFamily,
    expiresAt: expiresAt.toISOString(),
    expiresIn: getRefreshExpiresInSeconds()
  };
}

/** Evita crecimiento sin límite: conserva las sesiones más recientes. */
async function pruneUserRefreshTokens(userId) {
  try {
    const stale = await RefreshToken.find({ userId })
      .sort({ createdAt: -1 })
      .skip(MAX_SESSIONS_PER_USER)
      .select("_id")
      .lean();

    if (!stale.length) return;

    await RefreshToken.updateMany(
      { _id: { $in: stale.map((doc) => doc._id) } },
      {
        $set: {
          revokedAt: new Date(),
          revokedReason: "pruned"
        }
      }
    );
  } catch (error) {
    console.error("PRUNE_REFRESH_TOKENS_ERROR:", error.message);
  }
}

async function revokeRefreshFamily(familyId, reason = "logout") {
  if (!familyId) return 0;

  const result = await RefreshToken.updateMany(
    { familyId, revokedAt: null },
    {
      $set: {
        revokedAt: new Date(),
        revokedReason: String(reason).slice(0, 40)
      }
    }
  );

  return result.modifiedCount || 0;
}

async function revokeUserRefreshTokens(userId, reason = "logout") {
  if (!userId) return 0;

  const result = await RefreshToken.updateMany(
    { userId, revokedAt: null },
    {
      $set: {
        revokedAt: new Date(),
        revokedReason: String(reason).slice(0, 40)
      }
    }
  );

  return result.modifiedCount || 0;
}

/**
 * Valida y rota un refresh token.
 *
 * Devuelve `{ token, tokenId, familyId, userId, expiresAt }` con el
 * refresh nuevo y ya dejó revocado el anterior. Lanza errores con
 * `code` explícito para que la ruta responda 401 sin filtrar datos.
 */
async function rotateRefreshToken(rawToken, context = {}) {
  const value = typeof rawToken === "string" ? rawToken.trim() : "";

  if (!value) {
    const error = new Error("REFRESH_REQUIRED");
    error.statusCode = 401;
    error.code = "REFRESH_REQUIRED";
    throw error;
  }

  const record = await RefreshToken.findOne({
    tokenHash: hashToken(value)
  });

  if (!record) {
    const error = new Error("REFRESH_INVALID");
    error.statusCode = 401;
    error.code = "REFRESH_INVALID";
    throw error;
  }

  if (record.revokedAt) {
    // Reutilización: el token ya se rotó o se cerró sesión. Se revoca
    // la familia completa por seguridad.
    await revokeRefreshFamily(
      record.familyId,
      "reuse_detected"
    );

    const error = new Error("REFRESH_REUSED");
    error.statusCode = 401;
    error.code = "REFRESH_REUSED";
    throw error;
  }

  if (
    record.expiresAt &&
    record.expiresAt.getTime() <= Date.now()
  ) {
    const error = new Error("REFRESH_EXPIRED");
    error.statusCode = 401;
    error.code = "REFRESH_EXPIRED";
    throw error;
  }

  const next = await issueRefreshToken(
    { _id: record.userId },
    {
      familyId: record.familyId,
      userAgent: context.userAgent || record.userAgent,
      ip: context.ip || record.ip
    }
  );

  await RefreshToken.updateOne(
    { _id: record._id, revokedAt: null },
    {
      $set: {
        revokedAt: new Date(),
        revokedReason: "rotated",
        replacedBy: next.tokenId
      }
    }
  );

  return {
    ...next,
    userId: String(record.userId),
    rotatedFrom: String(record._id)
  };
}

/**
 * Emite el par completo (access + refresh) para login/registro.
 * `remember` solo describe la intención del cliente; el servidor
 * siempre entrega refresh y decide la expiración por configuración.
 */
async function issueSession(user, context = {}) {
  const refresh = await issueRefreshToken(user, context);
  const access = signSessionToken(user, { sessionId: refresh.familyId });

  return {
    token: access.token,
    tokenId: access.tokenId,
    expiresIn: access.expiresIn,
    expiresAt: access.expiresAt,
    refreshToken: refresh.token,
    refreshTokenId: refresh.tokenId,
    refreshExpiresAt: refresh.expiresAt,
    familyId: refresh.familyId
  };
}

/**
 * Una familia representa una sesión/dispositivo. Solo hay un refresh vivo
 * por familia después de cada rotación, de modo que este chequeo también
 * invalida inmediatamente el access token del dispositivo revocado.
 */
async function isRefreshFamilyActive(userId, familyId) {
  if (!userId || !familyId) return false;

  const record = await RefreshToken.exists({
    userId,
    familyId,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  });

  return Boolean(record);
}

module.exports = {
  SessionRevocation,
  RefreshToken,
  parseDuration,
  getExpiresIn,
  getExpiresInSeconds,
  signSessionToken,
  verifySessionToken,
  isSessionRevoked,
  revokeSession,
  getTokenDescriptor,
  getRefreshExpiresIn,
  getRefreshExpiresInSeconds,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshFamily,
  revokeUserRefreshTokens,
  isRefreshFamilyActive,
  issueSession,
  hashToken
};

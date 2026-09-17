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

function signSessionToken(user) {
  const secret = getSecret();
  const expiresInSeconds = getExpiresInSeconds();
  const tokenId = new mongoose.Types.ObjectId().toString();

  const token = jwt.sign(
    {
      id: user._id.toString(),
      username: user.username
    },
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

module.exports = {
  SessionRevocation,
  parseDuration,
  getExpiresIn,
  getExpiresInSeconds,
  signSessionToken,
  verifySessionToken,
  isSessionRevoked,
  revokeSession,
  getTokenDescriptor
};

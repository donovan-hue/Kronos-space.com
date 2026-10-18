const jwt = require("jsonwebtoken");
const { isProductionProcessEnv } = require("../config/environment");
const {
  isSessionRevoked,
  isRefreshFamilyActive
} = require("../modules/auth/session.service");

const COOKIE_NAME = "kronos_media_token";

function setMediaAuthCookie(res, token, expiresAt) {
  const expires = new Date(expiresAt).getTime();
  const maxAge = Number.isFinite(expires)
    ? Math.max(1000, expires - Date.now())
    : 15 * 60 * 1000;

  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(1, Math.floor(maxAge / 1000))}`
  ];

  // Fail-closed, igual que el resto de guardas del proyecto: solo `development`
  // y `test` constan como entornos sin datos reales, y cualquier otro valor de
  // NODE_ENV —incluido dejarlo sin definir— se trata como producción. Comparar
  // contra la cadena exacta "production" dejaba entregar esta cookie sin
  // `Secure` en un despliegue con NODE_ENV ausente o escrito de otra forma,
  // que es justo el caso que config/environment.js existe para cerrar.
  if (isProductionProcessEnv()) parts.push("Secure");

  res.append("Set-Cookie", parts.join("; "));
}

function clearMediaAuthCookie(res) {
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];

  // Fail-closed, igual que el resto de guardas del proyecto: solo `development`
  // y `test` constan como entornos sin datos reales, y cualquier otro valor de
  // NODE_ENV —incluido dejarlo sin definir— se trata como producción. Comparar
  // contra la cadena exacta "production" dejaba entregar esta cookie sin
  // `Secure` en un despliegue con NODE_ENV ausente o escrito de otra forma,
  // que es justo el caso que config/environment.js existe para cerrar.
  if (isProductionProcessEnv()) parts.push("Secure");

  res.append("Set-Cookie", parts.join("; "));
}

function readCookie(req) {
  const header = req.get("cookie") || "";

  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;

    if (part.slice(0, i).trim() === COOKIE_NAME) {
      return decodeURIComponent(part.slice(i + 1));
    }
  }

  return "";
}

async function readMediaAuth(req) {
  const raw = readCookie(req);
  if (!raw) return null;

  try {
    const decoded = jwt.verify(raw, process.env.JWT_SECRET, {
      algorithms: ["HS256"]
    });

    if (await isSessionRevoked(decoded, raw)) return null;

    if (
      decoded.sid &&
      !(await isRefreshFamilyActive(decoded.id, decoded.sid))
    ) {
      return null;
    }

    return { token: raw, user: decoded };
  } catch {
    return null;
  }
}

module.exports = {
  COOKIE_NAME,
  setMediaAuthCookie,
  clearMediaAuthCookie,
  readMediaAuth
};

/**
 * A-1 (cierre) — refresh token en cookie `httpOnly` + `SameSite=Lax`.
 *
 * Antes, el refresh (válido 30 días) viajaba en el JSON y el cliente web
 * lo guardaba en `localStorage`, legible por cualquier XSS. Ahora el
 * refresh SOLO viaja en esta cookie:
 *
 * - `httpOnly`: JS no puede leerla ni escribirla (document.cookie la ignora).
 * - `SameSite=Lax`: el navegador NO la envía en peticiones iniciadas desde
 *   otro sitio → CSRF neutralizado sin token adicional. Basta porque el
 *   frontend (kronos-space.com) y la API (api.kronos-space.com) comparten
 *   eTLD+1, así que las llamadas de la app sí la llevan (mismo sitio).
 * - `Path=/api/auth`: solo viaja a los endpoints de sesión, no a cada
 *   petición de la API (menos exposición, menos bytes).
 * - `Secure` en producción: solo por HTTPS. En desarrollo/test se permite
 *   HTTP (localhost y CI).
 *
 * El cuerpo JSON ya NO incluye `refreshToken`: la web nunca toca el valor.
 * El access token sigue en memoria del cliente (se necesita para el header
 * `Authorization` y el socket), con vida corta (24 h).
 */

const REFRESH_COOKIE_NAME = "kronos_refresh";

function isSecureCookies() {
  // `KRONOS_COOKIE_SECURE=1` permite forzar Secure fuera de producción
  // (staging con HTTPS); `=0` lo desactiva puntualmente para depurar.
  const override = (process.env.KRONOS_COOKIE_SECURE || "").trim();

  if (override === "1") return true;
  if (override === "0") return false;

  return process.env.NODE_ENV === "production";
}

function refreshCookieOptions(expiresAt) {
  const options = {
    httpOnly: true,
    secure: isSecureCookies(),
    sameSite: "lax",
    path: "/api/auth"
  };

  const expires = expiresAt ? new Date(expiresAt) : null;

  if (expires && !Number.isNaN(expires.getTime())) {
    options.expires = expires;
  }

  return options;
}

function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions(expiresAt));
}

/**
 * Borra la cookie. Para que el navegador la elimine, `path`/`secure`/
 * `sameSite` deben coincidir con los usados al crearla.
 */
function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecureCookies(),
    sameSite: "lax",
    path: "/api/auth"
  });
}

/** Lee el refresh desde la cookie (único canal soportado). */
function getRefreshTokenFromRequest(req) {
  const value = req.cookies?.[REFRESH_COOKIE_NAME];

  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  REFRESH_COOKIE_NAME,
  isSecureCookies,
  refreshCookieOptions,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshTokenFromRequest
};

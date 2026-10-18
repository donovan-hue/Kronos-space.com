"use strict";

/**
 * El cliente arma cada petición como `${base}/auth/login`. Si el build se
 * publicó con `VITE_API_URL=https://api.kronos-space.com` —sin el sufijo
 * `/api`— esa petición cae en el 404 «Recurso no encontrado». Es lo que
 * rompió el login y ocultó el botón de Google el 2026-10-18, en el dominio
 * y en local, con el mismo texto.
 *
 * Esta capa reescribe solo los prefijos que el cliente ya usa bajo `/api`.
 * No toca `/health`, los archivos de `/uploads`, `/.well-known` ni
 * `/socket.io`: un GET de un avatar no debe convertirse en una ruta de API.
 */

const PREFIJOS = [
  "/auth",
  "/users",
  "/search",
  "/admin",
  "/observability",
  "/export",
  "/live",
  "/support",
  "/mcp",
  "/posts",
  "/messages",
  "/conversations",
  "/notifications",
  "/moderation",
  "/drafts",
  "/collections",
  "/circles",
  "/orbits",
  "/channels",
  "/stories",
  "/capsules",
  "/pulse",
  "/analytics",
  "/music",
  "/voices",
  "/kairos",
  "/ai",
  "/flags"
];

function rutaDe(url) {
  const texto = String(url || "");
  const corte = texto.indexOf("?");
  return corte === -1 ? texto : texto.slice(0, corte);
}

function coincide(ruta, prefijo) {
  return ruta === prefijo || ruta.startsWith(`${prefijo}/`);
}

/**
 * @param {string} url ruta + query, tal como llega en `req.url`
 * @returns {string}
 */
function urlConPrefijoApi(url) {
  const texto = String(url || "");
  if (!texto) return texto;
  const ruta = rutaDe(texto);
  if (ruta === "/api" || ruta.startsWith("/api/")) return texto;
  const normalizada = texto.startsWith("/") ? texto : `/${texto}`;
  // Única ruta de API que comparte prefijo con los archivos servidos.
  if (coincide(ruta, "/uploads/audio")) return `/api${normalizada}`;
  if (!PREFIJOS.some((prefijo) => coincide(ruta, prefijo))) return texto;
  return `/api${normalizada}`;
}

function restoreApiPrefix(req, _res, next) {
  const reescrita = urlConPrefijoApi(req.url);
  if (reescrita !== req.url) req.url = reescrita;
  next();
}

module.exports = { restoreApiPrefix, urlConPrefijoApi, PREFIJOS };

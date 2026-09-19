// Única dirección pública que debe conocer y compartir un usuario.
// La API vive en un subdominio técnico, pero la aplicación, enlaces y marca
// siempre usan este origen canónico.
export const CANONICAL_WEB_ORIGIN = "https://kronos-space.com";

// Alias históricos que llegaron a servir el frontend. Se conservan solo para
// redirigir a quien tenga un enlace viejo; nunca se muestran ni se comparten.
export const LEGACY_PUBLIC_HOSTS = new Set([
  "www.kronos-space.com",
  "kronos-social-ai-client.vercel.app"
]);

function cleanHostname(value) {
  return String(value || "").trim().toLowerCase().replace(/\.$/, "");
}

/**
 * Devuelve la URL canónica cuando el navegador entró por un alias público.
 * Los previews con URL única y localhost no se redirigen para no romper QA.
 */
export function canonicalRedirectUrl(location = {}) {
  const hostname = cleanHostname(location.hostname);
  const protocol = String(location.protocol || "").toLowerCase();
  const isCanonicalHost = hostname === "kronos-space.com";

  if (!LEGACY_PUBLIC_HOSTS.has(hostname) && !(isCanonicalHost && protocol !== "https:")) {
    return null;
  }

  const pathname = String(location.pathname || "/").startsWith("/")
    ? String(location.pathname || "/")
    : `/${location.pathname}`;
  const search = String(location.search || "");
  const hash = String(location.hash || "");

  return `${CANONICAL_WEB_ORIGIN}${pathname}${search}${hash}`;
}

/** Construye enlaces externos/compartibles únicamente con el dominio oficial. */
export function publicAppUrl(path = "/") {
  return new URL(String(path || "/"), `${CANONICAL_WEB_ORIGIN}/`).href;
}

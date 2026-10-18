/**
 * KRONOS-AUDIT-003 — origen de la API del cliente.
 *
 * Reglas, en orden:
 *
 * 1. `VITE_API_URL` manda. Es la configuración explícita del despliegue
 *    (Vercel ya la usa con `https://api.kronos-space.com/api`). Si llega
 *    una URL absoluta sin el sufijo `/api`, se le añade: sin él el cliente
 *    llama a `/auth/login` y la API responde 404 «Recurso no encontrado».
 *
 * 2. En los despliegues estáticos del frontend (Cloudflare Pages sirve
 *    `kronos-space.com`, Vercel sirve la app alternativa) el `/api` relativo
 *    NO puede funcionar: son hosts de archivos estáticos, no proxean la API
 *    y rechazan los POST con **405 Method Not Allowed**. Si el build se quedó
 *    sin `VITE_API_URL`, se usa el host real de la API en lugar de un `/api`
 *    que devuelve 405 o de `http://localhost:5000` (que existiría solo en la
 *    máquina del usuario).
 *
 * 3. En desarrollo (localhost, 127.0.0.1, el preview del sandbox, cualquier
 *    otro host) se mantiene `/api` relativo y el proxy de `vite.config.js`
 *    sigue siendo el que habla con el backend local. Sin cambios de
 *    comportamiento.
 */

export const PRODUCTION_API_URL = "https://api.kronos-space.com/api";

/** Hosts públicos explícitos. Un preview/tenant ajeno NO hereda producción.
 * Los previews estáticos requieren VITE_API_URL de su entorno de pruebas.
 */
export const STATIC_FRONTEND_HOSTS = [
  "kronos-space.com",
  "www.kronos-space.com",
  "kronos-social-ai-client.vercel.app"
];

function normalizeHost(hostname) {
  return String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
}

/** ¿El frontend se está sirviendo desde un host estático conocido? */
export function isStaticFrontendHost(hostname) {
  const host = normalizeHost(hostname);

  if (!host) return false;

  return STATIC_FRONTEND_HOSTS.includes(host);
}

/**
 * Base de la API para el cliente.
 *
 * @param {{ configured?: string, hostname?: string }} [context]
 * @returns {string} URL sin barra final.
 */
/**
 * Toda ruta del servidor vive bajo `/api`. Una base absoluta sin ese
 * sufijo (`https://api.kronos-space.com` o `http://localhost:5000`) hace
 * que el login y `/auth/google/config` caigan en el 404 de ruta.
 * @param {string} url
 * @returns {string}
 */
export function ensureApiSuffix(url) {
  const trimmed = String(url || "").trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "/api" || trimmed.endsWith("/api")) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return `${trimmed}/api`;
  return trimmed;
}

export function resolveApiUrl(context = {}) {
  const configured = String(context.configured || "").trim();

  if (configured) {
    return ensureApiSuffix(configured);
  }

  return isStaticFrontendHost(context.hostname) ? PRODUCTION_API_URL : "/api";
}

/** Hostname actual del navegador (cadena vacía fuera del navegador). */
export function currentHostname() {
  try {
    return typeof window === "undefined" ? "" : window.location.hostname;
  } catch {
    return "";
  }
}

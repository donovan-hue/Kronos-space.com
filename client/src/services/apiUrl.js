/**
 * KRONOS-AUDIT-003 — origen de la API del cliente.
 *
 * Reglas, en orden:
 *
 * 1. `VITE_API_URL` manda. Es la configuración explícita del despliegue
 *    (Vercel ya la usa con `https://api.kronos-space.com/api`).
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

/** Hosts del frontend servidos como sitio estático (nunca proxean `/api`). */
export const STATIC_FRONTEND_HOSTS = [
  "kronos-space.com",
  "vercel.app"
];

function normalizeHost(hostname) {
  return String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
}

function matchesHost(host, suffix) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/** ¿El frontend se está sirviendo desde un host estático conocido? */
export function isStaticFrontendHost(hostname) {
  const host = normalizeHost(hostname);

  if (!host) return false;

  return STATIC_FRONTEND_HOSTS.some((suffix) => matchesHost(host, suffix));
}

/**
 * Base de la API para el cliente.
 *
 * @param {{ configured?: string, hostname?: string }} [context]
 * @returns {string} URL sin barra final.
 */
export function resolveApiUrl(context = {}) {
  const configured = String(context.configured || "").trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
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

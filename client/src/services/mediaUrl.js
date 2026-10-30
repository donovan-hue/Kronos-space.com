import { API_URL } from "./apiClient";

/**
 * Ruta pública de un archivo subido, siempre absoluta cuando se puede saber.
 *
 * `/uploads/...` lo sirve el backend, no el frontend; por eso la base es la URL
 * de la API. Cuando `VITE_API_URL` llega absoluta (Vercel, el despliegue real)
 * no hay ambigüedad. Cuando es `/api` relativo, la base es el origen desde el
 * que se sirve la app —en desarrollo, el proxy de vite.config.js también
 * expone `/uploads`, así que dejar la ruta tal cual sigue funcionando—.
 *
 * Ya no queda reserva `http://localhost:3000`: un origen inventado produce URLs
 * que solo cargan en la máquina de quien programa y se ven como imagen rota en
 * cualquier otro sitio (móvil en la red local, preview, producción). Sin origen
 * y sin base absoluta se devuelve la ruta sin tocar, que es lo que el navegador
 * puede resolver y lo que no miente.
 */
export function mediaUrl(
  value,
  apiUrl = API_URL,
  origin = typeof window !== "undefined" && window?.location?.origin ? window.location.origin : ""
) {
  if (typeof value !== "string" || !value.startsWith("/uploads/")) return value || "";

  const base = /^https?:\/\//i.test(apiUrl) ? apiUrl : origin;
  const absoluta = base ? new URL(value, new URL(apiUrl || "/", base)).href : "";

  return absoluta || value;
}

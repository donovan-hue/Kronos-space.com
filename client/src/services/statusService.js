import { API_URL } from "./apiClient";

/**
 * Lectura del estado del servicio.
 *
 * Usa `fetch` en lugar del cliente `api` compartido: el estado se consulta sin
 * sesión, no debe participar del ciclo de refresco de tokens ni consumir el
 * presupuesto de las rutas autenticadas, y tiene que seguir respondiendo cuando
 * la API esté justo lo bastante mal como para que el refresco falle.
 */
export async function getServiceHealth() {
  try {
    const response = await fetch(`${API_URL}/health`, {
      headers: { Accept: "application/json" },
      credentials: "omit",
      cache: "no-store"
    });
    const data = await response.json().catch(() => null);

    return {
      reachable: true,
      status: response.status,
      ok: Boolean(data?.ok),
      database: data?.database || "desconocido",
      realtime: Boolean(data?.realtime),
      build: data?.build || null,
      startedAt: data?.startedAt || data?.build?.startedAt || null,
      timestamp: data?.timestamp || null
    };
  } catch {
    return { reachable: false, ok: false, status: 0, database: "sin respuesta", realtime: false };
  }
}

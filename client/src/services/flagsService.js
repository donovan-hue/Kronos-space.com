import { api } from "./apiClient";

/**
 * Fase 0 (restos) — feature flags del servidor.
 *
 * Defaults en true: si el servidor no responde, la app no pierde
 * funciones. El endpoint /api/flags solo dice qué está encendido.
 *
 * Los flags se piden cuatro veces al arrancar (menú, barra inferior, cajón y
 * la guarda de rutas) y no cambian sin un despliegue: se comparten una sola
 * promesa para que las cuatro vean el mismo conjunto y no haya pantallas que
 * digan «encendido» mientras el menú dice «apagado».
 */
export const DEFAULT_FLAGS = {
  aiComposer: true,
  capsules: true,
  pulse: true,
  vertical: true,
  analytics: true,
  archive: true
};

let enVuelo = null;

/**
 * Pide los flags una sola vez por carga de página. Un fallo NO se cachea:
 * la siguiente vista vuelve a intentarlo en lugar de quedarse con «todo
 * encendido» para siempre.
 */
export function getFeatureFlags() {
  if (!enVuelo) {
    enVuelo = api
      .get("/flags")
      .then(({ data }) => ({ ...DEFAULT_FLAGS, ...(data?.flags || {}) }))
      .catch(() => {
        enVuelo = null;
        return { ...DEFAULT_FLAGS };
      });
  }
  return enVuelo;
}

/** Solo para pruebas: olvida la promesa compartida. */
export function resetFeatureFlagsCache() {
  enVuelo = null;
}

import { QueryClient, notifyManager } from "@tanstack/react-query";

/**
 * Fábrica del QueryClient de KRONOS.
 *
 * Decisiones:
 * - staleTime 30s: la información social no necesita refetch inmediato en
 *   cada montaje; gcTime 5 min conserva listas al navegar entre pantallas.
 * - retry solo para fallos de red (sin respuesta HTTP): los 4xx son
 *   decisiones del backend (404/403/401) que no cambian al reintentar.
 *   El 401 ya lo gestiona apiClient con renovación de sesión.
 * - refetchOnWindowFocus activo (con staleTime): al volver a la app los
 *   datos obsoletos se refrescan — comportamiento esperado en una red
 *   social.
 */
export function createQueryClient(overrides = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          if (!error?.response && !error?.status) {
            // Fallo de red / timeout: un reintento extra.
            return failureCount < 1;
          }
          const status = error?.response?.status ?? error?.status;
          return typeof status === "number" && status >= 500 && failureCount < 1;
        },
        refetchOnWindowFocus: true,
        ...overrides.queries,
      },
      mutations: {
        retry: false,
        ...overrides.mutations,
      },
    },
  });
}

/** Cliente para tests: sin reintentos ni refetch automático. */
export function createTestQueryClient() {
  // En pruebas las notificaciones del caché deben despacharse de forma
  // síncrona: el scheduler por defecto usa una macrotask (MessageChannel)
  // que cae fuera del act() de React y deja resultados obsoletos en los
  // asserts inmediatos. Este es el ajuste recomendado para testear
  // TanStack Query; solo afecta al entorno de pruebas.
  notifyManager.setScheduler((callback) => callback());
  return createQueryClient({
    queries: {
      retry: false,
      gcTime: Infinity,
      staleTime: 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });
}

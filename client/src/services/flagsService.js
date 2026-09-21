import { api } from "./apiClient";

/**
 * Fase 0 (restos) — feature flags del servidor.
 *
 * Defaults en true: si el servidor no responde, la app no pierde
 * funciones. El endpoint /api/flags solo dice qué está encendido.
 */
export const DEFAULT_FLAGS = {
  aiComposer: true,
  capsules: true,
  pulse: true,
  vertical: true,
  analytics: true,
  archive: true
};

export async function getFeatureFlags() {
  try {
    const { data } = await api.get("/flags");
    return { ...DEFAULT_FLAGS, ...(data?.flags || {}) };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

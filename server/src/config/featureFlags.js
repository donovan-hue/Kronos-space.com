/**
 * FASE 0 (restos) — feature flags.
 *
 * Una función nueva se libera tras un flag y el default vive aquí, en el
 * código. Producción puede apagar o prender cada flag con variables de
 * entorno `FEATURE_FLAG_<NOMBRE>=true|false` sin tocar la base ni
 * reescribir código. No hay flags por usuario: eso sería segmentación,
 * no liberación.
 */

// Defaults deliberados: todo lo ya publicado en el dominio va encendido.
const DEFAULT_FLAGS = {
  aiComposer: true,
  capsules: true,
  pulse: true,
  vertical: true,
  analytics: true,
  archive: true
};

const FLAG_PATTERN = /^FEATURE_FLAG_([A-Z0-9_]+)$/;

function parseBoolean(raw, fallback) {
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return fallback;
}

/**
 * Flags vigentes: defaults + overrides de entorno.
 */
/**
 * `FEATURE_FLAG_PULSE` y `FEATURE_FLAG_AI_COMPOSER` (o `AICOMPOSER`)
 * deben encontrar la clave camelCase del default. Antes solo coincidía
 * el nombre ya en minúsculas, así que `aiComposer` no se podía apagar.
 */
function flagNameFromEnv(raw) {
  const lower = String(raw || "").toLowerCase();
  const camel = lower.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  const keys = Object.keys(DEFAULT_FLAGS);

  return keys.find((key) => key === lower || key === camel || key.toLowerCase() === lower) || null;
}

function getFeatureFlags(env = process.env) {
  const flags = { ...DEFAULT_FLAGS };
  for (const key of Object.keys(env)) {
    const match = FLAG_PATTERN.exec(key);
    if (!match) continue;
    const name = flagNameFromEnv(match[1]);
    if (name) {
      flags[name] = parseBoolean(env[key], DEFAULT_FLAGS[name]);
    }
  }
  return flags;
}

function isFeatureEnabled(name, env = process.env) {
  const flags = getFeatureFlags(env);
  return Boolean(flags[name]);
}

module.exports = { getFeatureFlags, isFeatureEnabled, DEFAULT_FLAGS, flagNameFromEnv };

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
function getFeatureFlags(env = process.env) {
  const flags = { ...DEFAULT_FLAGS };
  for (const key of Object.keys(env)) {
    const match = FLAG_PATTERN.exec(key);
    if (!match) continue;
    const name = match[1].toLowerCase();
    if (Object.prototype.hasOwnProperty.call(DEFAULT_FLAGS, name)) {
      flags[name] = parseBoolean(env[key], DEFAULT_FLAGS[name]);
    }
  }
  return flags;
}

function isFeatureEnabled(name, env = process.env) {
  const flags = getFeatureFlags(env);
  return Boolean(flags[name]);
}

module.exports = { getFeatureFlags, isFeatureEnabled, DEFAULT_FLAGS };

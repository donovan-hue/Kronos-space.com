const { classifyFile } = require("./classify");

/**
 * Rutas donde un error es irreversible o abre una guarda en silencio.
 *
 * Se tratan como riesgo crítico de observación: el guardián los reporta, pero no
 * bloquea automáticamente el pipeline. La decisión de bloquear sigue siendo
 * manual y explícita para no convertir cada PR en un fallo de CI.
 */
const RUTAS_CRITICAS = [
  "server/src/modules/capsules/capsule.crypto.js",
  "server/src/config/environment.js",
  "server/src/migrations/runner.js",
  "server/src/middleware/mediaAuth.js",
  "server/src/config/durableUploads.js"
];

const ZONAS = {
  server: "LOW",
  client: "LOW",
  guardian: "MEDIUM",
  scripts: "MEDIUM",
  config: "MEDIUM",
  other: "LOW"
};

function esRutaCritica(filename) {
  const ruta = String(filename || "");
  return RUTAS_CRITICAS.some((critica) => ruta === critica || ruta.endsWith(`/${critica}`));
}

function normalizeFilename(filename) {
  const value = String(filename || "").trim();
  if (!value) return "";
  return value.replace(/^\.?\//, "");
}

function evaluateRisk(files) {
  const items = [];

  for (const f of files || []) {
    const filename = normalizeFilename(f?.filename);
    const zone = classifyFile(filename);
    const reasons = [];
    let level = ZONAS[zone] || "LOW";

    if (esRutaCritica(filename)) {
      level = "CRITICAL";
      reasons.push(
        "Ruta crítica: un error aquí es irreversible o desactiva varias guardas a la vez"
      );
    }

    if (zone === "server") {
      if (filename.includes("auth") || filename.includes("middleware")) {
        if (level === "LOW") level = "HIGH";
        reasons.push("Cambio en autenticación/middleware del servidor");
      }
      if (
        filename.includes("db") ||
        filename.includes("database") ||
        filename.includes("migrations")
      ) {
        if (level === "LOW") level = "MEDIUM";
        reasons.push("Cambio en acceso o esquema de base de datos");
      }
    }

    if (zone === "config") {
      if (level === "LOW") level = "MEDIUM";
      reasons.push("Cambio en configuración/CI/environments");
    }

    if (zone === "scripts" || zone === "guardian") {
      if (level === "LOW") level = "MEDIUM";
      reasons.push(
        zone === "guardian"
          ? "Cambio en las reglas del propio guardián"
          : "Cambio en una herramienta de operación (puede escribir en la base)"
      );
    }

    if (zone === "client") {
      if (filename.includes("auth") || filename.includes("login")) {
        if (level === "LOW") level = "MEDIUM";
        reasons.push("Cambio en flujo de autenticación del cliente");
      }
    }

    if (reasons.length > 0) {
      items.push({ file: filename, zone, level, reasons });
    }
  }

  return { overall: aggregateOverallRisk(items), items };
}

function aggregateOverallRisk(items) {
  let max = "LOW";
  const priority = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

  for (const item of items || []) {
    if (priority.indexOf(item.level) > priority.indexOf(max)) {
      max = item.level;
    }
  }

  return max;
}

module.exports = {
  evaluateRisk,
  aggregateOverallRisk,
  esRutaCritica,
  RUTAS_CRITICAS,
  normalizeFilename
};

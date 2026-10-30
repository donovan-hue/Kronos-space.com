const { classifyFile } = require("./classify");
const { ETIQUETA_APROBACION } = require("./aprobaciones");
const { esCambioSoloComentarios } = require("./parche");

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

/**
 * Rutas que no bloquean el merge, pero sí exigen vigilancia porque tocan
 * arranque, sesión o la navegación del cliente en puntos muy centrales.
 */
const RUTAS_VIGILADAS = [
  "client/src/App.jsx",
  "client/src/navigation/model.jsx",
  "client/src/services/apiClient.js",
  "client/src/services/authStorage.js"
];

const ZONAS = {
  server: "LOW",
  client: "LOW",
  guardian: "MEDIUM",
  scripts: "MEDIUM",
  config: "MEDIUM",
  other: "LOW"
};

function coincideSufijo(ruta, lista) {
  const limpio = String(ruta || "");
  return lista.some((entrada) => limpio === entrada || limpio.endsWith(`/${entrada}`));
}

function esRutaCritica(filename) {
  return coincideSufijo(filename, RUTAS_CRITICAS);
}

function esRutaVigilada(filename) {
  return coincideSufijo(filename, RUTAS_VIGILADAS);
}

function normalizeFilename(filename) {
  const value = String(filename || "").trim();
  if (!value) return "";
  return value.replace(/^\.?\//, "");
}

function evaluateRisk(files, opciones = {}) {
  const items = [];
  const aprobada = opciones.aprobacion === true;

  for (const f of files || []) {
    const filename = normalizeFilename(f?.filename);
    const zone = classifyFile(filename);
    const reasons = [];
    let level = ZONAS[zone] || "LOW";

    if (esRutaCritica(filename)) {
      reasons.push(
        "Ruta crítica: un error aquí es irreversible o desactiva varias guardas a la vez"
      );

      const inocuo = esCambioSoloComentarios(filename, f?.patch);
      if (inocuo) {
        level = "HIGH";
        reasons.push(
          "El diff no toca una sola línea ejecutable: solo comentarios o espacios en blanco"
        );
      } else if (aprobada) {
        level = "HIGH";
        reasons.push(
          `CRITICAL reconocido por la etiqueta \`${ETIQUETA_APROBACION}\`: la revisión la asume quien la aplicó y queda en el historial de la pull request`
        );
      } else {
        level = "CRITICAL";
        reasons.push(
          `Ninguna aprobación registrada: aplicar la etiqueta \`${ETIQUETA_APROBACION}\` a la PR es la salida prevista después de leer el cambio`
        );
      }
    }

    if (esRutaVigilada(filename)) {
      if (level === "LOW" || level === "MEDIUM") level = "HIGH";
      reasons.push("Ruta vigilada: de ella cuelgan el arranque de la app o la sesión del cliente");
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
  esRutaVigilada,
  RUTAS_CRITICAS,
  RUTAS_VIGILADAS,
  normalizeFilename
};


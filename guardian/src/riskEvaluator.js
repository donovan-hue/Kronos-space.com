const { classifyFile } = require("./diffAnalyzer");

// Calcula el nivel de riesgo por archivo y un nivel general
function evaluateRisk(files) {
  const items = [];

  for (const f of files) {
    const zone = classifyFile(f.filename);
    const reasons = [];
    let level = "LOW";

    // Reglas simples de ejemplo
    if (zone === "server") {
      if (f.filename.includes("auth") || f.filename.includes("middleware")) {
        level = "HIGH";
        reasons.push("Cambio en autenticación/middleware del servidor");
      }
      if (
        f.filename.includes("db") ||
        f.filename.includes("database") ||
        f.filename.includes("migrations")
      ) {
        if (level === "LOW") level = "MEDIUM";
        reasons.push("Cambio en acceso o esquema de base de datos");
      }
    }

    if (zone === "config") {
      if (level === "LOW") level = "MEDIUM";
      reasons.push("Cambio en configuración/CI/environments");
    }

    if (zone === "client") {
      if (f.filename.includes("auth") || f.filename.includes("login")) {
        if (level === "LOW") level = "MEDIUM";
        reasons.push("Cambio en flujo de autenticación del cliente");
      }
    }

    // Solo guardamos archivos que tengan alguna razón de riesgo
    if (reasons.length > 0) {
      items.push({ file: f.filename, zone, level, reasons });
    }
  }

  const overall = aggregateOverallRisk(items);

  return { overall, items };
}

function aggregateOverallRisk(items) {
  let max = "LOW";
  const priority = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

  for (const it of items) {
    if (priority.indexOf(it.level) > priority.indexOf(max)) {
      max = it.level;
    }
  }

  return max;
}

module.exports = {
  evaluateRisk
};

const { getChangedFiles } = require("./diffAnalyzer");
const { evaluateRisk } = require("./riskEvaluator");
const { postReportComment } = require("./reporter");
const { ETIQUETA_APROBACION, etiquetasDelEvento, hayAprobacion } = require("./aprobaciones");

async function main() {
  try {
    const files = await getChangedFiles();

    if (!files || files.length === 0) {
      console.log("No changed files detected.");
      return;
    }

    const etiquetas = etiquetasDelEvento();
    const aprobacion = hayAprobacion(etiquetas);
    const report = evaluateRisk(files, { aprobacion });
    report.aprobacion = { activa: aprobacion, etiquetas };

    console.log("Risk report:", JSON.stringify(report, null, 2));

    await postReportComment(report);

    // Riesgo CRITICAL = bloquear el merge. La única forma de pasar con rutas
    // críticas tocadas es que alguien con permiso aplique la etiqueta en la PR
    // (ver ./aprobaciones): el guardián no la aplica nunca por su cuenta.
    if (report.overall === "CRITICAL") {
      const aviso = aprobacion
        ? ""
        : ` (sin la etiqueta \`${ETIQUETA_APROBACION}\`)`;
      console.error(
        `Critical risk detected${aviso}. Failing job. ` +
        "Las rutas críticas se destraban leyéndolas y aplicando la etiqueta en la PR."
      );
      process.exit(1);
    }
  } catch (err) {
    console.error("Guardian failed:", err);
    process.exit(1);
  }
}

main();



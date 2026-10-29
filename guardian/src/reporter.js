const { octokit, getRepoContext } = require("./githubClient");

async function postReportComment(report) {
  const { owner, repo, prNumber } = getRepoContext();

  if (!prNumber) {
    console.log("No PR context, skipping comment.");
    return;
  }

  const lines = [];

  lines.push("### Kronos Guardian Report\n");
  lines.push(`**Nivel de riesgo general:** ${report.overall}`);

  if (report.aprobacion?.activa) {
    lines.push(
      "Riesgo CRITICAL reconocido por la etiqueta `riesgo-crítico-revisado`: " +
      "la revisión la asume quien la aplicó y su rastro está en el historial de esta PR."
    );
  }

  lines.push("");

  if (!report.items || report.items.length === 0) {
    lines.push("No se detectaron cambios críticos en auth/DB/config.");
  } else {
    lines.push("**Archivos sensibles detectados:**");
    lines.push("");

    for (const item of report.items) {
      lines.push(`- \\\`${item.file}\\\` (zona: ${item.zone}, riesgo: ${item.level})`);
      for (const r of item.reasons) {
        lines.push(`    - ${r}`);
      }
    }
  }

  const body = lines.join("\n");

  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body
  });
}

module.exports = {
  postReportComment
};

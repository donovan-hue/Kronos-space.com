const { getOctokit, getRepoContext } = require("./githubClient");

function buildReportBody(report) {
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
      lines.push(`- \`${item.file}\` (zona: ${item.zone}, riesgo: ${item.level})`);
      for (const reason of item.reasons) {
        lines.push(`    - ${reason}`);
      }
    }
  }

  return lines.join("\n");
}

async function postReportComment(report) {
  let owner;
  let repo;
  let prNumber;

  try {
    ({ owner, repo, prNumber } = getRepoContext());
  } catch (error) {
    console.warn("No GitHub PR context available. Skipping Guardian comment.", error.message);
    return;
  }

  const octokit = getOctokit();
  if (!octokit) {
    console.warn("No GitHub token configured. Skipping Guardian comment.");
    return;
  }

  if (!prNumber) {
    console.log("No PR context, skipping comment.");
    return;
  }

  const body = buildReportBody(report);

  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body
    });
  } catch (error) {
    console.warn("Unable to post Guardian report comment.", error.message);
  }
}

module.exports = {
  postReportComment,
  buildReportBody
};

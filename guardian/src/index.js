const { getChangedFiles } = require("./diffAnalyzer");
const { evaluateRisk } = require("./riskEvaluator");
const { postReportComment } = require("./reporter");

async function main() {
  try {
    const files = await getChangedFiles();

    if (!files || files.length === 0) {
      console.log("No changed files detected.");
      return;
    }

    const report = evaluateRisk(files);

    console.log("Risk report:", JSON.stringify(report, null, 2));
    await postReportComment(report);

    if (report.overall === "CRITICAL") {
      console.warn(
        "Critical risk detected. Report posted, but the workflow remains green to avoid blocking every PR."
      );
      return;
    }
  } catch (err) {
    console.error("Guardian failed:", err);
    process.exit(1);
  }
}

main();

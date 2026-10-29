const { octokit, getRepoContext } = require("./githubClient");
// `classifyFile` vive en ./classify, que es puro y no arrastra el cliente de
// GitHub. Se reexporta más abajo para no romper quien ya lo importa de aquí.
const { classifyFile } = require("./classify");

async function getChangedFiles() {
  const { owner, repo, prNumber } = getRepoContext();

  if (!prNumber) {
    console.log("No PR context detected. Skipping.");
    return [];
  }

  const files = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const res = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: perPage,
      page
    });

    if (res.data.length === 0) break;

    for (const f of res.data) {
      // `patch` llega en la propia respuesta de listFiles. Se pasa tal cual:
      // quien decide si un cambio es inofensivo es riskEvaluator, y si el campo
      // faltara el veredicto es «no inofensivo», nunca lo contrario.
      files.push({ filename: f.filename, status: f.status || "modified", patch: f.patch });
    }

    if (res.data.length < perPage) break;
    page++;
  }

  return files;
}

module.exports = {
  getChangedFiles,
  classifyFile
};


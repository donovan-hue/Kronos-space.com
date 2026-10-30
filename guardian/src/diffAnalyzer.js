const { getOctokit, getRepoContext } = require("./githubClient");
// `classifyFile` vive en ./classify, que es puro y no arrastra el cliente de
// GitHub. Se reexporta más abajo para no romper quien ya lo importa de aquí.
const { classifyFile } = require("./classify");

async function getChangedFiles() {
  let owner;
  let repo;
  let prNumber;

  try {
    ({ owner, repo, prNumber } = getRepoContext());
  } catch (error) {
    console.warn("No GitHub PR context available. Skipping guardian diff analysis.", error.message);
    return [];
  }

  if (!prNumber) {
    console.log("No PR context detected. Skipping.");
    return [];
  }

  const octokit = getOctokit();
  if (!octokit) {
    console.warn("No GitHub token configured. Skipping PR file diff.");
    return [];
  }

  const files = [];
  let page = 1;
  const perPage = 100;

  try {
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
        files.push({ filename: f.filename, status: f.status || "modified" });
      }

      if (res.data.length < perPage) break;
      page += 1;
    }
  } catch (error) {
    console.warn("Failed to fetch changed files from GitHub.", error.message);
    return [];
  }

  return files;
}

module.exports = {
  getChangedFiles,
  classifyFile
};

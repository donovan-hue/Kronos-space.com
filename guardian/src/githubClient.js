const { Octokit } = require("@octokit/rest");
const fs = require("fs");

const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error("GITHUB_TOKEN env var is required");
}

const octokit = new Octokit({ auth: token });

function getRepoContext() {
  const repoFull = process.env.GITHUB_REPOSITORY || ""; // owner/repo
  const [owner, repo] = repoFull.split("/");

  if (!owner || !repo) {
    throw new Error("Could not determine owner/repo from GITHUB_REPOSITORY");
  }

  // Leer número de PR desde el payload del evento de GitHub
  let prNumber = null;
  try {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (eventPath && fs.existsSync(eventPath)) {
      const raw = fs.readFileSync(eventPath, "utf8");
      const event = JSON.parse(raw);
      if (event.pull_request && event.pull_request.number) {
        prNumber = event.pull_request.number;
      }
    }
  } catch (e) {
    console.log("Could not read PR number from event payload", e);
  }

  return { owner, repo, prNumber };
}

module.exports = {
  octokit,
  getRepoContext
};


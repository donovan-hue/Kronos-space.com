const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const SCRIPT = path.join(__dirname, "..", "..", "scripts", "backup-verify.js");

test("el respaldo verificable exige MONGODB_URI y no simula nada", () => {
  let status = 0;
  let output = "";
  try {
    output = execFileSync("node", [SCRIPT], {
      encoding: "utf8",
      env: { ...process.env, MONGODB_URI: "" },
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    status = error.status;
    output = `${error.stdout || ""}${error.stderr || ""}`;
  }
  assert.equal(status, 1, "sin URI debe fallar con código 1");
  assert.match(output, /BACKUP_FAIL/);
  assert.match(output, /MONGODB_URI/);
});

test("el script implementa checksum y verificación de manifiesto", () => {
  const source = require("node:fs").readFileSync(SCRIPT, "utf8");
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /manifest\.json/);
  assert.match(source, /--check/);
  assert.match(source, /documents\.length !== entry\.count/, "el conteo de documentos se verifica");
});

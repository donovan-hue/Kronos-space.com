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

// Fixtures de archivos para probar el verificador CLI real, no un respaldo
// de MongoDB ni una prueba de restauración de datos de producción.
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

function withBackup(mode, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kronos-backup-contract-"));
  const content = mode === "json" ? '[{"fixture":true}]' : "archive-fixture-not-real-mongodump";
  const name = mode === "json" ? "items.json" : "dump.archive";
  const sha256 = crypto.createHash("sha256").update(content).digest("hex");
  const bytes = Buffer.byteLength(content);
  const manifest = mode === "json"
    ? { mode, collections: { items: { count: 1, sha256, bytes } } }
    : { mode, archive: name, sha256, bytes, collections: { items: 1 } };
  fs.writeFileSync(path.join(dir, name), content);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  const check = () => spawnSync(process.execPath, [SCRIPT, "--check", dir], { encoding: "utf8" });
  try { run({ dir, name, manifest, check }); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

for (const mode of ["json", "mongodump"]) {
  test(`--check selecciona el verificador ${mode} sin conectar a MongoDB`, () => {
    withBackup(mode, ({ check }) => {
      const result = check();
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /1 colecciones, 1 documentos/);
    });
  });

  test(`--check rechaza corrupción en ${mode}`, () => {
    withBackup(mode, ({ check, dir, name }) => {
      fs.appendFileSync(path.join(dir, name), "corrupted");
      const result = check();
      assert.equal(result.status, 1);
      assert.match(result.stderr, /BACKUP_FAIL/);
    });
  });
}

test("--check rechaza modo desconocido sin intentar otro formato", () => {
  withBackup("json", ({ check, dir, manifest }) => {
    manifest.mode = "unknown";
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    const result = check();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Modo de respaldo no soportado/);
  });
});

test("--check rechaza conteo JSON incorrecto aun si el checksum coincide", () => {
  withBackup("json", ({ check, dir, manifest }) => {
    manifest.collections.items.count = 2;
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    const result = check();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /manifiesto espera 2/);
  });
});

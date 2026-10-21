const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { deploymentTarget, httpsOrigin } = require("../../scripts/ci/deployment-target");

const preview = "https://kronos-space-a1b2-oficialkronosspace-1215.vercel.app";
const event = (environment = "Preview", url = preview, state = "success") => ({
  deployment: { environment, production_environment: false },
  deployment_status: { state, environment_url: url, target_url: "https://vercel.com/logs" }
});

test("post-deploy: preview terminada verifica su URL y CORS, no el frontend de producción", () => {
  assert.deepEqual(deploymentTarget("deployment_status", event()), {
    mode: "preview", base: "https://api.kronos-space.com", frontend: preview,
    origins: preview, require_frontend_origin: "1"
  });
});

test("post-deploy: Production se reconoce aunque Vercel envíe production_environment=false", () => {
  for (const name of ["Production", "production", "Production – Kronos"]) {
    const target = deploymentTarget("deployment_status", event(name));
    assert.equal(target.mode, "production");
    assert.equal(target.frontend, "https://kronos-space.com");
    assert.equal(target.origins, "https://kronos-space.com,https://www.kronos-space.com");
  }
});

test("post-deploy: Preview con sufijo conserva su URL única", () => {
  assert.equal(deploymentTarget("deployment_status", event("Preview – Kronos")).frontend, preview);
});

for (const url of [undefined, "", "http://kronos-space-a1b2-oficialkronosspace-1215.vercel.app",
  "https://vercel.com/logs", "https://other-project.vercel.app", "https://kronos-space.com",
  `${preview}.attacker.test`, `${preview}/logs`, `${preview}?token=private`, `${preview}#test`,
  "https://user:password@kronos-space-a1b2-oficialkronosspace-1215.vercel.app"] ) {
  test(`post-deploy: no verifica una preview con origen inválido (${url === undefined ? "ausente" : url})`, () => {
    const payload = event();
    payload.deployment_status.environment_url = url;
    assert.throws(() => deploymentTarget("deployment_status", payload));
  });
}

for (const state of ["pending", "queued", "in_progress", "failure", "error", "inactive"]) {
  test(`post-deploy: ${state} no puede certificarse como success`, () => {
    assert.throws(() => deploymentTarget("deployment_status", event("Production", preview, state)), /Solo se verifican/);
  });
}

test("post-deploy: entorno desconocido no se disfraza de producción", () => {
  for (const name of ["", "Staging", "ProductionImpostor", "PreviewImpostor"]) {
    assert.throws(() => deploymentTarget("deployment_status", event(name)), /Entorno.*no reconocido/);
  }
  assert.throws(() => deploymentTarget("pull_request", event()), /Solo se verifican/);
});

test("post-deploy: consulta manual mantiene parámetros explícitos y valida orígenes", () => {
  const target = deploymentTarget("workflow_dispatch", { inputs: {
    base: "https://api.example.com/", frontend: "https://example.com/",
    origins: "https://example.com, https://www.example.com"
  } });
  assert.equal(target.base, "https://api.example.com");
  assert.equal(target.frontend, "https://example.com");
  assert.equal(target.origins, "https://example.com,https://www.example.com");
  assert.equal(deploymentTarget("workflow_dispatch", {}).frontend, "https://kronos-space.com");
});

test("post-deploy: rechaza IPs, loopback, puertos y credenciales en inputs manuales", () => {
  for (const url of ["https://127.0.0.1", "https://[::1]", "https://localhost", "https://host.local", "https://host.internal",
    "https://example.com:8443", "https://user:pass@example.com", "https://example.com/path"]) {
    assert.throws(() => httpsOrigin(url));
  }
});

test("post-deploy: el CLI real escribe outputs seguros sin interpolar el payload en shell", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kronos-deploy-target-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, "event.json");
  const output = path.join(dir, "output.txt");
  fs.writeFileSync(input, JSON.stringify(event()));
  const result = spawnSync(process.execPath, [path.resolve(__dirname, "../../scripts/ci/deployment-target.js")], {
    env: { ...process.env, GITHUB_EVENT_NAME: "deployment_status", GITHUB_EVENT_PATH: input, GITHUB_OUTPUT: output },
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(output, "utf8"), new RegExp(`^frontend=${preview.replaceAll(".", "\\.")}$`, "m"));
  assert.match(fs.readFileSync(output, "utf8"), /^require_frontend_origin=1$/m);
});

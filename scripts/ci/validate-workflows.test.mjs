import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseWorkflow, validateWorkflows } from "./validate-workflows.mjs";

test("accepts GitHub expressions, on keys and multiline shell commands", () => {
  const workflow = parseWorkflow('on: [push, pull_request]\njobs:\n  build:\n    if: ${{ github.ref }}\n    steps:\n      - run: |\n          echo hello\n          echo world\n', "valid.yml");
  assert.deepEqual(workflow.on, ["push", "pull_request"]);
});

test("rejects duplicate keys at every mapping depth", () => {
  for (const source of [
    "name: first\nname: second\n",
    "jobs:\n  build:\n    timeout-minutes: 25\n    timeout-minutes: 20\n",
    "jobs:\n  build:\n    steps:\n      - run: first\n        run: second\n"
  ]) assert.throws(() => parseWorkflow(source, "duplicate.yml"), /duplicated mapping key/);
});

test("rejects invalid YAML and non-mapping documents", () => {
  assert.throws(() => parseWorkflow("jobs: [\n", "invalid.yml"), /invalid.yml/);
  for (const source of ["", "hello", "- item"]) {
    assert.throws(() => parseWorkflow(source, "invalid.yml"), /expected a workflow mapping/);
  }
});

test("checks yml and yaml files, aggregates failures, and rejects an empty directory", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "kronos-workflows-"));
  try {
    assert.throws(() => validateWorkflows(directory), /No workflows found/);
    writeFileSync(path.join(directory, "one.yml"), "name: one\nname: two\n");
    writeFileSync(path.join(directory, "two.yaml"), "jobs: [\n");
    writeFileSync(path.join(directory, "ignored.md"), "not yaml");
    assert.throws(() => validateWorkflows(directory), (error) => {
      assert.match(error.message, /one.yml/);
      assert.match(error.message, /two.yaml/);
      return true;
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CI preserves workflow triggers and shares its single build with CSS validation", () => {
  const directory = fileURLToPath(new URL("../../.github/workflows/", import.meta.url));
  validateWorkflows(directory);
  const ci = parseWorkflow(readFileSync(path.join(directory, "ci.yml"), "utf8"), "ci.yml");
  for (const event of ["push", "pull_request"]) {
    const ignores = ci.on[event]["paths-ignore"];
    assert.ok(!ignores.some((pattern) => pattern.startsWith(".github/")));
  }
  const build = ci.jobs.build.steps;
  assert.equal(build.filter((step) => step.run === "npm run build").length, 1);
  assert.ok(build.some((step) => step.run === "npm run validate:workflows"));
  assert.ok(build.some((step) => step.run === "npm run test:workflows"));
  assert.equal(ci.jobs.validate.needs, "build");
  const steps = ci.jobs.validate.steps;
  const download = steps.findIndex((step) => step.uses === "actions/download-artifact@v4");
  const sweep = steps.findIndex((step) => step.run?.includes("barrido-utilidades.mjs"));
  assert.ok(download >= 0 && download < sweep);
  assert.deepEqual(steps[download].with, { name: "kronos-build", path: "client/dist" });
  const upload = build.find((step) => step.uses === "actions/upload-artifact@v4");
  assert.equal(upload.with.name, steps[download].with.name);
});

test("el CI no puede dar verde con pruebas omitidas sin declarar, ni con dobles sin aviso", () => {
  const directory = fileURLToPath(new URL("../../.github/workflows/", import.meta.url));
  const ci = parseWorkflow(readFileSync(path.join(directory, "ci.yml"), "utf8"), "ci.yml");
  const steps = ci.jobs.validate.steps;
  const run = (buscado) => steps.some((step) => String(step.run || "").includes(buscado));

  assert.ok(run("presupuesto-skip.mjs"), "el job validate tiene que pasar el TAP por el presupuesto de omisiones");
  assert.ok(run("barrido-no-mock.mjs"), "el job validate tiene que exigir la declaración de dobles en E2E y navegador");
  assert.ok(run("git diff --check"), "el job validate tiene que rechazar espacios y restos de conflicto");
  assert.ok(
    steps.findIndex((step) => String(step.run || "").includes("presupuesto-skip")) >
      steps.findIndex((step) => step.name === "Run server tests") ||
      String(steps.find((step) => step.name === "Run server tests").run).includes("presupuesto-skip"),
    "el filtro de omisiones tiene que estar en el paso que corre las pruebas, no en otro lado"
  );

  const cobertura = ci.jobs.cobertura;

  assert.ok(cobertura, "el job de cobertura existe: sin umbral, el porcentaje es folklore");
  const node = cobertura.steps.find((step) => step.uses?.startsWith("actions/setup-node"));

  assert.equal(String(node.with["node-version"]), "22", "los umbrales se miden con el node que soporta --test-coverage-include");
  assert.ok(cobertura.steps.some((step) => step.run === "npm run coverage"));
  assert.ok(run("barrido-utilidades.mjs --estricto"), "el barrido de utilidades sigue siendo portón en validate");
});


test("all workflow jobs retain explicit timeout budgets and bounded step timeouts", () => {
  const directory = fileURLToPath(new URL("../../.github/workflows/", import.meta.url));
  const budgets = {
    "auditoria-dependencias.yml": { auditar: 15 },
    "ci.yml": { build: 20, validate: 20, cobertura: 20, browser: 25 },
    "deploy-verify.yml": { "verify-deployment": 15 },
    "kronos-e2e.yml": { "mongo-real": 30, atlas: 32 },
    "kronos-guardian.yml": { "guardian-check": 15 },
    "smoke-auth.yml": { "auth-smoke": 15 },
    "smoke-openrouter.yml": { provider: 15, deployed: 15 },
    "verify-deploy.yml": { verify: 15 }
  };
  const files = validateWorkflows(directory);
  assert.deepEqual(files, Object.keys(budgets).sort());
  for (const file of files) {
    const workflow = parseWorkflow(readFileSync(path.join(directory, file), "utf8"), file);
    const actual = {};
    for (const [id, job] of Object.entries(workflow.jobs)) {
      const timeout = job["timeout-minutes"];
      assert.ok(Number.isInteger(timeout) && timeout > 0, `${file}/${id}: explicit positive timeout`);
      actual[id] = timeout;
      for (const step of job.steps || []) {
        if (step["timeout-minutes"] === undefined) continue;
        assert.ok(Number.isInteger(step["timeout-minutes"]) && step["timeout-minutes"] > 0 && step["timeout-minutes"] <= timeout,
          `${file}/${id}/${step.name}: step timeout must fit its job`);
      }
    }
    assert.deepEqual(actual, budgets[file], `${file}: intentional budget changes must update this regression`);
  }
});

test("workflow concurrency policies preserve branch isolation and the shared Atlas lock", () => {
  const directory = fileURLToPath(new URL("../../.github/workflows/", import.meta.url));
  const read = (file) => parseWorkflow(readFileSync(path.join(directory, file), "utf8"), file);
  const groups = new Set();
  for (const file of validateWorkflows(directory)) {
    const { concurrency } = read(file);
    assert.equal(typeof concurrency?.group, "string", `${file}: concurrency group required`);
    assert.ok(concurrency.group.trim());
    assert.ok(!groups.has(concurrency.group), `${file}: workflows must not share their top-level group`);
    groups.add(concurrency.group);
    assert.ok(typeof concurrency["cancel-in-progress"] === "boolean" ||
      /^\$\{\{.+\}\}$/.test(concurrency["cancel-in-progress"]), `${file}: explicit cancellation policy`);
  }
  const e2e = read("kronos-e2e.yml");
  assert.equal(e2e.concurrency.group, "kronos-e2e-${{ github.ref }}");
  assert.equal(e2e.concurrency["cancel-in-progress"], "${{ github.event_name == 'pull_request' }}");
  assert.deepEqual(e2e.jobs.atlas.concurrency, {
    group: "kronos-e2e-atlas-cluster-compartido",
    "cancel-in-progress": false
  });
  assert.equal(read("ci.yml").concurrency.group, "kronos-ci-${{ github.event.pull_request.number || github.ref }}");
  for (const file of ["ci.yml", "kronos-guardian.yml", "smoke-auth.yml", "smoke-openrouter.yml"]) {
    assert.equal(read(file).concurrency["cancel-in-progress"], true);
  }
  // La auditoría programada no compite con nada y no tiene PR que reemplazar:
  // si se cancela a sí misma, nadie se entera de que no se midió nada.
  assert.equal(read("auditoria-dependencias.yml").concurrency["cancel-in-progress"], false);
  for (const file of ["deploy-verify.yml", "verify-deploy.yml"]) {
    assert.equal(read(file).concurrency["cancel-in-progress"], false);
  }
});

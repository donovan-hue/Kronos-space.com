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

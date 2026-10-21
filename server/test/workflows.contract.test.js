const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workflows = path.resolve(__dirname, '../../.github/workflows');
const readWorkflow = (name) => fs.readFileSync(path.join(workflows, name), 'utf8');

// Extrae el paso real para probar el shell que ejecutará Actions, sin copiarlo.
function step(source, name) {
  const marker = `      - name: ${name}\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Falta el paso ${name}`);
  const end = source.indexOf('\n      - name:', start + marker.length);
  return source.slice(start, end === -1 ? undefined : end);
}

function runBlock(source) {
  const match = source.match(/^        run: \|\n((?:^          .*\n|^\n)+)/m);
  assert.ok(match, 'El paso debe declarar un bloque run');
  return match[1].replace(/^          /gm, '');
}

test('verificación manual: publica evidencia antes de propagar cualquier resultado no satisfactorio', () => {
  const source = readWorkflow('verify-deploy.yml');
  const verify = step(source, 'Verify deployed environment (read-only)');
  assert.match(verify, /id: verify_deploy/);
  assert.match(verify, /set -o pipefail/);
  // Permite el informe tras un fallo, pero obliga a recuperar ese fallo al final.
  assert.match(verify, /continue-on-error: true/);
  const gate = step(source, 'Exigir verificación satisfactoria');
  assert.match(gate, /if: always\(\) && steps\.verify_deploy\.outcome != 'success'/);
  assert.doesNotMatch(gate, /continue-on-error/);
  assert.ok(source.indexOf('      - name: Resumen') < source.indexOf(gate));
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', runBlock(gate)], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
});

test('el resumen manual usa variables de entorno, no interpola inputs en shell', () => {
  const summary = step(readWorkflow('verify-deploy.yml'), 'Resumen');
  const shell = runBlock(summary);
  assert.match(summary, /BASE: \$\{\{ inputs\.base \}\}/);
  assert.doesNotMatch(shell, /\$\{\{\s*inputs\./);
  assert.match(shell, /cat \/tmp\/verify-deploy\.txt/);
  assert.match(shell, /\$\{RESULTADO\}/);
});

test('post-deploy: previews y consultas manuales no cancelan la cola de producción', () => {
  const source = readWorkflow('deploy-verify.yml');
  const concurrency = source.slice(source.indexOf('\nconcurrency:'), source.indexOf('\njobs:'));
  assert.match(concurrency, /cancel-in-progress: false/);
  assert.match(concurrency, /github\.event_name == 'workflow_dispatch'.*manual-\{0\}/);
  assert.match(concurrency, /github\.event\.deployment_status\.state == 'success'/);
  assert.match(concurrency, /startsWith\(github\.event\.deployment\.environment, 'Production'\)/);
  assert.match(concurrency, /&& 'production'/);
  assert.match(concurrency, /ignored-\{0\}.*github\.run_id/);
  assert.match(concurrency, /preview-\{0\}.*github\.event\.deployment\.id/);
  // No quitar la guarda de success. Clasificar el entorno antes de sondearlo:
  // una preview sana sí se comprueba, pero nunca contra el frontend de producción.
  const job = source.slice(source.indexOf('\njobs:'));
  assert.match(job, /github\.event\.deployment_status\.state == 'success'/);
  assert.match(job, /node scripts\/ci\/deployment-target\.js/);
  const verify = step(source, 'Verificar el entorno desplegado (solo lectura)');
  for (const output of ['base', 'frontend', 'origins', 'require_frontend_origin']) {
    assert.ok(verify.includes(`steps.target.outputs.${output}`));
  }
  assert.match(verify, /set -o pipefail/);
  assert.doesNotMatch(verify, /continue-on-error/);
  assert.match(job, /github\.event\.repository\.default_branch/);
  assert.match(job, /persist-credentials: false/);
  assert.doesNotMatch(job, /secrets\./);
});

test('Guardian: su comando real de sintaxis falla con JS inválido y admite rutas con espacios', (t) => {
  const source = step(readWorkflow('kronos-guardian.yml'), 'Validate Guardian syntax');
  const shell = runBlock(source);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kronos-guardian-syntax-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.mkdirSync(path.join(cwd, 'src'));
  fs.writeFileSync(path.join(cwd, 'src/valid file.js'), 'const value = 1;\n');
  const run = () => spawnSync('bash', ['-e', '-o', 'pipefail', '-c', shell], { cwd, encoding: 'utf8' });
  let result = run();
  assert.equal(result.status, 0, result.stderr);
  fs.writeFileSync(path.join(cwd, 'src/invalid file.js'), 'const = ;\n');
  result = run();
  assert.notEqual(result.status, 0, 'Un error de sintaxis no puede quedar verde');
  assert.match(result.stderr, /SyntaxError/);
});

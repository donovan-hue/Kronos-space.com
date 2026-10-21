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

// Reproduce el selector real en un checkout vacío/disponible. El git de la
// fixture solo informa el HEAD; no crea ramas ni obtiene código de la red.
function selectVerifier(t, { head = 'b0b6283c9d20d7bff41354906be74dd300629fb3', event = 'deployment_status', ready = false, partial = false } = {}) {
  const source = step(readWorkflow('deploy-verify.yml'), 'Seleccionar el verificador disponible');
  const base = source.match(/BOOTSTRAP_BASE_SHA: ([0-9a-f]{40})/)[1];
  const pinned = source.match(/BOOTSTRAP_VERIFIER_SHA: ([0-9a-f]{40})/)[1];
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kronos-verifier-source-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.mkdirSync(path.join(cwd, 'bin'));
  fs.writeFileSync(path.join(cwd, 'bin/git'), '#!/bin/sh\nprintf "%s\\n" "$TEST_CHECKOUT_HEAD"\n', { mode: 0o755 });
  if (ready || partial) {
    fs.mkdirSync(path.join(cwd, 'scripts/ci'), { recursive: true });
    fs.copyFileSync(path.resolve(workflows, '../../scripts/ci/deployment-target.js'), path.join(cwd, 'scripts/ci/deployment-target.js'));
    fs.writeFileSync(path.join(cwd, 'scripts/verify-deploy.sh'), ready ? '# REQUIRE_FRONTEND_ORIGIN\n' : '# verificador anterior\n');
  }
  const output = path.join(cwd, 'outputs');
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', runBlock(source)], {
    cwd, encoding: 'utf8', env: { ...process.env, PATH: `${path.join(cwd, 'bin')}${path.delimiter}${process.env.PATH}`,
      TEST_CHECKOUT_HEAD: head, GITHUB_EVENT_NAME: event, GITHUB_OUTPUT: output,
      BOOTSTRAP_BASE_SHA: base, BOOTSTRAP_VERIFIER_SHA: pinned }
  });
  return { ...result, output: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '', base, pinned };
}

test('post-deploy: el main anterior sin clasificador usa solo el respaldo inmutable revisado', t => {
  const result = selectVerifier(t, { head: '0c95fc0177a5ed3424b8c69d282f94ef7278bca6' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.output, /^directory=\.deploy-verifier$/m);
  assert.match(result.output, /^bootstrap=true$/m);
  assert.ok(result.output.includes(`revision=${result.pinned}\n`));
});

test('post-deploy: cuando main ya contiene el verificador completo no se usa el respaldo', t => {
  const result = selectVerifier(t, { ready: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.output, /^directory=\.$/m);
  assert.match(result.output, /^bootstrap=false$/m);
});

test('post-deploy: un HEAD diferente sin verificador falla cerrado, no ejecuta el código del deployment', t => {
  const result = selectVerifier(t);
  assert.equal(result.status, 1);
  assert.equal(result.output, '');
  assert.match(result.stdout, /revisión desconocida/);
});

test('post-deploy: no basta tener el clasificador si el sondeo todavía carece de la guarda de origen', t => {
  const result = selectVerifier(t, { partial: true });
  assert.equal(result.status, 1);
  assert.equal(result.output, '');
});

test('post-deploy: una consulta manual no sustituye a escondidas su revisión elegida', t => {
  const missing = selectVerifier(t, { event: 'workflow_dispatch', head: '0c95fc0177a5ed3424b8c69d282f94ef7278bca6' });
  assert.equal(missing.status, 1);
  const ready = selectVerifier(t, { event: 'workflow_dispatch', ready: true });
  assert.equal(ready.status, 0, ready.stderr);
  assert.match(ready.output, /^directory=\.$/m);
});

test('post-deploy: el respaldo está fijado y solo contiene los dos verificadores, sin credenciales ni código variable del PR', () => {
  const source = readWorkflow('deploy-verify.yml');
  const select = step(source, 'Seleccionar el verificador disponible');
  const pinned = select.match(/BOOTSTRAP_VERIFIER_SHA: ([0-9a-f]{40})/)[1];
  const backup = step(source, 'Checkout del respaldo inmutable del verificador');
  assert.ok(backup.includes(`ref: ${pinned}\n`));
  assert.match(backup, /if: steps\.verifier_source\.outputs\.bootstrap == 'true'/);
  assert.match(backup, /persist-credentials: false/);
  assert.match(backup, /sparse-checkout-cone-mode: false/);
  assert.match(backup, /\/scripts\/ci\/deployment-target\.js/);
  assert.match(backup, /\/scripts\/verify-deploy\.sh/);
  for (const checkout of [backup, step(source, 'Checkout del verificador de confianza')]) {
    assert.doesNotMatch(checkout, /github\.event\.deployment\.(sha|ref)/);
  }
  for (const name of ['Elegir el entorno real del despliegue', 'Verificar el entorno desplegado (solo lectura)']) {
    assert.match(step(source, name), /working-directory: \$\{\{ steps\.verifier_source\.outputs\.directory \}\}/);
  }
});

test('post-deploy: el fallo HTTP queda anotado sin convertir contenido remoto en comandos de Actions', t => {
  const source = step(readWorkflow('deploy-verify.yml'), 'Instrucciones si la verificación falló');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kronos-deploy-report-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const report = path.join(cwd, 'report.txt');
  const summary = path.join(cwd, 'summary.md');
  fs.writeFileSync(report, 'OK    salud\nFALLA Preview HTTP 401\nFALLA mensaje %0A::notice::remoto\n');
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', runBlock(source)], {
    encoding: 'utf8', cwd, env: { ...process.env, MODO: 'preview', FRONTEND: '', REPORT: report, GITHUB_STEP_SUMMARY: summary }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /::error title=Sondeo de despliegue::FALLA Preview HTTP 401/);
  assert.match(result.stdout, /%250A::notice::remoto/);
  assert.doesNotMatch(result.stdout, /^::notice::remoto/m);
  assert.doesNotMatch(result.stdout, /Sondeo de despliegue::OK/);
  assert.match(fs.readFileSync(summary, 'utf8'), /no ordena ni justifica revertir producción/);
});


test('post-deploy: diagnostica el origen final sin exponer parámetros de acceso ni reenviar secretos', t => {
  const source = step(readWorkflow('deploy-verify.yml'), 'Instrucciones si la verificación falló');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kronos-deploy-destination-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.mkdirSync(path.join(cwd, 'bin'));
  fs.writeFileSync(path.join(cwd, 'bin/curl'), '#!/bin/sh\nprintf "%s\\n" "200 https://someone:do-not-log@vercel.com/sso?token=do-not-log#private"\n', { mode: 0o755 });
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', runBlock(source)], {
    encoding: 'utf8', cwd, env: { ...process.env,
      PATH: `${path.join(cwd, 'bin')}${path.delimiter}${process.env.PATH}`,
      MODO: 'preview', FRONTEND: 'https://kronos-space-fixture-oficialkronosspace-1215.vercel.app',
      REPORT: path.join(cwd, 'not-created'), GITHUB_STEP_SUMMARY: path.join(cwd, 'summary.md') }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /::notice title=Destino de preview::HTTP 200; origen final https:\/\/vercel\.com/);
  assert.doesNotMatch(result.stdout, /do-not-log|token=|someone|private|\/sso/);
  assert.match(result.stdout, /::error title=Despliegue NO verificado/);
});

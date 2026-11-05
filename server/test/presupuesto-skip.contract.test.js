const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// POR QUÉ ESTE ARCHIVO EXISTE
//
// `presupuesto-skip.mjs` funcionaba bien y aun así el E2E podía dar verde sin
// ejecutar nada: los dos jobs de `kronos-e2e.yml` —los únicos donde hay una
// base real y la omisión no tiene excusa— pasaban el TAP por la declaración
// de `validate`, que permite hasta 192 omisiones. Un contenedor `mongo:7`
// caído, un `env -u` mal puesto o la guarda de destino rechazando la URI
// producían exactamente 192 omisiones: dentro del presupuesto, verde.
//
// Lo que se protege aquí:
//   1. los jobs E2E usan una declaración con tope 0, y
//   2. esa declaración realmente falla ante una omisión y pasa ante un TAP
//      limpio (se ejecuta el filtro, no se lee su código).

const RAIZ = path.resolve(__dirname, '..', '..');
const WORKFLOWS = path.join(RAIZ, '.github', 'workflows');
const SCRIPT = path.join(RAIZ, 'scripts', 'ci', 'presupuesto-skip.mjs');
const DECLARACION_E2E = path.join(RAIZ, 'scripts', 'ci', 'skips-declarados-e2e.json');
const DECLARACION_VALIDATE = path.join(RAIZ, 'scripts', 'ci', 'skips-declarados.json');

function step(source, name) {
  const marker = `      - name: ${name}\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Falta el paso «${name}»`);
  const end = source.indexOf('\n      - name:', start + marker.length);
  return source.slice(start, end === -1 ? undefined : end);
}

function filtrar(tap, declaracion = DECLARACION_E2E) {
  return spawnSync(process.execPath, [SCRIPT, '--declarado', declaracion], {
    input: tap,
    encoding: 'utf8'
  });
}

const limpio = ['ok 1 - una prueba real', 'ok 2 - otra prueba real', '1..2', '# pass 2', '# fail 0'].join('\n');

function conOmisiones(cantidad, motivo) {
  const lineas = [];
  for (let i = 1; i <= cantidad; i += 1) lineas.push(`ok ${i} - prueba ${i} # SKIP ${motivo}`);
  lineas.push(`1..${cantidad}`, `# pass 0`, `# fail 0`);
  return lineas.join('\n');
}

test('los dos jobs de E2E exigen la declaración de omisiones con tope cero', () => {
  const source = fs.readFileSync(path.join(WORKFLOWS, 'kronos-e2e.yml'), 'utf8');
  const mongo = step(source, 'Exigir el presupuesto de omisiones');
  const atlas = step(source, 'Exigir el presupuesto de omisiones (Atlas)');

  for (const [nombre, bloque] of [['mongo-real', mongo], ['atlas', atlas]]) {
    assert.match(
      bloque,
      /presupuesto-skip\.mjs --declarado scripts\/ci\/skips-declarados-e2e\.json/,
      `el job ${nombre} tiene que usar la declaración de los jobs E2E, no la de validate`
    );
    assert.match(bloque, /< \/tmp\/kronos-(e2e|atlas-e2e)\.txt/, `el job ${nombre} tiene que leer el TAP de sus pruebas`);
  }

  const declaracion = JSON.parse(fs.readFileSync(DECLARACION_E2E, 'utf8'));
  assert.ok(Array.isArray(declaracion.declarados) && declaracion.declarados.length > 0, 'la declaración E2E no puede estar vacía');

  for (const regla of declaracion.declarados) {
    assert.equal(regla.hasta, 0, `«${regla.patron}» tiene que tener tope 0 en los jobs E2E`);
    assert.ok(regla.por && regla.por.length > 40, `«${regla.patron}» necesita explicar por qué no se admite`);
  }

  // La declaración de `validate` permite un tope positivo (allí no hay MongoDB
  // y la omisión es legítima pero contada). El número exacto sube cuando un
  // bloque añade E2E, así que aquí se mide que exista y sea > 0, y que la
  // declaración de validate NO se haya quedado con el tope cero de los E2E.
  const validate = JSON.parse(fs.readFileSync(DECLARACION_VALIDATE, 'utf8'));
  const e2e = validate.declarados.find((regla) => regla.patron.includes('KRONOS_E2E_MONGODB_URI'));
  assert.ok(e2e, 'validate tiene que declarar el motivo de KRONOS_E2E_MONGODB_URI');
  assert.ok(
    Number.isInteger(e2e.hasta) && e2e.hasta > 0,
    'el presupuesto de validate tiene que ser positivo y contado'
  );
});

test('el filtro con tope cero falla ante una sola omisión y nombra el motivo', () => {
  const resultado = filtrar(conOmisiones(1, 'Requiere KRONOS_E2E_MONGODB_URI'));

  assert.equal(resultado.status, 1, 'una omisión en el job E2E no puede quedar verde');
  assert.match(resultado.stdout, /EXCEDE/);
  assert.match(resultado.stdout, /Requiere KRONOS_E2E_MONGODB_URI/);
});

test('el filtro con tope cero falla con las 192 omisiones de una base caída', () => {
  // Este es el caso real que el gate anterior dejaba pasar: contenedor caído,
  // mismas 192 omisiones que `validate` admite, job verde sin ejecutar nada.
  const resultado = filtrar(conOmisiones(192, 'Requiere KRONOS_E2E_MONGODB_URI'));

  assert.equal(resultado.status, 1, 'las 192 omisiones de validate no pueden ser verdes en el E2E');
  assert.match(resultado.stdout, /192/);
});

test('el filtro con tope cero pasa cuando el E2E ejecutó todo', () => {
  const resultado = filtrar(limpio);

  assert.equal(resultado.status, 0, resultado.stdout + resultado.stderr);
  assert.match(resultado.stdout, /Toda omisión declarada y dentro de su presupuesto/);
});

test('una omisión no declarada sigue fallando en cualquier job', () => {
  const resultado = filtrar(conOmisiones(1, 'motivo inventado que nadie declaró'));

  assert.equal(resultado.status, 1);
  assert.match(resultado.stdout, /FALTA/);
});

test('un TAP vacío no puede aprobar el presupuesto', () => {
  const resultado = filtrar('# tests 0\n');

  assert.equal(resultado.status, 2, 'sin resultados no hay nada que negar: el filtro falla');
  assert.match(resultado.stderr, /no contiene ningún resultado/);
});

test('validate respeta el tope declarado y falla solo al excederlo', () => {
  // El tope se lee de la declaración, no se copia: cuando un bloque añade E2E
  // el número sube a propósito y esta prueba no debe quedarse clavada en la
  // cifra vieja (192 era el de `main` antes de 1.1-2.2). Lo que se mide es que
  // el filtro respete el tope que diga el archivo, sea cual sea.
  const declaracion = JSON.parse(fs.readFileSync(DECLARACION_VALIDATE, 'utf8'));
  const tope = declaracion.declarados.find(
    (entrada) => entrada.patron === '^Requiere KRONOS_E2E_MONGODB_URI'
  ).hasta;

  assert.ok(Number.isInteger(tope) && tope > 0, 'validate necesita un tope positivo declarado');

  const dentro = filtrar(conOmisiones(tope, 'Requiere KRONOS_E2E_MONGODB_URI'), DECLARACION_VALIDATE);
  assert.equal(dentro.status, 0, dentro.stdout);

  const fuera = filtrar(conOmisiones(tope + 1, 'Requiere KRONOS_E2E_MONGODB_URI'), DECLARACION_VALIDATE);
  assert.equal(fuera.status, 1);
  assert.match(fuera.stdout, /EXCEDE/);
});

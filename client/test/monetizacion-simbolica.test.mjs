import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * MONETIZACIÓN SIMBÓLICA — contrato de lo que se ve en pantalla.
 *
 * No hay pasarela de pago: los apoyos son créditos (★) y el producto lo dice.
 * Eso solo se mantiene si el aviso está en las dos superficies donde se
 * compromete el gesto —la página de apoyos y el diálogo— y si ninguna pantalla
 * empieza a usar vocabulario de cobro que no exista atrás. Este archivo vigila
 * las dos cosas: es un contrato de redacción, no un test de render, porque lo
 * que se rompe aquí es el texto, no el componente.
 */

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const walk = dir => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]);
const leido = (relativo) => readFileSync(resolve(RAIZ, relativo), 'utf8');

const PAGINA = leido('features/users/SupportPage.jsx');
const DIALOGO = leido('features/users/SupportDialog.jsx');
const PERFIL = leido('features/users/Profile.jsx');

const AVISO = /no se procesa[n]? (ningún|ningun) pago real/i;

test('la página y el diálogo dicen que no se procesa ningún pago real', () => {
  assert.match(PAGINA, AVISO, 'SupportPage perdió el aviso');
  assert.match(DIALOGO, AVISO, 'SupportDialog perdió el aviso');
});

test('el aviso está en el JSX visible, no solo en un comentario', () => {
  for (const [nombre, fuente] of [['SupportPage', PAGINA], ['SupportDialog', DIALOGO]]) {
    const sinComentarios = fuente.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(sinComentarios, AVISO, `${nombre}: el aviso quedó solo en un comentario`);
  }
});

test('el perfil nombra el gesto como simbólico al confirmarlo', () => {
  assert.match(PERFIL, /Apoyo simbólico \(★\) enviado/, 'el aviso del perfil cambió de texto');
  assert.doesNotMatch(PERFIL, /pago con tarjeta|compra|precio/, 'el perfil habla de compra, no de apoyo simbólico');
});

test('ninguna pantalla promete vocabulario de cobro que el servidor no tiene', () => {
  const PROHIBIDO = /\b(comprar|checkout|pasarela de pago|stripe|paypal|tarjeta de (crédito|débito)|método de pago|suscripción|factura|precio)\b/i;
  const ofensas = [];
  for (const archivo of walk(RAIZ).filter(f => f.endsWith('.jsx'))) {
    const fuente = readFileSync(archivo, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const m = PROHIBIDO.exec(fuente);
    if (m) ofensas.push(`${archivo.replace(RAIZ + '/', '')}: ${m[0]}`);
  }
  assert.deepEqual(ofensas, [], 'hay vocabulario de cobro en la interfaz sin que exista cobro detrás');
});

test('los tres tramos se nombran en créditos, con importes fijos y sin moneda', () => {
  const tramos = [...DIALOGO.matchAll(/\{\s*id: "([a-z]+)", name: "([^"]+)", amount: (\d+), label: "([^"]+)"/g)];
  assert.equal(tramos.length, 3, 'se esperaban tres tramos de apoyo');
  assert.deepEqual(
    tramos.map((m) => `${m[1]}:${m[3]}:${m[4]}`),
    ['stardust:10:10 ★', 'meteor:50:50 ★', 'supernova:200:200 ★']
  );
  for (const m of tramos) {
    assert.doesNotMatch(m[4], /\$|€|MXN|USD/, 'un tramo se anuncia en moneda');
  }
});

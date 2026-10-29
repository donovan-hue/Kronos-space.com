import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CONTRATO DE LOS FORMATOS — plantillas de la pantalla, enum del servidor y
 * previsualizado de la hoja.
 *
 * Las tres piezas se escriben en archivos distintos y se rompen en silencio:
 * `parseFormat()` del servidor no rechaza un formato desconocido, lo convierte
 * en `libre`, así que añadir una plantilla sin tocar `Project.js` produce
 * proyectos que se ven bien en la pantalla y llegan al guardado sin formato.
 * Y el `<select>` de ProjectsPage recorre `NOMBRE_FORMATO`, no el enum: un
 * formato en el servidor sin etiqueta es una opción que nadie puede elegir.
 *
 * El previsualizado entra en el contrato porque su proporción se escribió a
 * mano (`aspect-ratio: 21 / 9`) junto a un texto que dice `21:9`.
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ_CLIENTE = resolve(aqui, '../src');
const RAIZ_SERVIDOR = resolve(aqui, '../../server/src');

const { PLANTILLAS, NOMBRE_FORMATO, plantillaPorId } = await import(
  resolve(RAIZ_CLIENTE, 'features/projects/templates.js')
);

const hoja = readFileSync(resolve(RAIZ_CLIENTE, 'styles/kronos.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const proyecto = readFileSync(resolve(RAIZ_SERVIDOR, 'modules/projects/Project.js'), 'utf8');

const ENUM = /const FORMATOS = \[([^\]]*)\]/.exec(proyecto);
assert.ok(ENUM, 'no se encontró la declaración de FORMATOS en server/src/modules/projects/Project.js');
const FORMATOS_SERVIDOR = ENUM[1]
  .split(',')
  .map((fragmento) => fragmento.trim().replace(/^["']|["']$/g, ''))
  .filter(Boolean);

test('la pantalla ofrece los cuatro formatos, en su orden y con su proporción', () => {
  assert.deepEqual(
    PLANTILLAS.map((plantilla) => `${plantilla.id} ${plantilla.ratio}`),
    ['reel 9:16', 'cuadrado 1:1', 'panoramica 21:9', 'portada 16:9']
  );
  for (const plantilla of PLANTILLAS) {
    assert.equal(plantillaPorId(plantilla.id).id, plantilla.id, `plantillaPorId(${plantilla.id})`);
  }
  assert.equal(plantillaPorId('no-existe'), null, 'una consulta rara devuelve null, no la primera');
});

test('los ids y los formatos no se repiten', () => {
  const ids = PLANTILLAS.map((p) => p.id);
  const formatos = PLANTILLAS.map((p) => p.format);
  assert.equal(new Set(ids).size, ids.length, 'ids duplicados');
  assert.equal(new Set(formatos).size, formatos.length, 'formatos duplicados');
});

test('todo formato de plantilla existe en el enum del servidor', () => {
  const ausentes = PLANTILLAS
    .map((p) => p.format)
    .filter((formato) => !FORMATOS_SERVIDOR.includes(formato));
  assert.deepEqual(
    ausentes,
    [],
    `parseFormat() convertiría ${ausentes.join(', ')} en "libre" sin avisar: añade el formato a Project.js`
  );
});

test('todo formato del servidor tiene etiqueta en NOMBRE_FORMATO', () => {
  // El <select> de ProjectsPage recorre NOMBRE_FORMATO: sin etiqueta, la opción
  // no aparece aunque el backend la acepte.
  const sinEtiqueta = FORMATOS_SERVIDOR.filter((formato) => !Object.hasOwn(NOMBRE_FORMATO, formato));
  assert.deepEqual(sinEtiqueta, [], `formatos sin etiqueta: ${sinEtiqueta.join(', ')}`);
  const etiquetasHuerfanas = Object.keys(NOMBRE_FORMATO).filter((formato) => !FORMATOS_SERVIDOR.includes(formato));
  assert.deepEqual(etiquetasHuerfanas, [], `etiquetas que el servidor rechazaría: ${etiquetasHuerfanas.join(', ')}`);
});

test('cada plantilla trae escenas numeradas desde cero, con texto aprovechable', () => {
  for (const plantilla of PLANTILLAS) {
    assert.ok(plantilla.escenas.length >= 3, `${plantilla.id}: menos de tres escenas no es una estructura`);
    assert.deepEqual(
      plantilla.escenas.map((escena) => escena.order),
      plantilla.escenas.map((_, indice) => indice),
      `${plantilla.id}: el order debe ser 0..n-1 continuo (el prellenado lo recorre así)`
    );
    for (const escena of plantilla.escenas) {
      assert.ok(escena.title?.trim(), `${plantilla.id}: escena sin título`);
      assert.ok(escena.script?.trim(), `${plantilla.id}/${escena.title}: rótulo vacío, la plantilla no ahorra nada`);
      assert.ok(escena.script.trim().length > 20, `${plantilla.id}/${escena.title}: el rótulo tiene que ser una instrucción legible`);
    }
    assert.ok(plantilla.detalle?.trim() && plantilla.duracion?.trim(), `${plantilla.id}: falta detalle o duración`);
  }
});

test('el previsualizado de la hoja respeta la proporción declarada', () => {
  for (const plantilla of PLANTILLAS) {
    const [ancho, alto] = plantilla.ratio.split(':').map(Number);
    assert.ok(Number.isFinite(ancho) && Number.isFinite(alto), `${plantilla.id}: ratio "${plantilla.ratio}" no es ANCHO:ALTO`);
    const regla = new RegExp(`\\.k-template-preview\\.is-${plantilla.id}\\s*\\{([^}]*)\\}`).exec(hoja);
    assert.ok(regla, `falta la regla .k-template-preview.is-${plantilla.id} en kronos.css`);
    const declarada = /aspect-ratio:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(regla[1]);
    assert.ok(declarada, `is-${plantilla.id} no declara aspect-ratio`);
    assert.equal(
      Number(declarada[1]) / Number(declarada[2]),
      ancho / alto,
      `is-${plantilla.id} previsualiza ${declarada[1]}/${declarada[2]} y la plantilla promete ${plantilla.ratio}`
    );
  }
});

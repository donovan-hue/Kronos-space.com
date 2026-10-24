import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const read = file => fs.readFileSync(path.join(src, file), 'utf8');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

test('app y demo comparten una sola entrada y un orden explícito de capas', () => {
  const entry = postcss.parse(read('styles/app.css'));
  assert.equal(entry.nodes.find(n => n.type === 'atrule' && n.name === 'layer').params, 'theme, base, components, utilities, kronos');
  const imports = entry.nodes.filter(n => n.type === 'atrule' && n.name === 'import').map(n => n.params);
  assert.ok(imports[0].startsWith('"./tailwind.css"'));
  assert.equal(imports.at(-1), '"./kronos.css" layer(kronos)');
  assert.equal(new Set(imports).size, imports.length);
  // Una sola hoja de producto: el motor y los tokens aparte, nada más.
  assert.deepEqual(imports, ['"./tailwind.css"', '"./design-tokens.css" layer(kronos)', '"./kronos.css" layer(kronos)']);
  assert.deepEqual([...read('main.jsx').matchAll(/import "([^"\n]+\.css)"/g)].map(m => m[1]), ['./styles/app.css']);
  assert.match(fs.readFileSync(path.join(src, '../demo/main.jsx'), 'utf8'), /import "\.\.\/src\/styles\/app\.css"/);
});

test('una sola hoja de producto: ni capa de prioridades ni estilos por pantalla', () => {
  const entry = postcss.parse(read('styles/app.css'));
  const layers = entry.nodes.filter(n => n.type === 'atrule' && n.name === 'import').map(n => n.params);
  assert.ok(layers.every(params => !params.includes('priority')), 'ninguna hoja se importa en una capa de prioridad');
  assert.ok(!fs.existsSync(path.join(src, 'styles/priority.css')), 'priority.css ya no existe');
  for (const file of walk(src).filter(f => f.endsWith('.css'))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /@layer\s+priority/, `${file}: no se declara la capa de prioridades`);
  }
  // Todo el diseño vive en una hoja; el motor y los tokens son su vocabulario.
  const deProducto = walk(path.join(src, 'styles')).filter(f => f.endsWith('.css'))
    .map(f => path.basename(f))
    .filter(n => !['app.css', 'tailwind.css', 'design-tokens.css'].includes(n));
  assert.deepEqual(deProducto, ['kronos.css'], 'sólo puede haber una hoja de producto');
});

test('el reset permanece en base: no se anida en kronos ni gana a las utilidades', () => {
  let base = null;
  postcss.parse(read('styles/tailwind.css')).walkAtRules('layer', rule => { if (rule.params === 'base' && rule.nodes) base = rule; });
  assert.ok(base);
  const reset = base.nodes.find(n => n.type === 'rule' && n.selector === '*');
  assert.ok(reset.nodes.some(n => n.prop === 'padding' && n.value === '0'));
  postcss.parse(read('styles/kronos.css')).walkAtRules('layer', rule => assert.notEqual(rule.params, 'base'));
});

test('los únicos important restantes son guardas de accesibilidad, no presentación', () => {
  let count = 0;
  for (const file of walk(src).filter(f => f.endsWith('.css'))) {
    postcss.parse(fs.readFileSync(file, 'utf8')).walkDecls(decl => {
      if (!decl.important) return;
      count++;
      const contexts = [];
      for (let p = decl.parent; p && p.type !== 'root'; p = p.parent) contexts.push(p.params || p.selector || '');
      assert.match(contexts.join(' '), /reduced|forced-colors|prefers-contrast|sr-only/, `${file}: ${decl.toString()}`);
    });
  }
  assert.equal(count, 24, 'Toda excepción nueva requiere justificación, no subir este presupuesto automáticamente');
});

test('los filtros usan la declaración estándar después del prefijo para compilar igual en Chromium y WebKit', () => {
  for (const file of walk(src).filter(f => f.endsWith('.css'))) {
    postcss.parse(fs.readFileSync(file, 'utf8')).walkRules(rule => {
      const standard = rule.nodes.findIndex(n => n.type === 'decl' && n.prop === 'backdrop-filter');
      const prefix = rule.nodes.findIndex(n => n.type === 'decl' && n.prop === '-webkit-backdrop-filter');
      if (standard >= 0 && prefix >= 0) assert.ok(prefix < standard, `${file}: ${rule.selector}`);
    });
  }
});


test('los diálogos tienen un solo mecanismo de centrado, no translate CSS y utilidades a la vez', () => {
  assert.doesNotMatch(read('components/ui/dialog.jsx'), /-translate-[xy]-1\/2/);
  const root = postcss.parse(read('styles/kronos.css'));
  const dialog = root.nodes.find(n => n.type === 'rule' && n.selector === '[data-slot="dialog-content"]');
  assert.ok(dialog && dialog.nodes.some(n => n.prop === 'transform' && n.value === 'translate(-50%, -50%)'));
});

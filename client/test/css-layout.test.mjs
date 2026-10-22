import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'lightningcss';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const read = f => readFileSync(resolve(root, f), 'utf8');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]);
const uncomment = text => text.replace(/\/\*[\s\S]*?\*\//g, '');
const sheets = walk(root).filter(f => f.endsWith('.css'));
const css = sheets.map(f => uncomment(readFileSync(f, 'utf8'))).join('\n');

// Estos tres nombres identifican secciones; heredan su geometría de
// .page/.k-settings-section. No necesitan reglas vacías para pasar el censo.
const structuralHooks = new Set(['k-capsules', 'k-feed-preferences-settings', 'k-ai-personality-settings']);

test('las clases k-* literales de las pantallas tienen CSS o son hooks documentados', () => {
  const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
  const missing = [];
  for (const file of walk(root).filter(f => f.endsWith('.jsx'))) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      for (const name of (m[1] || m[2]).replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) {
        // Los prefijos dinámicos k-toast- / k-badge- no son clases completas.
        if (!/^k-[a-z0-9-]*[a-z0-9]$/.test(name)) continue;
        if (!defined.has(name) && !structuralHooks.has(name)) missing.push(`${file}: ${name}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('las hojas reparadas se pueden analizar, sin limpiadores basados en llaves', () => {
  for (const file of ['styles/design-system.css', 'styles/fan-nav.css', 'styles/social-refresh.css', 'styles/media.css', 'styles/auth-refresh.css']) {
    assert.doesNotThrow(() => transform({ filename: file, code: Buffer.from(read(file)), errorRecovery: false }));
  }
});

test('el ancho del shell tiene un solo dueño que alcanza el contenedor de animación', () => {
  const layout = uncomment(read('styles/fan-nav.css'));
  assert.match(layout, /:is\(\.k-main-content, \.k-route-view\) > \.page/);
  assert.match(read('layouts/AppLayout.jsx'), /className="k-route-view"/);
  for (const file of ['styles/design-system.css', 'styles/interface-density.css']) {
    assert.doesNotMatch(uncomment(read(file)), /\.k-main-content\s*>\s*\.page/);
  }
  assert.doesNotMatch(layout, /(?:width|padding-bottom):[^;]*!important/);
});

test('los visores full-screen se montan fuera de la ruta animada', () => {
  for (const file of ['components/media/MediaViewer.jsx', 'components/media/MediaStudio.jsx', 'features/social/stories/StoryViewer.jsx', 'features/social/stories/StoryCreator.jsx']) {
    assert.match(read(file), /createPortal\(/);
    assert.match(read(file), /document\.body/);
  }
  assert.doesNotMatch(read('layouts/AppLayout.jsx'), /willChange:/);
  // El mapa es contenido de Radix: tiene que estar sobre su propio fondo.
  assert.match(read('styles/orbit-map.css'), /z-index: var\(--k-z-modal, 1010\)/);
});

test('la geometría de verificación y comentarios ya no está duplicada en línea', () => {
  assert.doesNotMatch(read('features/auth/VerifyEmail.jsx'), /style=\{/);
  const comments = read('features/social/Comments.jsx');
  assert.equal((comments.match(/style=\{/g) || []).length, 1); // solo la profundidad dinámica
  assert.match(comments, /--comment-indent/);
  assert.match(read('features/ai/StudioPage.jsx'), /<CreatePost embedded/);
});

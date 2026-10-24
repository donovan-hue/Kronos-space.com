import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const uncomment = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = uncomment(read('src/styles/design-tokens.css'));
const token = (name) => {
  const match = tokens.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(match, `Falta ${name}`);
  return match[1];
};
const hexes = (source) => [...source.matchAll(/#([\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b/gi)];
const channels = (hex) => {
  const value = hex.length <= 4 ? [...hex].map((n) => n + n).join('') : hex;
  return [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16));
};
const luminance = (hex) => channels(hex).map((n) => {
  const c = n / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

// Sigue el grafo real de CSS, incluidos los once módulos del port. No procesa
// fotos, videos, SVG de usuarios, píxeles del editor ni librerías de terceros.
const styles = new Map();
function loadStyle(path) {
  if (styles.has(path)) return;
  const source = uncomment(readFileSync(path, 'utf8'));
  styles.set(path, source);
  for (const match of source.matchAll(/@import\s+["'](\.[^"']+\.css)["']/g)) {
    loadStyle(resolve(dirname(path), match[1]));
  }
}
for (const match of read('src/main.jsx').matchAll(/import\s+["'](\.[^"']+\.css)["']/g)) {
  loadStyle(resolve(root, 'src', match[1]));
}

function assertNeutral(source, path) {
  for (const [literal, hex] of hexes(source)) {
    const [r, g, b] = channels(hex);
    assert.ok(r === g && g === b, `${path}: color cromático ${literal}`);
  }
  for (const [literal, values] of source.matchAll(/rgba?\(([^)]+)\)/gi)) {
    const rgb = values.trim().split(/\s*[,/]\s*|\s+/).slice(0, 3);
    assert.equal(rgb.length, 3, `${path}: RGB incompleto ${literal}`);
    assert.ok(rgb.every((c) => c === rgb[0]), `${path}: color cromático ${literal}`);
  }
  // Evitar otra notación que pueda eludir la auditoría de canales RGB.
  assert.doesNotMatch(source, /\b(?:hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i, path);
  assert.doesNotMatch(source, /(?:^|[\s:,])(?:red|blue|green|lime|teal|cyan|aqua|navy|purple|magenta|fuchsia|pink|orange|yellow|gold|coral|salmon|tomato|violet|indigo|brown|olive|maroon)\b/i, path);
}

test('toda la paleta CSS que carga la app es neutra en origen', () => {
  assert.ok(styles.size >= 30, 'Se debe auditar el grafo completo, no un único tema');
  for (const [path, source] of styles) assertNeutral(source, path);
});

test('luces y materiales 3D no reintroducen tintes', () => {
  const directory = 'src/three/scenes';
  const scenes = readdirSync(resolve(root, directory)).filter((name) => name.endsWith('.jsx'));
  assert.ok(scenes.length >= 5);
  for (const name of scenes) assertNeutral(uncomment(read(`${directory}/${name}`)), name);
});

test('el metal vectorial de la marca tampoco usa tintes ni la imagen adjunta', () => {
  for (const file of ['MirrorMetalDefs.jsx', 'MirrorWordmark.jsx', 'KronosClock.jsx']) {
    const source = uncomment(read(`src/components/brand/${file}`));
    assertNeutral(source, file);
    assert.doesNotMatch(source, /<(?:img|image)\b|data:image|https?:\/\//i);
  }
});

test('el auditor detecta HEX con alfa, RGB moderno y colores nombrados', () => {
  for (const sample of ['#f00', '#f001', '#ffaa00', '#ffaa00cc', 'rgb(12 13 12 / 50%)', 'rgba(1, 2, 1, .2)', 'color: red', 'oklch(.8 .2 40)']) {
    assert.throws(() => assertNeutral(sample, sample));
  }
  for (const sample of ['#fff', '#fff8', '#a3a3a3cc', 'rgb(12 12 12 / 50%)', 'rgba(1, 1, 1, .2)', 'color: CanvasText']) {
    assert.doesNotThrow(() => assertNeutral(sample, sample));
  }
});

test('negro profundo y texto normal mantienen al menos 4.5:1', () => {
  assert.equal(token('--k-bg'), '#000000');
  assert.equal(token('--k-surface'), '#000000');
  const background = token('--k-surface-3').slice(1);
  for (const name of ['--k-text', '--k-text-soft', '--k-muted', '--k-steel', '--k-success', '--k-danger', '--k-warning']) {
    assert.ok(contrast(token(name).slice(1), background) >= 4.5, name);
  }
});

test('cada parada del cromo de texto y botón conserva contraste AA', () => {
  for (const name of ['--k-material-chrome', '--k-material-chrome-soft']) {
    const stops = hexes(token(name));
    assert.ok(stops.length >= 5, `${name}: necesita reflejos, no plata plana`);
    for (const [literal, hex] of stops) {
      assert.ok(contrast(hex, token('--k-surface-3').slice(1)) >= 4.5, `${name}: ${literal}`);
    }
  }
  for (const name of ['--k-material-chrome-btn', '--k-material-chrome-btn-hover']) {
    const stops = hexes(token(name));
    assert.ok(stops.length >= 5);
    for (const [literal, hex] of stops) {
      assert.ok(contrast(hex, token('--k-on-chrome').slice(1)) >= 4.5, `${name}: ${literal}`);
    }
  }
});

test('el espejo decorativo conserva negros, blancos y reflejos curvos, no sólo gris', () => {
  for (const name of ['--k-material-liquid', '--k-material-chrome-display']) {
    const values = hexes(token(name)).map(([, hex]) => channels(hex)[0]);
    assert.ok(Math.min(...values) <= 17, `${name}: falta el horizonte oscuro`);
    assert.ok(Math.max(...values) === 255, `${name}: falta el reflejo blanco`);
    assert.ok(new Set(values).size >= 8, `${name}: falta volumen entre reflejos`);
  }
  assert.match(token('--k-material-liquid'), /conic-gradient/);
  assert.match(token('--k-material-liquid'), /radial-gradient/);
  assert.equal(token('--k-material-chrome-ring'), 'var(--k-material-liquid)');
});

test('el foco y el texto cromado tienen alternativa en colores forzados', () => {
  const theme = read('src/styles/kronos-html-theme.css');
  assert.match(theme, /:focus-visible\s*\{[^}]*outline:\s*2px solid/);
  assert.match(theme, /@media\s*\(forced-colors:\s*active\)/);
  assert.match(theme, /-webkit-text-fill-color:\s*CanvasText/);
  assert.doesNotMatch(theme, /(?:\.k-avatar|\.k-main-content|\.k-app-shell|#root|body|html)\s*\{[^}]*filter:\s*grayscale/);
});

import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

/**
 * Tarjeta para compartir el enlace (bloque 1.6).
 *
 * El pendiente decía «`index.html` no tiene `og:image` y `vercel.json` no
 * define caché ni robots.txt». Esto comprueba que las tres piezas existen y
 * que la imagen es la **marca vectorial** (anillo, manecillas y órbita), no una
 * foto: se genera desde `public/brand/og-cover.svg`, así que el SVG es la
 * fuente de verdad y el PNG solo su render.
 */

const raiz = path.join(import.meta.dirname, "..");
const leer = (...partes) => fs.readFileSync(path.join(raiz, ...partes), "utf8");

test("la tarjeta de compartir es la marca vectorial, no una foto", () => {
  const html = leer("index.html");
  assert.match(html, /<meta property="og:image" content="https:\/\/kronos-space\.com\/og-cover\.png" \/>/);
  assert.match(html, /<meta property="og:image:width" content="1200" \/>/);
  assert.match(html, /<meta property="og:image:height" content="630" \/>/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
  // Sin duplicar la tarjeta vieja de Twitter (`summary`), que mostraría un
  // cuadro pequeño en lugar de la pieza.
  assert.ok(!/name="twitter:card" content="summary"/.test(html));

  const svg = leer("public", "brand", "og-cover.svg");
  assert.match(svg, /viewBox="0 0 1200 630"/);
  // Los tres elementos de la marca.
  assert.match(svg, /id="aro"/);
  assert.match(svg, /id="orbitaFrente"/);
  assert.match(svg, /id="esfera"/);
  assert.match(svg, />KRONOS-SPACE</);

  const png = fs.statSync(path.join(raiz, "public", "og-cover.png"));
  assert.ok(png.size > 20_000, "el PNG debe existir y no ser un marcador");
  assert.ok(png.size < 2_000_000, "la tarjeta debe pesar poco para cargar al compartir");
});

test("vercel.json cachea lo inmutable y no cachea el armazón", () => {
  const config = JSON.parse(leer("vercel.json"));
  const reglas = new Map(config.headers.map((regla) => [regla.source, Object.fromEntries(regla.headers.map((h) => [h.key, h.value]))]));

  assert.match(reglas.get("/assets/(.*)")["Cache-Control"], /immutable/);
  assert.match(reglas.get("/index.html")["Cache-Control"], /must-revalidate/);
  // El service worker nunca se cachea: si se queda viejo, sirve un armazón
  // que ya no existe.
  assert.match(reglas.get("/sw.js")["Cache-Control"], /must-revalidate/);
  assert.equal(reglas.get("/sw.js")["Service-Worker-Allowed"], "/");
  assert.ok(config.rewrites.some((r) => r.destination === "/index.html"));

  // robots.txt no puede quedar vacío ni bloquear la portada.
  const robots = leer("public", "robots.txt");
  assert.match(robots, /^Allow: \/\$$/m);
  assert.match(robots, /^Disallow: \/$/m);
  assert.match(robots, /Sitemap: https:\/\/kronos-space\.com\/sitemap\.xml/);
});

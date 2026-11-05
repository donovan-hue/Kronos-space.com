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

  // La tarjeta se traza con las mismas piezas que la portada: los `path` del
  // reloj, los degradados de `MirrorMetalDefs` y el rótulo del wordmark. No es
  // otro dibujo: por eso se comprueban los marcadores del propio repo.
  const svg = leer("public", "brand", "og-cover.svg");
  assert.match(svg, /viewBox="0 0 1200 630"/);
  assert.match(svg, /M-132 0 A132 42 0 0 1 132 0/, "semianillo posterior del reloj");
  assert.match(svg, /M132 0 A132 42 0 0 1 -132 0/, "semianillo delantero");
  assert.match(svg, /id="k-face"/);
  assert.match(svg, /id="k-edge"/);
  assert.match(svg, /id="k-rim"/);
  assert.match(svg, /id="k-sphere"/);
  // El rótulo conserva el contraste del wordmark: KRONOS 650, -SPACE 250.
  assert.match(svg, /font-weight="650"[^>]*>KRONOS</);
  assert.match(svg, /font-weight="250"[^>]*>-SPACE</);

  // Y su generador vive en el repo, con las mismas coordenadas.
  const generador = fs.readFileSync(path.join(raiz, "..", "scripts", "brand", "og-cover.mjs"), "utf8");
  assert.match(generador, /A132 42/);
  assert.match(generador, /client", "public"/);

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

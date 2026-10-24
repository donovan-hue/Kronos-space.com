#!/usr/bin/env node
/**
 * CONSOLIDACIÓN DE ESTILOS — una sola identidad.
 *
 * Fusiona todas las hojas del cliente en UNA hoja (`kronos.css`):
 *
 *   · respeta el orden real de import (incluidos los `@import` anidados,
 *     como los de `kronos-system/index.css`),
 *   · resuelve los selectores duplicados fusionando sus declaraciones (no
 *     descarta las anteriores),
 *   · elimina las reglas cuya clase no usa nadie,
 *   · conserva intactas las guardas de accesibilidad (`!important` dentro de
 *     `prefers-reduced-motion` o `forced-colors`),
 *   · conserva el orden real de las reglas: el orden de import ES parte del
 *     contrato (mover una regla cambia la cascada y puede esconder una
 *     superficie entera, como la barra de navegación móvil),
 *
 *   node scripts/styles/consolidate-identity.js            # escribe la hoja
 *   node scripts/styles/consolidate-identity.js --check     # solo informa
 *   node scripts/styles/consolidate-identity.js --from=<ref>
 *
 * Las hojas de origen ya no viven en el árbol: se leen del historial (`git
 * show`), de modo que la consolidación es reproducible y auditable. Si una
 * hoja vuelve a existir en el árbol, manda la del árbol.
 */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const postcss = require("postcss");

const ROOT = path.resolve(__dirname, "..", "..");
const ESTILOS = path.join(ROOT, "client", "src", "styles");
const SALIDA = path.join(ESTILOS, "kronos.css");

/* Commit en el que aún vivían las hojas separadas: es la fuente de la
   consolidación. `--from` permite rehacerla contra otra base. */
const ORIGEN = (process.argv.find((a) => a.startsWith("--from=")) || "--from=f298db9").split("=")[1];

/* ------------------------------------------------------------------ */
/* 1 · Lectura de las hojas de origen (árbol o historial)              */
/* ------------------------------------------------------------------ */
function enGit(ref, ruta) {
  try {
    return execFileSync("git", ["show", `${ref}:${ruta}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

const cache = new Map();
function leer(rutaGit, rutaAbsoluta) {
  if (cache.has(rutaGit)) return cache.get(rutaGit);
  let texto = null;
  if (rutaAbsoluta && fs.existsSync(rutaAbsoluta)) texto = fs.readFileSync(rutaAbsoluta, "utf8");
  else texto = enGit(ORIGEN, rutaGit);
  if (texto === null) throw new Error(`No se encuentra la hoja de origen: ${rutaGit}`);
  cache.set(rutaGit, texto);
  return texto;
}

/* Resuelve `@import` anidados como el navegador: el archivo importado se
   coloca en el lugar de la sentencia. Sin esto, `kronos-system/index.css`
   (que sólo importa) se quedaría vacío. */
function resolverImports(rutaGit, rutaAbsoluta, profundidad = 0) {
  if (profundidad > 8) throw new Error(`Imports anidados demasiado profundos: ${rutaGit}`);
  const ast = postcss.parse(leer(rutaGit, rutaAbsoluta), { from: rutaGit });
  ast.walkAtRules("import", (at) => {
    const m = at.params.match(/^["']([^"']+)["']/);
    if (!m) return;
    const destino = m[1];
    if (/^(https?:)?\/\//.test(destino)) return;
    let hijoRuta, hijoAbs;
    if (rutaGit.includes("/")) {
      const dir = rutaGit.slice(0, rutaGit.lastIndexOf("/"));
      hijoRuta = path.posix.normalize(`${dir}/${destino}`);
      hijoAbs = path.join(ROOT, hijoRuta);
    } else {
      hijoRuta = destino;
      hijoAbs = path.join(ROOT, "client", "src", "styles", destino);
    }
    const hijo = resolverImports(hijoRuta, hijoAbs, profundidad + 1);
    at.replaceWith(hijo.nodes);
  });
  return ast;
}

const appOriginal = enGit(ORIGEN, "client/src/styles/app.css");
if (!appOriginal) {
  console.error(`No se puede leer client/src/styles/app.css en ${ORIGEN}.`);
  process.exit(1);
}

const hojas = [];
for (const m of appOriginal.matchAll(/@import\s+"([^"]+)"(?:\s+layer\(([^)]+)\))?;/g)) {
  const ruta = m[1];
  // El motor (tailwind) y la fuente de tokens se conservan aparte: no son
  // "estilos" del producto, son su motor y su vocabulario.
  if (["tailwind.css", "design-tokens.css"].includes(ruta.replace(/^\.\//, ""))) continue;
  const rutaGit = ruta.startsWith("../") ? `client/src/${ruta.slice(3)}` : `client/src/styles/${ruta.slice(2)}`;
  const absoluta = ruta.startsWith("../") ? path.join(ROOT, "client", "src", ruta.slice(3)) : path.join(ESTILOS, ruta.slice(2));
  hojas.push({ ruta, rutaGit, absoluta });
}

// Hojas que se cargaban junto a su componente: también entran en la única hoja.
for (const nombre of ["video-music.css", "video-sequence.css", "video-tone.css", "video-voice.css"]) {
  const rutaGit = `client/src/styles/${nombre}`;
  const absoluta = path.join(ESTILOS, nombre);
  if (fs.existsSync(absoluta) || enGit(ORIGEN, rutaGit)) {
    hojas.push({ ruta: `./${nombre}`, rutaGit, absoluta });
  }
}

/* ------------------------------------------------------------------ */
/* 2 · Uso real de las clases                                           */
/* ------------------------------------------------------------------ */
function walk(dir, filtro) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".git"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, filtro));
    else if (!filtro || filtro(p)) out.push(p);
  }
  return out;
}

const archivosCodigo = ["client/src", "client/demo"]
  .flatMap((r) => walk(path.join(ROOT, r), (p) => /\.(jsx?|mjs|tsx?)$/.test(p)))
  .map((p) => fs.readFileSync(p, "utf8"));

const usadas = new Set();
const prefijosDinamicos = new Set();
const portadoras = new Set();

/* Una clase está viva si:
   1. aparece en un atributo `class`/`className` (literal o plantilla),
   2. es el resultado de una interpolación (`k-badge-${estado}` → prefijo
      `k-badge-`, que habilita a todas sus variantes),
   3. o se usa en el DOM desde código (`querySelector('.x')`,
      `classList.add('x')`, `classList.toggle('x')`…).

   No se cuenta "cualquier cadena del código": palabras sueltas como `app`,
   `d` o `sm` darían por vivas reglas del port que ya no tienen consumidor. */
for (const fuente of archivosCodigo) {
  // 1 · atributos class/className. Se toma la expresión completa (literal,
  //     plantilla o ternario) y se extraen de ella todas las cadenas.
  for (const m of fuente.matchAll(/class(?:Name)?\s*=\s*(\{[^}]*\}|"[^"]*"|'[^']*'|`[^`]*`)/g)) {
    for (const literal of m[1].matchAll(/["'`]([^"'`]*)["'`]/g)) {
      for (const token of literal[1].split(/\s+/)) {
        // `k-studio-lienzo${x}`: la parte estática es el nombre de la clase.
        const estatico = token.split("${")[0].replace(/[^A-Za-z0-9_-]/g, "");
        if (!/^[A-Za-z][\w-]*$/.test(estatico)) continue;
        usadas.add(estatico);
        // Si el token traía interpolación, el sufijo es dinámico: la familia
        // entera queda viva (`k-badge-pending` sin escribirla).
        if (token.includes("${")) prefijosDinamicos.add(`${estatico}-`);
      }
    }
  }
  // 1b · variables que llevan las clases: `const clase = `brand ${x}``
  //      y luego `className={clase}`.
  for (const m of fuente.matchAll(/class(?:Name)?\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g)) portadoras.add(m[1]);
  for (const portadora of portadoras) {
    const definicion = new RegExp(`(?:const|let|var)\\s+${portadora}\\s*=\\s*([^;]+);`).exec(fuente);
    if (!definicion) continue;
    for (const m of definicion[1].matchAll(/["'`]([^"'`]*)["'`]/g)) {
      for (const token of m[1].split(/\s+/)) {
        const estatico = token.split("${")[0].replace(/[^A-Za-z0-9_-]/g, "");
        if (!/^[A-Za-z][\w-]*$/.test(estatico)) continue;
        usadas.add(estatico);
        if (token.includes("${")) prefijosDinamicos.add(`${estatico}-`);
      }
    }
  }
  // 2 · prefijos dinámicos sueltos: `k-badge-${estado}` en cualquier punto
  for (const m of fuente.matchAll(/([a-zA-Z][\w-]*?)-?\$\{/g)) {
    prefijosDinamicos.add(`${m[1]}-`);
  }
  // 3 · uso directo en el DOM
  for (const m of fuente.matchAll(/(?:querySelector|querySelectorAll|closest|matches)\(\s*["'`]\.([A-Za-z][\w-]*)/g)) usadas.add(m[1]);
  for (const m of fuente.matchAll(/classList\.(?:add|remove|toggle|contains|replace)\(\s*["'`]([A-Za-z][\w-]*)/g)) usadas.add(m[1]);
  for (const m of fuente.matchAll(/setAttribute\(\s*["'`]class["'`]\s*,\s*["'`]([^"'`]*)/g)) {
    for (const t of m[1].split(/\s+/)) if (/^[A-Za-z][\w-]*$/.test(t)) usadas.add(t);
  }
}

/* Una clase se considera viva si aparece literal, si es el resultado de una
   interpolación (`k-badge-${estado}`) o si algún prefijo dinámico la cubre. */
const usaClase = (c) =>
  usadas.has(c) ||
  [...prefijosDinamicos].some((p) => p && c.startsWith(p) && c.length > p.length);

/* ------------------------------------------------------------------ */
/* 3 · Recorrido y fusión                                               */
/* ------------------------------------------------------------------ */
const reglas = new Map(); // clave -> {sel, ctx, decls, orden, hojas:Set}
let contador = 0;
const conservadas = [];
const descartadas = { muertas: 0, duplicadas: 0, guardas: 0 };
const detalleMuertas = [];

function claveDe(ctx, selector) {
  return `${ctx.join("|")}||${selector.replace(/\s+/g, " ").trim().toLowerCase()}`;
}

function clasesDe(selector) {
  return [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
}

function recolectar(hoja, ctx, padre) {
  padre.each((child) => {
    if (child.type === "rule") {
      const decls = [];
      child.each((d) => {
        if (d.type === "decl") decls.push({ prop: d.prop, value: d.value, important: Boolean(d.important) });
      });
      if (decls.length) {
        const selector = child.selector.replace(/\s+/g, " ").trim();
        const clases = clasesDe(selector);
        // Una guarda de accesibilidad nunca se borra, aunque su clase no se
        // use: protege a quien sí la use en el futuro.
        const esGuarda = decls.some((d) => d.important);
        const muerta = !esGuarda && clases.length > 0 && clases.every((c) => !usaClase(c));
        if (muerta) {
          descartadas.muertas++;
          detalleMuertas.push(`${hoja} :: ${selector}`);
        } else {
          if (esGuarda) descartadas.guardas++;
          const clave = claveDe(ctx, selector);
          const previa = reglas.get(clave);
          if (previa) {
            // Mismo selector y mismo contexto: se fusionan las declaraciones
            // (la posterior gana) pero la regla CONSERVA SU PRIMERA POSICIÓN.
            //
            // Moverla al final cambiaría la cascada: una regla intermedia que
            // depende del orden (por ejemplo un `display:none` base seguido de
            // un `display:grid` dentro de una media query) dejaría de ganar.
            // Ese caso real: `.k-mobile-navigation` es `display:none` en la
            // base y `display:grid` por debajo de 700px. Si la regla base
            // acaba despues de la media query, la barra movil desaparece.
            for (const d of decls) {
              const i = previa.decls.findIndex((x) => x.prop === d.prop);
              if (i >= 0) previa.decls[i] = d;
              else previa.decls.push(d);
            }
            previa.hojas.add(hoja);
            descartadas.duplicadas++;
          } else {
            reglas.set(clave, { selector, ctx: [...ctx], decls, orden: contador++, hojas: new Set([hoja]) });
          }
          conservadas.push(clave);
        }
      }
    } else if (child.type === "atrule") {
      if (child.name === "keyframes") {
        // Los fotogramas no se fusionan: se copian tal cual.
        const bloque = [];
        child.each((k) => {
          if (k.type === "rule") {
            const decls = [];
            k.each((d) => {
              if (d.type === "decl") decls.push({ prop: d.prop, value: d.value, important: Boolean(d.important) });
            });
            bloque.push({ selector: k.selector, decls });
          }
        });
        reglas.set(`KEYFRAMES|${child.params}|${hoja}`, { keyframes: true, params: child.params, bloque, orden: contador++, hojas: new Set([hoja]) });
      } else {
        recolectar(hoja, [...ctx, `@${child.name} ${child.params}`.trim()], child);
      }
    }
  });
}

for (const { ruta, rutaGit, absoluta } of hojas) {
  const ast = resolverImports(rutaGit, absoluta);
  recolectar(ruta, [], ast);
}

/* ------------------------------------------------------------------ */
/* 4 · Escritura de la hoja única                                       */
/* ------------------------------------------------------------------ */
function escribir(regla, sangria) {
  const pre = " ".repeat(sangria);
  if (regla.keyframes) {
    const lineas = regla.bloque
      .map((k) => `${pre}  ${k.selector} {\n${k.decls.map((d) => `${pre}    ${d.prop}: ${d.value}${d.important ? " !important" : ""};`).join("\n")}\n${pre}  }`)
      .join("\n");
    return `${pre}@keyframes ${regla.params} {\n${lineas}\n${pre}}`;
  }
  if (regla.ctx.length) {
    // El contexto se reconstruye como bloque anidado.
    const at = regla.ctx[0];
    const m = at.match(/^@(\w+)\s*(.*)$/);
    const nombre = m[1];
    const params = m[2];
    const cuerpo = escribir({ ...regla, ctx: regla.ctx.slice(1) }, sangria + 2);
    return `${pre}@${nombre} ${params} {\n${cuerpo}\n${pre}}`;
  }
  const cuerpo = regla.decls.map((d) => `${pre}  ${d.prop}: ${d.value}${d.important ? " !important" : ""};`).join("\n");
  return `${pre}${regla.selector} {\n${cuerpo}\n${pre}}`;
}

const ordenadas = [...reglas.values()].sort((a, b) => a.orden - b.orden);

/* Cada bloque conserva el origen de sus reglas: la hoja única sigue siendo
   legible y se puede saber de dónde vino cada cosa. El orden dentro de cada
   grupo es el del archivo de origen; los grupos se emiten en el orden en que
   se encontraron, que es el orden real de import. */
function conOrden(reglas_, titulo) {
  const grupos = new Map();
  for (const r of reglas_) {
    const origen = [...r.hojas].sort()[0] || titulo;
    if (!grupos.has(origen)) grupos.set(origen, []);
    grupos.get(origen).push(r);
  }
  const salida = [];
  for (const [origen, lista] of grupos) {
    salida.push(`/* ---------- ${origen} ---------- */`);
    salida.push(lista.map((r) => escribir(r, 0)).join("\n\n"));
  }
  return salida.join("\n\n");
}

const cabecera = `/* ============================================================
   KRONOS — IDENTIDAD ÚNICA
   Negro profundo + cromo líquido + reloj 3D en movimiento constante.

   Esta hoja sustituye a todas las anteriores: no hay una segunda capa
   que la tape ni estilos por pantalla. Cada regla vive aquí, en un
   único sitio. Las guardas de accesibilidad (movimiento reducido,
   colores forzados) se conservan.

   El orden de las reglas es el MISMO que tenían en sus hojas de
   origen: el orden de import es parte del contrato. Mover una regla
   cambia la cascada. Por eso el bloque de identidad
   (kronos-html-theme.css) se queda donde estaba, no al final.

   Generada por scripts/styles/consolidate-identity.js
   ============================================================ */

`;

const cuerpo = conOrden(ordenadas, "estructura");

const salida = cabecera + cuerpo + "\n";

console.log(`reglas: ${conservadas.length} (muertas fuera: ${descartadas.muertas}, duplicadas fundidas: ${descartadas.duplicadas}, guardas conservadas: ${descartadas.guardas})`);
console.log(`hojas de origen: ${hojas.length} -> 1 (base: ${ORIGEN})`);
console.log(`peso: ${(Buffer.byteLength(salida) / 1024).toFixed(0)} KB`);
if (process.argv.includes("--detalle")) {
  console.log("\n-- reglas eliminadas por clase sin uso --");
  for (const d of detalleMuertas.sort()) console.log(d);
}

if (process.argv.includes("--check")) {
  const actual = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, "utf8") : "";
  console.log(actual === salida ? "la hoja consolidada está al día" : "la hoja consolidada está DESFASADA");
  process.exit(actual === salida ? 0 : 1);
}

fs.writeFileSync(SALIDA, salida, "utf8");
console.log(`escrito: ${path.relative(ROOT, SALIDA)}`);

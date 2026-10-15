/* ============================================================
   BARRIDO DE UTILIDADES — lo que el código declara contra lo que
   el motor compiló de verdad

   Este proyecto escribe clases de Tailwind en el kit (diálogos,
   menús, recortador) y también clases propias del sistema (k-*).
   Durante meses el motor no existía, así que muchas clases se
   veían en el código pero no producían ni una regla: geometrías
   enteras dependían de parches escritos a mano.

   Este barrido recorre cada `className` del código y comprueba,
   una por una, que la clase exista en el CSS construido. Toda
   clase que se use y no exista es una clase inerte: se ve en el
   código, no hace nada. El barrido las lista con archivo y línea.

   Uso:
     node scripts/ci/barrido-utilidades.mjs            (informe)
     node scripts/ci/barrido-utilidades.mjs --estricto (falla si hay)

   Requiere el CSS construido: `npm run build` en client/ primero.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = process.cwd();
const CLIENTE = path.join(RAIZ, "client");
const DIST = path.join(CLIENTE, "dist", "assets");
const ESTRICTO = process.argv.includes("--estricto");

const VERDE = "\x1b[32m";
const ROJO = "\x1b[31m";
const GRIS = "\x1b[90m";
const FIN = "\x1b[0m";

// ---------------------------------------------------------------
// 1. El CSS construido: de ahí sale la lista de clases que existen.
// ---------------------------------------------------------------
function cssConstruido() {
  if (!fs.existsSync(DIST)) {
    console.error(`${ROJO}Falta client/dist. Corre \`npm run build\` en client/ antes del barrido.${FIN}`);
    process.exit(1);
  }
  const hojas = fs
    .readdirSync(DIST)
    .filter((f) => f.endsWith(".css"))
    .map((f) => ({ f, peso: fs.statSync(path.join(DIST, f)).size }))
    .sort((a, b) => b.peso - a.peso);
  if (!hojas.length) {
    console.error(`${ROJO}Sin hojas de estilo en client/dist/assets.${FIN}`);
    process.exit(1);
  }
  const todas = hojas.filter((h) => h.f.endsWith(".css"));
  const texto = todas.map((h) => fs.readFileSync(path.join(DIST, h.f), "utf8")).join("\n");
  return { texto, hojas: todas, mayor: hojas[0] };
}

// Nombre de clase tal como queda en el CSS (con escapes) → nombre real.
function desescapar(nombre) {
  return nombre.replace(/\\(.)/g, "$1");
}

function clasesDelCss(css) {
  const set = new Set();
  const re = /\.((?:[a-zA-Z0-9_-]|\\.)+)/g;
  let m;
  while ((m = re.exec(css))) set.add(desescapar(m[1]));
  return set;
}

// ---------------------------------------------------------------
// 1b. Las clases que el tema escribio a mano.
//
//     El paquete final no conserva las capas, asi que el choque no se
//     puede leer del CSS construido: se lee de la fuente. Toda clase
//     que viva en un CSS escrito a mano y ademas sea nombre de utilidad
//     es una colision: la de a mano va despues y gana la cascada, con
//     lo que la utilidad compila pero no manda.
// ---------------------------------------------------------------
function clasesEscritasAMano() {
  const raizEstilos = path.join(CLIENTE, "src", "styles");
  const map = new Map();
  const cubiertas = new Set();
  const pila = [raizEstilos];
  while (pila.length) {
    const actual = pila.pop();
    for (const entrada of fs.readdirSync(actual, { withFileTypes: true })) {
      const ruta = path.join(actual, entrada.name);
      if (entrada.isDirectory()) {
        pila.push(ruta);
        continue;
      }
      if (!entrada.name.endsWith(".css")) continue;
      // tailwind.css es la hoja del motor, no el tema.
      if (entrada.name === "tailwind.css") continue;
      const texto = fs.readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      // Solo cuentan las clases que van solas en su selector (.grid), no las
      // compuestas (.btn.block): una compuesta no choca con la utilidad.
      for (const bloque of texto.match(/[^{}]+\{[^{}]*\}/g) || []) {
        const selectores = bloque.slice(0, bloque.indexOf("{")).split(",");
        for (const selector of selectores) {
          for (const parte of selector.split(/[\s>+~]+/)) {
            const limpio = parte.trim().replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "");
            const m = /^\.([a-zA-Z0-9_-]+)$/.exec(limpio);
            if (m) {
              const nombre = desescapar(m[1]);
              // Una regla guardada con :not([class*="..."]) no le roba el
              // efecto a la utilidad: solo aplica donde la utilidad no esta.
              if (/:not\(\[class\*=/.test(selector)) cubiertas.add(nombre);
              const cuerpo = bloque.slice(bloque.indexOf("{") + 1);
              const props = new Set(map.get(nombre) || []);
              for (const decl of cuerpo.split(";")) {
                const prop = decl.split(":")[0].trim();
                if (prop && !prop.startsWith("@")) props.add(prop);
              }
              map.set(nombre, props);
            }
          }
        }
      }
    }
  }
  return { map, cubiertas };
}

// ---------------------------------------------------------------
// 2. Los archivos del repositorio (lo que de verdad se versiona).
// ---------------------------------------------------------------
function archivosFuente() {
  let lista;
  try {
    lista = execFileSync("git", ["ls-files", "client/src"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    lista = [];
  }
  return lista
    .filter((f) => /\.(jsx?|mjs)$/.test(f))
    .map((f) => path.join(RAIZ, f));
}

// ---------------------------------------------------------------
// 3. Los className del código. Se saltan los que se arman con
//    interpolación: esos no se pueden juzgar de forma estática.
// ---------------------------------------------------------------
function literalesDe(bloque) {
  const salida = [];
  for (let i = 0; i < bloque.length; i += 1) {
    const c = bloque[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let texto = "";
      while (j < bloque.length && bloque[j] !== c) {
        if (bloque[j] === "\\") j += 1;
        texto += bloque[j] ?? "";
        j += 1;
      }
      salida.push({ texto, cita: c });
      i = j;
    }
  }
  return salida;
}

// Un mismo archivo declara clases en varios sitios: el atributo className,
// las variantes del kit (cva/tv) y los ayudantes de composición (cn/clsx).
// El barrido los mira todos: una clase declarada en cualquiera de ellos
// tiene que existir en el CSS igual que las demás.
const FUENTES_DE_CLASE = [
  /className\s*=\s*/g,
  /\bcva\(\s*/g,
  /\btv\(\s*/g,
  /\bcn\(\s*/g,
  /\bclsx\(\s*/g
];

function bloqueDesde(fuente, inicio) {
  const c = fuente[inicio];
  if (c === '"' || c === "'" || c === "`") {
    const fin = fuente.indexOf(c, inicio + 1);
    return fuente.slice(inicio, fin + 1);
  }
  if (c === "{" || c === "(") {
    const abre = c;
    const cierra = c === "{" ? "}" : ")";
    let nivel = 0;
    for (let j = inicio; j < fuente.length; j += 1) {
      if (fuente[j] === abre) nivel += 1;
      else if (fuente[j] === cierra) {
        nivel -= 1;
        if (nivel === 0) return fuente.slice(inicio, j + 1);
      }
    }
  }
  return null;
}

function classNamesDe(fuente) {
  const encontrados = [];
  for (const re of FUENTES_DE_CLASE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(fuente))) {
      const bloque = bloqueDesde(fuente, m.index + m[0].length);
      if (!bloque) continue;
      const linea = fuente.slice(0, m.index).split("\n").length;
      for (const { texto, cita } of literalesDe(bloque)) {
        if (cita === "`" && texto.includes("${")) continue;
        if (texto.includes("${")) continue;
        for (const token of texto.split(/\s+/)) {
          if (!token) continue;
          encontrados.push({ token, linea });
        }
      }
    }
  }
  return encontrados;
}

// ---------------------------------------------------------------
// 3b. Que es una utilidad del motor y que es una clase propia.
//
//     Las utilidades son las que el motor de Tailwind convierte en
//     CSS (p-5, w-[min(...)], hover:bg-white/10, -translate-x-1/2).
//     Las propias son las del sistema de la casa (k-*, o nombres de
//     pantalla como comment-composer). Aqui importa la distincion:
//     una utilidad sin regla es una geometria o una tipografia que
//     se cae; una clase propia sin regla es un nombre suelto.
// ---------------------------------------------------------------

const PREFIJOS_UTILIDAD = new Set([
  "p", "px", "py", "pt", "pb", "pl", "pr", "ps", "pe",
  "m", "mx", "my", "mt", "mb", "ml", "mr", "ms", "me",
  "w", "h", "min-w", "max-w", "min-h", "max-h", "size",
  "gap", "grid", "col", "row", "flex", "items", "justify", "content", "self", "place", "order", "basis", "grow", "shrink",
  "text", "font", "leading", "tracking", "whitespace", "break", "line-clamp", "uppercase", "lowercase", "capitalize", "truncate", "italic", "underline", "decoration",
  "bg", "border", "rounded", "shadow", "opacity", "ring", "outline", "divide", "fill", "stroke",
  "z", "top", "right", "bottom", "left", "inset", "absolute", "relative", "fixed", "sticky", "static",
  "hidden", "block", "inline", "inline-block", "inline-flex", "table", "contents", "flow-root", "list-item",
  "overflow", "overscroll", "scroll", "snap", "touch", "resize", "appearance", "accent", "caret",
  "transition", "duration", "ease", "animate", "translate", "scale", "rotate", "origin", "transform",
  "cursor", "select", "pointer-events", "aspect", "object", "backdrop", "filter", "blur", "brightness", "contrast",
  "grayscale", "hue-rotate", "invert", "saturate", "sepia", "drop-shadow", "will-change", "contain", "isolation", "mix-blend",
  "float", "clear", "columns", "box", "visible", "invisible", "collapse", "sr-only", "not-sr-only", "antialiased", "subpixel"
]);

const SUELTAS_RECONOCIDAS = new Set([
  "flex", "grid", "block", "inline", "hidden", "relative", "absolute", "fixed", "sticky", "static",
  "table", "contents", "flow-root", "list-item", "truncate", "italic", "underline", "visible",
  "invisible", "antialiased", "subpixel", "sr-only", "capitalize", "uppercase", "lowercase"
]);

function esUtilidad(token) {
  let base = token.includes(":") ? token.slice(token.lastIndexOf(":") + 1) : token;
  if (base.startsWith("-")) base = base.slice(1);
  if (!base) return false;
  if (SUELTAS_RECONOCIDAS.has(base)) return true;
  const raiz = base.split("-")[0];
  if (PREFIJOS_UTILIDAD.has(raiz)) return true;
  if (/^[a-z]+-\[/.test(base)) return true;
  return false;
}

// ---------------------------------------------------------------
// 4. El cruce.
// ---------------------------------------------------------------
const { texto: css, hojas, mayor } = cssConstruido();
const clases = clasesDelCss(css);
const archivos = archivosFuente();

const inertes = [];
let totalClases = 0;

for (const archivo of archivos) {
  const fuente = fs.readFileSync(archivo, "utf8");
  for (const { token, linea } of classNamesDe(fuente)) {
    totalClases += 1;
    if (clases.has(token)) continue;
    inertes.push({ archivo: path.relative(RAIZ, archivo), linea, token });
  }
}

// ---------------------------------------------------------------
// 5. Informe.
// ---------------------------------------------------------------
console.log("");
console.log("  BARRIDO DE UTILIDADES");
console.log(`  CSS construido: ${mayor.f} (${(mayor.peso / 1024).toFixed(1)} kB) + ${hojas.length - 1} hoja(s) mas`);
console.log(`  Clases distintas que existen en el CSS: ${clases.size}`);
console.log(`  Archivos revisados: ${archivos.length}`);
console.log(`  Clases declaradas en className: ${totalClases}`);
console.log("");

if (!inertes.length) {
  console.log(`  ${VERDE}Toda clase declarada existe en el CSS construido.${FIN}`);
  console.log(`  ${GRIS}Ninguna geometria ni tipografia depende de una clase sin regla.${FIN}`);
  console.log("");
  process.exit(0);
}

// Colisiones: una clase que el tema escribio a mano y que ademas es utilidad
// del motor. La de a mano gana la cascada, asi que la utilidad compila pero no
// manda: el codigo pide una medida y sale otra. Se comprueba solo sobre las
// clases que el codigo usa de verdad.
const { map: aMano, cubiertas } = clasesEscritasAMano();
const colisiones = [];
for (const archivo of archivos) {
  const fuente = fs.readFileSync(archivo, "utf8");
  for (const { token, linea } of classNamesDe(fuente)) {
    if (esUtilidad(token) && aMano.has(token) && !cubiertas.has(token)) {
      colisiones.push({ archivo: path.relative(RAIZ, archivo), linea, token });
    }
  }
}

const utilidadesInertes = inertes.filter((f) => esUtilidad(f.token));
const propiasInertes = inertes.filter((f) => !esUtilidad(f.token));

if (utilidadesInertes.length) {
  console.log(`  ${ROJO}Utilidades del motor sin regla: ${utilidadesInertes.length}${FIN}`);
  console.log(`  ${GRIS}Estas son las graves: geometria o tipografia que se cae.${FIN}`);
  console.log("");
  for (const { archivo, linea, token } of utilidadesInertes) {
    console.log(`    ${archivo}:${linea}  ${token}`);
  }
  console.log("");
} else {
  console.log(`  ${VERDE}Cero utilidades del motor sin regla.${FIN}`);
  console.log(`  ${GRIS}Toda geometria y toda tipografia declarada con utilidades tiene su regla compilada.${FIN}`);
  console.log("");
}

if (cubiertas.size) {
  const nombres = [...cubiertas].filter((n) => esUtilidad(n));
  if (nombres.length) {
    console.log(`  ${VERDE}Reglas del tema ya guardadas frente al motor: ${nombres.map((n) => "." + n).join(", ")}.${FIN}`);
    console.log(`  ${GRIS}Declaran su medida solo donde la utilidad no la pide: no le roban el efecto.${FIN}`);
    console.log("");
  }
}

if (colisiones.length) {
  const distintos = [...new Set(colisiones.map((c) => c.token))];
  console.log(`  ${ROJO}Colisiones entre el tema escrito a mano y el motor: ${colisiones.length} usos, ${distintos.length} nombres.${FIN}`);
  console.log(`  ${GRIS}La clase existe en los dos lados. El CSS sin capas gana la cascada: la utilidad`);
  console.log(`  compila, pero no manda. Donde el codigo pida una medida con esa clase, sale otra.${FIN}`);
  for (const token of distintos) {
    const donde = colisiones.filter((c) => c.token === token);
    const props = [...(aMano.get(token) || [])].join(", ") || "sin propiedades";
    console.log(`    .${token}  (${donde.length} usos; p.ej. ${donde[0].archivo}:${donde[0].linea})`);
    console.log(`      ${GRIS}el tema le declara: ${props}${FIN}`);
  }
  console.log("");
}

if (propiasInertes.length) {
  const distintas = new Set(propiasInertes.map((f) => f.token));
  console.log(`  ${GRIS}Clases propias sin regla propia: ${propiasInertes.length} usos, ${distintas.size} nombres.${FIN}`);
  console.log(`  ${GRIS}No todas son defecto: un nombre puede no necesitar regla si un selector padre ya`);
  console.log(`  las alcanza. Quedan listadas para revisarlas una por una, sin borrar nada.${FIN}`);
  console.log("");
  const porArchivo = new Map();
  for (const fila of propiasInertes) {
    if (!porArchivo.has(fila.archivo)) porArchivo.set(fila.archivo, []);
    porArchivo.get(fila.archivo).push(fila);
  }
  for (const [archivo, filas] of [...porArchivo.entries()].sort()) {
    console.log(`  ${archivo}`);
    for (const { linea, token } of filas) console.log(`    ${GRIS}linea ${linea}: ${token}${FIN}`);
    console.log("");
  }
}

// ---------------------------------------------------------------
// Cascada: los dos defectos de geometria que este barrido destapo,
// ahora con asercion permanente. La spec de navegador
// (`kit-consumidores.spec.js`) los mide en vivo; esto los caza
// tambien sin navegador, en el paso del CI que ya corre el barrido.
//
//   (1) `.grid` del tema definia hueco y le ganaba a la utilidad: todo
//       `grid gap-N` rendia 12.8px. La regla del tema ahora lleva
//       `:not([class*="gap-"])`.
//   (2) El reseteo universal `*{margin:0;padding:0}` vivia sin capa y
//       anulaba en silencio todo margen y relleno declarado con
//       utilidad (`mt-1` media 0px). Ahora vive dentro de `@layer base`.
// ---------------------------------------------------------------

// Devuelve la pila de bloques que encierran un indice del CSS
// (`@layer`, `@media`, ...), de fuera hacia adentro.
function encierros(css, indice) {
  const pila = [];
  let inicio = 0;
  for (let i = 0; i < indice; i += 1) {
    const c = css[i];
    if (c === "{") {
      pila.push(css.slice(inicio, i).trim());
      inicio = i + 1;
    } else if (c === "}") {
      pila.pop();
      inicio = i + 1;
    } else if (c === ";") {
      inicio = i + 1;
    }
  }
  return pila;
}

const defectos = [];

// (2) Reseteo universal sin capa que toque margen o relleno.
for (const m of css.matchAll(/(^|[\n},;])\s*\*(?=[,{])/gm)) {
  const indice = m.index + m[0].lastIndexOf("*");
  const cuerpo = css.slice(indice, css.indexOf("}", indice));
  if (!/\b(margin|padding)\s*:\s*0/.test(cuerpo)) continue;
  if (!encierros(css, indice).some((p) => p.startsWith("@layer"))) {
    defectos.push(`reseteo universal sin capa: ${cuerpo.slice(0, 60)}`);
  }
}

// (1) `.grid` del tema declarando hueco sin guarda frente a la utilidad.
for (const m of css.matchAll(/(^|[\n},;])\s*(\.grid[^{]{0,60})\{([^}]*)\}/gm)) {
  const selector = m[2];
  if (/gap\s*:/.test(m[3]) && !selector.includes("gap-")) {
    defectos.push(`.grid con hueco sin guarda: ${selector}{${m[3].slice(0, 40)}}`);
  }
}

// (1b) Bases del dialogo que pisen el tamanio o el hueco que pide la pantalla.
for (const m of css.matchAll(/(^|[\n},;])\s*\[data-slot=(?:"dialog-content"|dialog-content)\](\[[^\]]*\])?\{([^}]*)\}/gm)) {
  if (/\b(gap|width|max-height)\s*:/.test(m[3])) {
    defectos.push(`base del dialogo sin guarda: ${m[3].slice(0, 60)}`);
  }
}

if (defectos.length) {
  console.log(`  ${ROJO}Cascada: defectos de geometria de vuelta (${defectos.length}).${FIN}`);
  console.log(`  ${GRIS}Una regla sin guarda vuelve a robarle el efecto a la utilidad.${FIN}`);
  for (const d of defectos) console.log(`    ${d}`);
  console.log("");
} else {
  console.log(`  ${VERDE}Cascada: las tres guardas siguen en pie.${FIN}`);
  console.log(`  ${GRIS}El reseteo vive en \`@layer base\`, \`.grid\` respeta \`gap-N\` y las bases del dialogo no pisan el tamanio que pide la pantalla.${FIN}`);
  console.log("");
}

// El porton mira las utilidades inertes y los defectos de cascada: son las
// dos formas en que una medida declarada deja de rendir lo que dice.
// Las clases propias quedan como hallazgo documentado.
process.exit(ESTRICTO && (utilidadesInertes.length || defectos.length) ? 1 : 0);

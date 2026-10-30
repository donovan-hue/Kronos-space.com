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
// 2. El árbol de trabajo (lo que se compila hoy).
// ---------------------------------------------------------------
/**
 * Se recorre `client/src` en disco en vez de preguntar a `git ls-files`. El índice
 * de git incluye archivos que ya no existen —un `git rm` a medio commitear hacía
 * saltar el barrido con un `ENOENT`— y sobre todo **no** incluye los archivos
 * nuevos todavía sin registrar, que son justo los que pueden traer una clase sin
 * regla. Leer el árbol quita las dos cegueras.
 */
function archivosFuente() {
  const salida = [];
  const raizCliente = path.join(RAIZ, "client", "src");
  if (!fs.existsSync(raizCliente)) return salida;
  const caminar = (directorio) => {
    for (const entrada of fs.readdirSync(directorio, { withFileTypes: true })) {
      const ruta = path.join(directorio, entrada.name);
      if (entrada.isDirectory()) caminar(ruta);
      else if (/\.(jsx?|mjs)$/.test(entrada.name)) salida.push(ruta);
    }
  };
  caminar(raizCliente);
  return salida.sort();
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
// 4b. Huerfanas: el barrido al reves.
//
//     Arriba se pregunta «toda clase que uso, existe?». Con --huerfanas se
//     pregunta lo contrario: «toda clase que el tema declara, la usa
//     alguien?». Las dos direcciones hace falta mirarlas: la primera caza
//     geometrias que se caen; la segunda, CSS que se escribe, se compila,
//     pesa en la hoja final y no pinta nada nunca.
//
//     El criterio es ancho a proposito para no mandar a borrar nada vivo:
//     una regla se declara huerfana solo si su nombre no aparece como palabra
//     completa en ningun .js/.jsx de `client/src` (no solo en `className`:
//     cuenta querySelector, un string en un helper, el default de una prop).
//     Y si el nombre puede estar armandose en el codigo —un template literal
//     con `${` dentro de una declaracion de clase— no se afirma: se informa
//     como «no verificable» y no entra en el cupo.
//
//     El cupo vive en `scripts/ci/estilo-huerfanas.json`. No es un numero
//     redondo: es la lista exacta de lo que hoy nadie usa, y solo puede
//     ponerse mas corta. Aparecer ahi es un recordatorio con nombre y
//     archivo, no un permiso.
// ---------------------------------------------------------------

const CUPO_HUERFANAS = path.join(RAIZ, "scripts", "ci", "estilo-huerfanas.json");
const RAIZ_TEMA = path.join(CLIENTE, "src", "styles");

/**
 * Clases propias escritas a mano en el tema, con el archivo donde nacen.
 * Se recorre la fuente y no el CSS construido: el paquete final viene de
 * purgar y reordenar, y una regla que sobrevivió al build no dice si alguien
 * la pidió alguna vez.
 */
function clasesPropiasDelTema() {
  const mapa = new Map();
  const pila = [RAIZ_TEMA];

  while (pila.length) {
    const actual = pila.pop();

    for (const entrada of fs.readdirSync(actual, { withFileTypes: true })) {
      const ruta = path.join(actual, entrada.name);

      if (entrada.isDirectory()) {
        pila.push(ruta);
        continue;
      }

      if (!entrada.name.endsWith(".css") || entrada.name === "tailwind.css") continue;

      const texto = fs.readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

      for (const bloque of texto.match(/[^{}]+\{[^{}]*\}/g) || []) {
        const selectores = bloque.slice(0, bloque.indexOf("{")).split(",");

        for (const selector of selectores) {
          for (const parte of selector.split(/[\s>+~]+/)) {
            const limpio = parte.trim().replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "");
            const m = /^\.([a-zA-Z0-9_-]+)$/.exec(limpio);

            if (m) {
              const nombre = desescapar(m[1]);

              if (!mapa.has(nombre)) mapa.set(nombre, path.relative(RAIZ, ruta));
            }
          }
        }
      }
    }
  }

  return mapa;
}

/**
 * Prefijos de clases que el código arma con interpolación: en
 * `className={`k-itemo-${tipo}`}` la parte fija es `k-itemo-`. Cualquier regla
 * declarada que empiece así puede estar viva y este barrido no puede saberlo
 * leyendo texto, así que no la acusa: la lista aparte como «no verificable».
 *
 * Solo cuentan las fuentes de clase (className, cva, tv, cn, clsx): si se
 * mirara cualquier literal con `${` en el archivo, un `id={`x-${n}`}`
 * cualquiera convertiría media hoja de estilo en «no verificable» y el modo
 * no diría nada.
 */
function prefijosDinamicosDeClases() {
  const prefijos = new Set();

  for (const archivo of archivos) {
    const fuente = fs.readFileSync(archivo, "utf8");

    for (const re of FUENTES_DE_CLASE) {
      re.lastIndex = 0;

      let m;

      while ((m = re.exec(fuente))) {
        const bloque = bloqueDesde(fuente, m.index + m[0].length);

        if (!bloque) continue;

        for (const { texto } of literalesDe(bloque)) {
          for (const token of texto.split(/\s+/)) {
            const corte = token.indexOf("${");

            if (corte > 3) prefijos.add(token.slice(0, corte));
          }
        }
      }
    }
  }

  return prefijos;
}

const DIRECTORIOS_DE_PRUEBAS = ["client/test", "client/test-ui", "client/test-browser", "client/e2e"];

/**
 * Las pruebas también son consumidores: una regla que solo aparece en un
 * `.spec` no decora nada en pantalla, pero borrarla rompe esa prueba. Merece
 * salir nombrada en el informe, no mezclada con las que nadie mira.
 */
function textoDePruebas() {
  let acumulado = "";

  for (const relativo of DIRECTORIOS_DE_PRUEBAS) {
    const directorio = path.join(RAIZ, relativo);

    if (!fs.existsSync(directorio)) continue;

    const caminar = (d) => {
      for (const entrada of fs.readdirSync(d, { withFileTypes: true })) {
        const ruta = path.join(d, entrada.name);

        if (entrada.isDirectory()) caminar(ruta);
        else if (/\.[cm]?jsx?$/.test(entrada.name)) acumulado += `${fs.readFileSync(ruta, "utf8")}\n`;
      }
    };

    caminar(directorio);
  }

  return acumulado;
}

function huerfanas() {
  const declaradas = clasesPropiasDelTema();
  const textoProducto = (() => {
    let acumulado = "";

    for (const archivo of archivos) {
      if (/\.css$/.test(archivo)) continue;
      acumulado += fs.readFileSync(archivo, "utf8") + "\n";
    }

    return acumulado;
  })();
  const prefijos = [...prefijosDinamicosDeClases()];
  const cacheUso = new Map();
  const esc = (nombre) => nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const diceUso = (nombre) => {
    if (cacheUso.has(nombre)) return cacheUso.get(nombre);

    const viva = new RegExp(`(^|[^a-zA-Z0-9_-])${esc(nombre)}([^a-zA-Z0-9_-]|$)`).test(textoProducto);

    cacheUso.set(nombre, viva);

    return viva;
  };

  const pruebas = textoDePruebas();
  const soloEnPruebas = (nombre) =>
    new RegExp(`(^|[^a-zA-Z0-9_-])${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zA-Z0-9_-]|$)`).test(pruebas);

  const sinUso = [];
  const noVerificables = [];

  for (const [nombre, archivo] of declaradas) {
    if (diceUso(nombre)) continue;

    if (prefijos.some((p) => nombre.startsWith(p))) {
      noVerificables.push({ nombre, archivo });
      continue;
    }

    sinUso.push({ nombre, archivo, soloEnPruebas: soloEnPruebas(nombre) });
  }

  const cupo = fs.existsSync(CUPO_HUERFANAS)
    ? JSON.parse(fs.readFileSync(CUPO_HUERFANAS, "utf8")).toleradas || []
    : [];
  const toleradas = new Set(cupo.map((t) => t.clase));
  const nuevos = sinUso.filter((h) => !toleradas.has(h.nombre));
  const yaIdas = cupo.map((t) => t.clase).filter((c) => !sinUso.some((h) => h.nombre === c));

  return { total: declaradas.size, sinUso, noVerificables, nuevos, yaIdas, cupo: cupo.length };
}

if (process.argv.includes("--escribir-cupo")) {
  const informe = huerfanas();
  const cuerpo = {
    esquema: 1,
    generado: "node scripts/ci/barrido-utilidades.mjs --huerfanas --escribir-cupo",
    que_es:
      "Lista de clases que el tema escribe a mano y hoy no usa ningun archivo de producto. No es un permiso: es el suelo desde el que hay que bajar. Una clase nueva declarada sin uso hace fallar el barrido, y si una de la lista deja de estar huerfana el cupo hay que recortarlo.",
    como_bajar:
      "Borra la regla del CSS del tema (o conectala con el kit y usala) y vuelve a generar este archivo. El contador solo puede decrecer.",
    toleradas: informe.sinUso.map((h) => ({
      clase: h.nombre,
      declarado_en: h.archivo,
      usada_solo_en_pruebas: h.soloEnPruebas
    }))
  };

  fs.writeFileSync(CUPO_HUERFANAS, JSON.stringify(cuerpo, null, 2) + "\n", "utf8");
  console.log(`Cupo escrito en ${path.relative(RAIZ, CUPO_HUERFANAS)}: ${cuerpo.toleradas.length} clases toleradas, ${informe.noVerificables.length} no verificables.`);
  process.exit(0);
}

if (process.argv.includes("--huerfanas")) {
  const informe = huerfanas();

  console.log("");
  console.log("  HUERFANAS DE ESTILO");
  console.log(`  Clases propias declaradas a mano en el tema: ${informe.total}`);
  console.log(`  Sin uso en ${archivos.length} archivos de producto: ${informe.sinUso.length}`);
  console.log(`  No verificables (el codigo las arma con interpolacion): ${informe.noVerificables.length}`);
  console.log(`  Cupo tolerado: ${informe.cupo}`);
  console.log("");

  const soloPruebas = informe.sinUso.filter((h) => h.soloEnPruebas);

  for (const h of informe.sinUso) {
    console.log(`    ${GRIS}${h.nombre}${FIN}  ${h.archivo}${h.soloEnPruebas ? `${ROJO}  ← la usa solo una prueba${FIN}` : ""}`);
  }

  if (soloPruebas.length) {
    console.log("");
    console.log(`  ${GRIS}${soloPruebas.length} de esas reglas no decoran nada en pantalla pero las consulta un .spec: borrarlas exige borrar también esa aserción.${FIN}`);
  }

  if (informe.noVerificables.length) {
    console.log("");
    console.log(`  ${GRIS}No verificables:${informe.noVerificables.map((h) => h.nombre).join(", ")}${FIN}`);
  }

  if (informe.nuevos.length) {
    console.log("");
    console.log(`  ${ROJO}CRECE EL CUPO${FIN} ${informe.nuevos.length} clase(s) nueva(s) declaradas sin uso: ${informe.nuevos.map((h) => h.nombre).join(", ")}`);
    console.log(`  ${GRIS}O la usas, o borras la regla, o la declaras en el kit y la consumes desde ahi.${FIN}`);
  }

  if (informe.yaIdas.length) {
    console.log("");
    console.log(`  ${ROJO}EL CUPO PUEDE BAJAR${FIN} ${informe.yaIdas.length} clase(s) del cupo ya no estan huerfanas: ${informe.yaIdas.join(", ")}`);
    console.log(`  ${GRIS}Regeneralo: node scripts/ci/barrido-utilidades.mjs --huerfanas --escribir-cupo${FIN}`);
  }

  if (!informe.nuevos.length && !informe.yaIdas.length) {
    console.log(`  ${VERDE}El cupo coincide con lo medido: ninguna regla nueva se suma a las ${informe.cupo} ya contadas.${FIN}`);
  }

  console.log("");
  process.exit(ESTRICTO && (informe.nuevos.length || (informe.yaIdas.length && ESTRICTO)) ? 1 : 0);
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

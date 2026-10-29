/**
 * Si el cambio de un archivo no toca nada que se ejecute.
 *
 * El portón del guardián decide por nombre de archivo, y eso es correcto como
 * primera aproximación pero demasiado grueso: un comentario suelto en
 * `capsule.crypto.js` bloqueaba el merge igual que reescribir el scrypt. Este
 * módulo mira el `patch` que GitHub ya manda en `listFiles` y responde una sola
 * cosa: ¿todas las líneas añadidas y quitadas son comentario o espacio en
 * blanco?
 *
 * El sesgo es deliberado hacia el lado seguro: si falta el parche (archivo
 * binario, demasiado grande, o un cambio futuro de la API), si el lenguaje no
 * se reconoce, o si cualquier línea no es claramente comentario, la respuesta
 * es «no es inofensivo» y el riesgo se queda CRITICAL. Fijar el portón con un
 * parser de comentarios a medias sería peor que el problema que resuelve: se
 * convertiría en una forma de colar código por la puerta del `//`.
 */

/** Lenguajes que se pueden juzgar con reglas de comentario simples. */
const EXTENSIONES_JS = new Set([".js", ".jsx", ".mjs", ".cjs"]);
const EXTENSIONES_LINEA = new Set([".yml", ".yaml", ".sh", ".toml"]);

function extension(ruta) {
  const nombre = String(ruta || "");
  const punto = nombre.lastIndexOf(".");
  return punto === -1 ? "" : nombre.slice(punto).toLowerCase();
}

/**
 * ¿Es `linea` (sin el marcador `+`/`-` del parche) puro comentario o vacío?
 *
 * `dentroDeBloque` llega cuando todavía estamos dentro de un `/* … *\/` que
 * empezó en otra línea del mismo hunk.
 */
function esLineaInofensiva(linea, dentroDeBloque, ext) {
  const texto = linea.trim();

  if (texto === "") return { inofensiva: true, dentroDeBloque };

  if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") {
    if (dentroDeBloque) {
      return { inofensiva: true, dentroDeBloque: !texto.includes("*/") };
    }
    if (texto.startsWith("//")) return { inofensiva: true, dentroDeBloque };
    // Una línea que empieza por `*` solo puede existir dentro de un bloque de
    // comentario: en JavaScript `*` no abre ninguna sentencia. Por eso se acepta
    // aunque el hunk no incluya la línea `/*` que abrió el bloque (un diff de
    // tres líneas de contexto casi nunca la incluye).
    if (texto.startsWith("*")) return { inofensiva: !/\*\/\s*\S/.test(texto), dentroDeBloque };
    if (texto.startsWith("/*")) {
      const cierra = texto.indexOf("*/", 2);
      // Un `/* ... */` abierto y cerrado en la misma línea sigue siendo comentario
      // solo si no hay código detrás de la clausura.
      const resto = cierra === -1 ? "" : texto.slice(cierra + 2).trim();
      return { inofensiva: resto === "", dentroDeBloque: cierra === -1 };
    }
    return { inofensiva: false, dentroDeBloque };
  }

  if (EXTENSIONES_LINEA.has(ext)) {
    return { inofensiva: texto.startsWith("#"), dentroDeBloque };
  }

  // Lenguaje sin reglas conocidas: no se asume nada.
  return { inofensiva: false, dentroDeBloque };
}

/**
 * Devuelve `true` solo si el patch está presente y cada línea añadida o
 * quitada es comentario o blanco. Cualquier duda es `false`.
 */
function esCambioSoloComentarios(ruta, patch) {
  const texto = typeof patch === "string" ? patch : "";
  if (!texto.trim()) return false;

  const ext = extension(ruta);
  if (!EXTENSIONES_JS.has(ext) && !EXTENSIONES_LINEA.has(ext)) return false;

  let dentroDeBloque = false;
  let lineasJuzgadas = 0;

  for (const cruda of texto.split("\n")) {
    // Las cabeceras del diff (`+++`, `---`, `@@`) no son cambios de contenido.
    if (cruda.startsWith("+++") || cruda.startsWith("---") || cruda.startsWith("@@")) continue;

    const marcador = cruda.slice(0, 1);
    if (marcador !== "+" && marcador !== "-") continue;

    const veredicto = esLineaInofensiva(cruda.slice(1), dentroDeBloque, ext);
    dentroDeBloque = veredicto.dentroDeBloque;

    if (!veredicto.inofensiva) return false;
    lineasJuzgadas += 1;
  }

  // Un parche sin ninguna línea +/- (o un hunk de contexto puro) no demuestra
  // nada: mejor no bajar el riesgo por él.
  return lineasJuzgadas > 0 && !dentroDeBloque;
}

module.exports = {
  esCambioSoloComentarios,
  esLineaInofensiva
};

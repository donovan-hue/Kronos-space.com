const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * El grafo de `require` del servidor no puede tener ciclos.
 *
 * El origen es un hallazgo concreto de la revisión: `server.js` llegaba a
 * importarse a sí mismo por el camino largo (el temporizador de cápsulas
 * declarado en el ámbito del módulo, que referenciaba un `io` todavía no
 * creado). Funcionaba porque el intervalo tarda 60 s en disparar —no por
 * ninguna garantía— y cualquier `require("./server")` de los ~90 archivos de
 * prueba arrancaba ese temporizador.
 *
 * Un ciclo de importación en CommonJS no siempre rompe: a veces deja un
 * `module.exports` a medias y la propiedad que falta se lee como `undefined`
 * en tiempo de ejecución. Eso es exactamente la clase de defecto que este
 * repositorio ya pagó con el `require` a una carpeta inexistente ocultado por
 * un `catch {}`. La prueba es barata y estructural: recorre el grafo, no
 * ejecuta nada.
 *
 * Límite honesto: solo ve `require("./ruta-literal")`. Un `require(variable)`
 * dinámico se escapa —no los hay hoy en `src`—, y por eso el barrido se apoya
 * en que los módulos del servidor se importan por ruta relativa literal.
 */

const SRC = path.join(__dirname, "..", "src");

function archivosJs(directorio, salida = []) {
  for (const entrada of fs.readdirSync(directorio, { withFileTypes: true })) {
    const ruta = path.join(directorio, entrada.name);

    if (entrada.isDirectory()) archivosJs(ruta, salida);
    else if (/\.js$/.test(entrada.name)) salida.push(ruta);
  }

  return salida;
}

function quitarComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function resolver(desde, especificador) {
  if (!especificador.startsWith(".")) return null;

  const base = path.resolve(path.dirname(desde), especificador);

  for (const candidato of [`${base}.js`, path.join(base, "index.js"), base]) {
    if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) return candidato;
  }

  return null;
}

function grafoDeImportaciones() {
  const grafo = new Map();

  for (const archivo of archivosJs(SRC)) {
    const texto = quitarComentarios(fs.readFileSync(archivo, "utf8"));
    const aristas = new Set();

    for (const m of texto.matchAll(/require\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
      const destino = resolver(archivo, m[1]);

      if (destino && destino !== archivo) aristas.add(destino);
    }

    grafo.set(archivo, [...aristas]);
  }

  return grafo;
}

function ciclosDelGrafo(grafo) {
  const color = new Map();
  const hallados = [];

  const visitar = (nodo, pila) => {
    color.set(nodo, "gris");
    pila.push(nodo);

    for (const destino of grafo.get(nodo) || []) {
      const estado = color.get(destino) || "blanco";

      if (estado === "gris") {
        const inicio = pila.indexOf(destino);

        if (inicio >= 0) hallados.push(pila.slice(inicio).concat(destino));
      } else if (estado === "blanco") {
        visitar(destino, pila);
      }
    }

    pila.pop();
    color.set(nodo, "negro");
  };

  for (const nodo of grafo.keys()) {
    if ((color.get(nodo) || "blanco") === "blanco") visitar(nodo, []);
  }

  return hallados;
}

const relativo = (ruta) => path.relative(path.join(__dirname, "..", ".."), ruta).replace(/\\/g, "/");

test("el grafo de requires de server/src no tiene ciclos", () => {
  const grafo = grafoDeImportaciones();

  assert.ok(grafo.size > 100, `el barrido encontró solo ${grafo.size} archivos: el recorrido está roto`);

  const ciclos = ciclosDelGrafo(grafo).map((ciclo) => ciclo.map(relativo));

  assert.deepEqual(
    ciclos,
    [],
    `ciclos de importación (un module.exports a medias se lee como undefined en producción):\n${ciclos.map((c) => `  ${c.join(" → ")}`).join("\n")}`
  );
});

test("server.js no puede volver a importarse a sí misma, ni por el camino largo", () => {
  const grafo = grafoDeImportaciones();
  const servidor = path.join(SRC, "server.js");

  assert.ok(grafo.has(servidor), "el barrido debe ver src/server.js");

  const visitados = new Set();
  const pila = [servidor];

  while (pila.length) {
    const actual = pila.pop();

    if (visitados.has(actual)) continue;
    visitados.add(actual);

    for (const destino of grafo.get(actual) || []) {
      if (destino === servidor) {
        assert.fail(
          `${relativo(actual)} importa src/server.js: cualquier prueba que requiera ese módulo arranca el servidor y sus temporizadores. ` +
            "El manejador que necesites va en su propio módulo y `server.js` lo monta."
        );
      }

      pila.push(destino);
    }
  }
});

/*
 * Capas: deuda contada, no deuda negada.
 *
 * `config/mediaLifecycle.js` importa cinco modelos de dominio (`Post`, `Story`,
 * `Message`, `Draft`, `ImageGeneration`) para
 * saber qué documentos referencian un archivo antes de borrarlo. Eso es lógica
 * de dominio viviendo debajo de la configuración, y el coste es concreto: el
 * módulo deja de poder leerse ni probarse solo, y cualquier prueba que lo
 * requiera arrastra mongoose. La forma de que no empeore sin decidir hoy el
 * refactor es esta: la lista de aristas toleradas solo puede ponerse más corta.
 * Mover `mediaLifecycle.js` junto a `modules/media/` (o inyectarle los modelos)
 * y borrar la línea correspondiente es el arreglo real.
 */
const ARISTAS_TOLERADAS = new Set([
  "server/src/config/mediaLifecycle.js → server/src/modules/posts/Post.js",
  "server/src/config/mediaLifecycle.js → server/src/modules/stories/Story.js",
  "server/src/config/mediaLifecycle.js → server/src/modules/messages/Message.js",
  "server/src/config/mediaLifecycle.js → server/src/modules/drafts/Draft.js",
  "server/src/config/mediaLifecycle.js → server/src/modules/image-ai/ImageGeneration.js"
]);

test("config/ no depende de modules/: la deuda de capas no crece", () => {
  const grafo = grafoDeImportaciones();
  const inversiones = [];

  for (const [archivo, aristas] of grafo) {
    if (!archivo.includes(`${path.sep}config${path.sep}`)) continue;

    for (const destino of aristas) {
      if (!destino.includes(`${path.sep}modules${path.sep}`)) continue;

      const arista = `${relativo(archivo)} → ${relativo(destino)}`;

      if (!ARISTAS_TOLERADAS.has(arista)) inversiones.push(arista);
    }
  }

  assert.deepEqual(
    inversiones,
    [],
    `una arista nueva config → modules ${ARISTAS_TOLERADAS.size ? `(además de las ${ARISTAS_TOLERADAS.size} contadas)` : ""}: la configuración que importa dominio deja de poder leerse ni probarse sola`
  );

  // Y el cupo se aprieta solo: si alguien mueve el módulo y elimina la deuda,
  // la lista vieja tiene que actualizarse hacia abajo.
  const grafoArchivos = new Map([...grafo].map(([clave, valor]) => [relativo(clave), valor.map(relativo)]));
  const siguenVivas = [...ARISTAS_TOLERADAS].filter((arista) => {
    const [desde, destino] = arista.split(" → ");

    return (grafoArchivos.get(desde) || []).includes(destino);
  });

  assert.equal(
    siguenVivas.length,
    ARISTAS_TOLERADAS.size,
    `${ARISTAS_TOLERADAS.size - siguenVivas.length} arista(s) toleradas ya no existen: quítalas de ARISTAS_TOLERADAS, que el cupo solo puede bajar`
  );
});

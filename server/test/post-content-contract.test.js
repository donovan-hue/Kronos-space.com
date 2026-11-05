const test = require("node:test");
const assert = require("node:assert/strict");

const normalizePost = require("../src/modules/posts/normalizePost");

/**
 * Regresión (Atlas, run 37854304169 intento 2): `/api/pulse` devolvía publicaciones
 * sin el campo `content` cuando el documento era legado (lean() no aplica el
 * default del esquema). El test del Pulso hacía `content.includes(...)` y lanzaba
 * TypeError. El contrato es: `content` siempre es texto.
 *
 * Sin base de datos: normalizePost es una función pura.
 */

const BASE = {
  _id: "65f000000000000000000001",
  author: { _id: "65f000000000000000000002", username: "autora", displayName: "Autora" },
  audience: { type: "public" },
  createdAt: new Date("2026-10-08T00:00:00Z")
};

test("normalizePost: un documento legado sin content devuelve cadena vacía, no undefined", () => {
  const legacy = { ...BASE };
  delete legacy.content;

  const normalized = normalizePost(legacy, "65f000000000000000000003");

  assert.equal(typeof normalized.content, "string");
  assert.equal(normalized.content, "");
});

test("normalizePost: content null o no textual también se normaliza a cadena", () => {
  for (const value of [null, undefined, 42, { texto: "x" }]) {
    const normalized = normalizePost({ ...BASE, content: value }, "65f000000000000000000003");
    assert.equal(typeof normalized.content, "string", `valor ${String(value)}`);
  }
});

test("normalizePost: un contenido textual válido se conserva sin cambios", () => {
  const normalized = normalizePost({ ...BASE, content: "Obra nueva #arte" }, "65f000000000000000000003");

  assert.equal(normalized.content, "Obra nueva #arte");
});

/* ============================================================
   1.2 — la receta de video llega al feed y el feed la obedece
   ============================================================ */

test("la receta de edición del video viaja con el medio", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.join(__dirname, "..", "..");

  const normalizador = fs.readFileSync(path.join(raiz, "server/src/modules/posts/normalizePost.js"), "utf8");
  assert.match(normalizador, /music: post\.media\.music/);
  assert.match(normalizador, /edit: post\.media\.edit\?\.filtro/);
  assert.match(normalizador, /trim: post\.media\.trim/);

  // El feed tiene que aplicar el recorte: antes la receta viajaba y el
  // reproductor la ignoraba, así que el ajuste se perdía al recargar.
  const reproductor = fs.readFileSync(path.join(raiz, "client/src/features/social/components/PostMedia.jsx"), "utf8");
  assert.match(reproductor, /import VideoTrim from/);
  assert.match(reproductor, /<VideoTrim media=\{activeItem\} \/>/);

  const libreria = fs.readFileSync(path.join(raiz, "client/src/lib/videoTrim.js"), "utf8");
  // Las dos formas de receta: la nueva del estudio y el legado.
  assert.match(libreria, /corte\.inicio \?\? corte\.start/);
  assert.match(libreria, /corte\.fin \?\? corte\.end/);
  // `fin: 0` es «hasta el final», no un corte en el segundo cero.
  assert.match(libreria, /if \(fin <= 0\) return null;/);
  assert.match(libreria, /if \(fin <= inicio\) return null;/);
});

/**
 * Subtítulos desde texto (bloque 1.2).
 *
 * La ruta `PATCH /posts/:postId/subtitles` existía y no tenía ni productor ni
 * consumidor: el compositor mandaba `subtitles: []`. Ahora el autor escribe
 * líneas y el servidor las convierte en WebVTT real.
 */
test("subtítulos: texto del autor a WebVTT válido", () => {
  const { vttDesdeTexto } = require("../src/modules/posts/posts.routes");

  const vtt = vttDesdeTexto("Hola\nNos vemos <b>", 20);
  assert.ok(vtt.startsWith("WEBVTT\n\n"), "falta la cabecera que exige el formato");
  assert.match(vtt, /00:00:00\.000 --> /);
  assert.match(vtt, /--> 00:00:20\.000/, "la última pista debe cerrar en la duración");
  assert.ok(vtt.includes("Nos vemos &lt;b&gt;"), "las etiquetas se escapan");

  // Una duración de 0 no debe producir una pista sin fin.
  const sinDuracion = vttDesdeTexto("Una línea", 0);
  assert.match(sinDuracion, /--> 00:00:03\.000/);

  assert.equal(vttDesdeTexto("   "), "");
});

test("subtítulos: el compositor ya no manda una lista vacía", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.resolve(__dirname, "../..");

  const detalle = fs.readFileSync(path.join(raiz, "client/src/features/social/PostDetail.jsx"), "utf8");
  assert.match(detalle, /updateVideoSubtitles/);
  assert.match(detalle, /onSaveSubtitles=/);

  const editor = fs.readFileSync(path.join(raiz, "client/src/components/media/VideoTrimEditor.jsx"), "utf8");
  assert.match(editor, /lineasDeSubtitulo/);
  assert.match(editor, /Guardar subtítulos/);

  const servicio = fs.readFileSync(path.join(raiz, "client/src/services/postsService.js"), "utf8");
  assert.match(servicio, /PATCH|api\.patch\(`\/posts\/\$\{postId\}\/subtitles`/);
});

/**
 * Comentarios con me gusta, edición y audiencia editable (bloque 1.2).
 *
 * Antes: no había `POST /comments/:id/like` ni `PATCH /comments/:id`, y el
 * PATCH de la publicación aceptaba `audience` sin que la pantalla lo mandara.
 */
test("comentarios: modelo, rutas y normalización", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.resolve(__dirname, "../..");

  const modelo = fs.readFileSync(path.join(raiz, "server/src/modules/posts/Post.js"), "utf8");
  assert.match(modelo, /likes: \{\s*type: \[\{ type: mongoose\.Schema\.Types\.ObjectId/, "falta la lista de me gusta");
  assert.match(modelo, /editedAt:/);

  const rutas = fs.readFileSync(path.join(raiz, "server/src/modules/posts/posts.routes.js"), "utf8");
  assert.match(rutas, /router\.post\("\/:postId\/comments\/:commentId\/like"/);
  assert.match(rutas, /router\.patch\("\/:postId\/comments\/:commentId"/);
  // El me gusta alterna: sin el `$pull` no se puede quitar.
  assert.match(rutas, /\$pull: \{ "comments\.\$\.likes"/);
  assert.match(rutas, /NOT_COMMENT_AUTHOR/);

  const normalizador = fs.readFileSync(path.join(raiz, "server/src/modules/posts/normalizePost.js"), "utf8");
  // La lista de quién votó no debe salir al cliente, solo la cifra y mi voto.
  assert.match(normalizador, /likesCount: votos\.length/);
  assert.match(normalizador, /liked: votos\.some/);

  const ui = fs.readFileSync(path.join(raiz, "client/src/features/social/Comments.jsx"), "utf8");
  assert.match(ui, /likeComment/);
  assert.match(ui, /updateComment/);
  assert.match(ui, /editado/);
});

test("publicaciones: la audiencia se puede cambiar desde la pantalla", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.resolve(__dirname, "../..");

  const servicio = fs.readFileSync(path.join(raiz, "client/src/services/postsService.js"), "utf8");
  assert.match(servicio, /payload\.audience = normalizeAudiencePayload\(audience\)/);

  const detalle = fs.readFileSync(path.join(raiz, "client/src/features/social/PostDetail.jsx"), "utf8");
  assert.match(detalle, /editAudience/);
  assert.match(detalle, /Audiencia de la publicación/);
});

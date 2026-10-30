const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const music = require("../src/modules/music/music.routes");
const audio = require("../src/modules/music/audio.routes");
const upload = require("../src/middleware/upload");
const posts = require("../src/modules/posts/posts.routes");
const Post = require("../src/modules/posts/Post");
const normalizePost = require("../src/modules/posts/normalizePost");

/* ============================================================
   MÚSICA DEL ESTUDIO — contrato

   Lo que estas pruebas cuidan es que la música deje de perderse:
   - el audio se acepta por su firma real, no por su nombre;
   - el catálogo existe y solo enseña pistas publicadas;
   - la música y la receta del estudio sobreviven al guardado.
   ============================================================ */

function rutas(router) {
  return (router.stack || [])
    .filter((capa) => capa.route)
    .map((capa) => ({
      ruta: capa.route.path,
      metodos: Object.keys(capa.route.methods),
      nombres: capa.route.stack.map((paso) => paso.name)
    }));
}

const buffer = (bytes, mimetype) => ({ buffer: Buffer.from(bytes), mimetype });

test("el catálogo es una lectura privada y la publicación exige administración", () => {
  const lista = rutas(music);

  const catalogo = lista.find((r) => r.ruta === "/" && r.metodos.includes("get"));
  assert.ok(catalogo, "falta GET /api/music");
  assert.ok(catalogo.nombres.includes("auth"), "el catálogo exige sesión");
  assert.ok(catalogo.nombres.includes("requireUser"), "el catálogo exige usuario");

  const publicar = lista.find((r) => r.ruta === "/" && r.metodos.includes("post"));
  assert.ok(publicar, "falta POST /api/music");
  assert.ok(publicar.nombres.includes("auth"));
  assert.ok(publicar.nombres.includes("requireAdmin"), "publicar al catálogo es solo de administración");

  const subida = rutas(audio).find((r) => r.ruta === "/audio");
  assert.ok(subida, "falta POST /api/uploads/audio");
  assert.deepEqual(subida.metodos, ["post"]);
  assert.ok(subida.nombres.includes("requireUser"));
});

test("los límites del catálogo están declarados", () => {
  assert.equal(music.LIMITE_POR_DEFECTO, 60);
  assert.equal(music.LIMITE_MAXIMO, 100);
  assert.ok(music.LIMITE_MAXIMO >= music.LIMITE_POR_DEFECTO);
});

test("las etiquetas se limpian: minúsculas, sin repetir y con tope", () => {
  assert.deepEqual(music.limpiarEtiquetas("Chill, chill , CORRIDO"), ["chill", "corrido"]);
  assert.deepEqual(music.limpiarEtiquetas(["uno", "dos", "tres", "cuatro", "cinco", "seis", "siete"]).length, 6);
  assert.deepEqual(music.limpiarEtiquetas(undefined), []);
});

test("solo se aceptan archivos de música del propio sitio", () => {
  assert.equal(music.esUrlLocalDeMusica("/uploads/music/pista.mp3"), true);
  assert.equal(music.esUrlLocalDeMusica("https://otro-sitio.com/pista.mp3"), false);
  assert.equal(music.esUrlLocalDeMusica("/uploads/media/video.mp4"), false);
  assert.equal(music.esUrlLocalDeMusica(""), false);
});

test("la pista que sale al cliente trae lo que el estudio necesita", () => {
  const pista = music.comoPista({
    _id: "65f000000000000000000000",
    titulo: "Pista de prueba",
    autor: "Autor",
    duracion: 95,
    etiquetas: ["chill"],
    licencia: "Propia",
    url: "/uploads/music/pista.mp3",
    mimeType: "audio/mpeg",
    publicada: true,
    createdAt: new Date("2026-10-13T00:00:00.000Z")
  });
  assert.equal(pista._id, "65f000000000000000000000");
  assert.equal(pista.titulo, "Pista de prueba");
  assert.equal(pista.duracion, 95);
  assert.deepEqual(pista.etiquetas, ["chill"]);
  assert.equal(pista.url, "/uploads/music/pista.mp3");
});

test("el audio se acepta por su firma real, no por su nombre", () => {
  const casos = [
    ["audio/mpeg", [...Buffer.from("ID3"), 3, 0, 0, 0, 0, 0], true],
    ["audio/mpeg", [0xff, 0xfb, 0x90, 0x00], true],
    ["audio/mpeg", [...Buffer.from("no es audio")], false],
    ["audio/mp4", [...Buffer.from("0000ftypM4A ")], true],
    ["audio/x-m4a", [...Buffer.from("0000ftypM4A ")], true],
    ["audio/mp4", [...Buffer.from("0000nopeM4A ")], false],
    ["audio/aac", [0xff, 0xf1, 0x50, 0x80], true],
    ["audio/aac", [0xff, 0xf2, 0x50, 0x80], false],
    ["audio/wav", [...Buffer.from("RIFF0000WAVEfmt ")], true],
    ["audio/wav", [...Buffer.from("RIFF0000AVI fmt ")], false],
    ["audio/ogg", [...Buffer.from("OggS0000")], true],
    ["audio/opus", [...Buffer.from("OggS0000")], true],
    ["audio/webm", [0x1a, 0x45, 0xdf, 0xa3, 0x01], true],
    ["audio/webm", [0x00, 0x01, 0x02, 0x03], false]
  ];

  for (const [mimetype, bytes, esperado] of casos) {
    assert.equal(
      upload.hasValidAudioSignature(buffer(bytes, mimetype)),
      esperado,
      `${mimetype} con ${bytes.length} bytes`
    );
  }
});

test("un tipo no declarado no pasa aunque el contenido sea válido", () => {
  // Un MP3 con cabecera de video: la lista de tipos manda.
  assert.equal(upload.hasValidAudioSignature(buffer([0xff, 0xfb, 0x90, 0x00], "video/mp4")), false);
  // Y una imagen no se cuela por la puerta del audio.
  assert.equal(
    upload.hasValidAudioSignature(buffer([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png")),
    false
  );
});

test("el tope del audio es 15 MB y su formato está en la lista", () => {
  assert.equal(upload.MAX_AUDIO_SIZE, 15 * 1024 * 1024);
  for (const formato of ["audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/ogg", "audio/webm"]) {
    assert.ok(upload.audioMimeTypes.has(formato), `falta ${formato}`);
  }
  // La imagen y el video conservan sus propios manejadores.
  assert.ok(upload.imageMimeTypes.has("image/jpeg"));
  assert.ok(upload.videoMimeTypes.has("video/mp4"));
  assert.equal(typeof upload.handleAudioUpload("audio"), "function");
});

test("el esquema del post guarda la música y la receta con sus topes", () => {
  const media = Post.schema.path("media").schema;
  const rutasMusica = Object.keys(media.paths).filter((r) => r.startsWith("music."));
  const rutasEdit = Object.keys(media.paths).filter((r) => r.startsWith("edit."));

  assert.ok(rutasMusica.length >= 9, "el medio debe declarar los campos de música");
  assert.ok(rutasEdit.length >= 15, "el medio debe declarar la receta de edición");

  assert.equal(media.path("music.volumen").options.default, 0.8);
  assert.equal(media.path("music.volumen").options.max, 1);
  assert.deepEqual(media.path("edit.medida").enumValues, ["original", "1:1", "4:5", "9:16", "16:9", "3:1", ""]);
  assert.equal(media.path("edit.ajustes.brillo").options.min, 0.5);
  assert.equal(media.path("edit.ajustes.brillo").options.max, 1.5);
  assert.equal(media.path("edit.ajustes.desenfoque").options.max, 4);
  assert.equal(media.path("edit.texto.contenido").options.maxlength, 140);
});

test("la música válida se guarda y la de terceros se rechaza", () => {
  const valida = posts.parseMusic({
    trackId: "65f000000000000000000000",
    titulo: "Pista",
    autor: "Autor",
    url: "/uploads/music/pista.mp3",
    tipo: "propia",
    inicio: 3,
    fin: 30,
    volumen: 0.5,
    fundidoEntrada: 9,
    fundidoSalida: 2
  });
  assert.ok(valida.music, "debe aceptar la música del propio sitio");
  assert.equal(valida.music.volumen, 0.5);
  assert.equal(valida.music.tipo, "propia");
  // Corte de 27 s: la mitad son 13.5 s, así que 9 s de fundido pasan.
  assert.equal(valida.music.fundidoEntrada, 9);

  const externa = posts.parseMusic({ trackId: "x", url: "https://otro-sitio.com/pista.mp3" });
  assert.ok(externa.error, "no se acepta música de terceros");

  const larga = posts.parseMusic({
    trackId: "x",
    url: "/uploads/music/pista.mp3",
    inicio: 0,
    fin: 4,
    fundidoEntrada: 10
  });
  assert.equal(larga.music.fundidoEntrada, 2, "el fundido no puede rebasar la mitad del corte");

  assert.equal(posts.parseMusic(null).music, null);
  assert.equal(posts.parseMusic({}).music, null, "sin pista ni archivo no hay música");
  assert.ok(posts.parseMusic("mp3").error);
});

test("la receta se valida con los mismos topes que el estudio", () => {
  const receta = posts.parseEdit({
    version: 1,
    medida: "9:16",
    corte: { inicio: 1, fin: 12, silenciar: true },
    filtro: { id: "vivo", intensidad: 0.4, css: "saturate(1.35)" },
    ajustes: { brillo: 9, contraste: 0.1, saturacion: 1.2, calidez: 0.9, vineta: 0.5 },
    texto: { contenido: "Sube el volumen", posicion: "arriba", color: "#ff0000", tamano: 3 }
  });

  assert.ok(receta.edit);
  assert.equal(receta.edit.medida, "9:16");
  assert.equal(receta.edit.corte.silenciar, true);
  // Los ajustes se recortan al rango del motor, no se rechazan.
  assert.equal(receta.edit.ajustes.brillo, 1.5);
  assert.equal(receta.edit.ajustes.contraste, 0.5);
  assert.equal(receta.edit.ajustes.calidez, 0.3);
  assert.equal(receta.edit.texto.tamano, 2);
  assert.equal(receta.edit.texto.color, "#ff0000");
  // El CSS combinado se acepta del estudio, pero acotado.
  assert.equal(receta.edit.filtro.css, "saturate(1.35)");
});

test("una medida desconocida cae a original y un corte invertido se rechaza", () => {
  assert.equal(posts.parseEdit({ medida: "21:9" }).edit.medida, "original");
  assert.ok(posts.parseEdit({ corte: { inicio: 10, fin: 4 } }).error);
  // El color que no es un hex válido vuelve al blanco.
  assert.equal(posts.parseEdit({ texto: { contenido: "x", color: "rojo" } }).edit.texto.color, "#ffffff");
  // Sin posición declarada, el texto se ancla abajo; sin texto, no hay posición.
  assert.equal(posts.parseEdit({ texto: { contenido: "x" } }).edit.texto.posicion, "abajo");
  assert.equal(posts.parseEdit({ texto: { contenido: "" } }).edit.texto.posicion, "");
  assert.equal(posts.parseEdit(null).edit, null);
});

test("el medio principal conserva música y receta; el carrusel no las acepta", () => {
  const principal = posts.parseMedia({
    url: "/uploads/media/video.mp4",
    type: "video",
    mimeType: "video/mp4",
    music: { trackId: "t1", url: "/uploads/music/a.mp3" },
    edit: { medida: "9:16", filtro: { id: "vivo" } }
  });
  assert.ok(principal.media.music, "el video principal lleva su música");
  assert.equal(principal.media.edit.medida, "9:16");

  const carrusel = posts.parseMediaItems([
    { url: "/uploads/media/foto.jpg", type: "image", music: { trackId: "t1", url: "/uploads/music/a.mp3" } }
  ]);
  // El carrusel devuelve el campo declarado y vacío: ni música ni receta.
  assert.equal(carrusel.mediaItems[0].music, null, "una foto del carrusel no lleva música");
  assert.equal(carrusel.mediaItems[0].edit, null, "una foto del carrusel no lleva receta");
});

test("la receta vuelve al cliente al leer la publicación", () => {
  const publicacion = {
    _id: "65f000000000000000000001",
    author: "65f000000000000000000002",
    media: {
      url: "/uploads/media/video.mp4",
      type: "video",
      music: { trackId: "t1", url: "/uploads/music/a.mp3", volumen: 0.6 },
      edit: { medida: "9:16", filtro: { id: "vivo" } }
    },
    likes: [],
    reactions: [],
    comments: []
  };
  const normalizada = normalizePost(publicacion);
  assert.ok(normalizada.media.music, "la música sale al leer");
  assert.equal(normalizada.media.music.volumen, 0.6);
  assert.equal(normalizada.media.edit.filtro.id, "vivo");

  // Un medio sin música ni receta se devuelve como nulo, no como objeto vacío.
  const sencilla = normalizePost({ ...publicacion, media: { url: "/uploads/media/foto.jpg", type: "image" } });
  assert.equal(sencilla.media.music, null);
  assert.equal(sencilla.media.edit, null);
});

test("el servidor monta las dos rutas nuevas", () => {
  const fuente = fs.readFileSync(path.join(process.cwd(), "src/http/registerRoutes.js"), "utf-8");
  assert.ok(fuente.includes('app.use("/api/music", musicRoutes)'), "falta montar /api/music");
  assert.ok(fuente.includes('app.use("/api/uploads", abuseLimiter, audioUploadRoutes)'), "falta montar /api/uploads");
});

test("el almacén guarda la música aparte y con su extensión real", () => {
  // Se comprueba la tabla, no el texto de un archivo: el formato del nombre y
  // las carpetas viven en `config/uploadNaming.js` y `storage.js` las usa, así
  // que afirmar sobre el código escrito a mano solo sirvió para que añadir un
  // formato exigiera editar dos sitios y la copia durable se enterara tarde.
  const path = require("node:path");
  const { SUBDIRS, extFromMime } = require("../src/config/storage");
  const { CARPETAS, EXTENSION_POR_MIME } = require("../src/config/uploadNaming");

  assert.ok(CARPETAS.includes("music"), "la música sigue siendo una carpeta declarada");
  assert.equal(path.basename(SUBDIRS.music), "music", "la música tiene su carpeta");
  assert.match(SUBDIRS.music, /uploads\/music$/, "y cuelga de server/uploads, no de otra parte");

  // Cada formato declara su extensión real, y el mapa es el único que existe.
  const ESPERADO = {
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/webm": "weba"
  };

  for (const [mime, ext] of Object.entries(ESPERADO)) {
    assert.equal(extFromMime(mime), ext, `falta la extensión ${ext} para ${mime}`);
    assert.equal(EXTENSION_POR_MIME[mime], ext, `${mime} no está en la tabla compartida`);
  }
});

/* ============================================================
   LÍNEA DE TIEMPO — varios clips en una pieza

   Una pieza armada con tomas en orden tiene que sobrevivir al
   guardado con sus tramos, y el servidor no puede aceptar una
   línea imposible: ni sin dirección, ni con el fin antes del
   inicio, ni más larga de lo permitido.
   ============================================================ */

const CLIPS_VALIDOS = [
  { url: "/uploads/media/toma-uno.mp4", tipo: "video", duracion: 5, inicio: 0, fin: 5 },
  { url: "/uploads/media/foto-dos.jpg", tipo: "image", duracion: 2.5, inicio: 0, fin: 2.5 },
  { url: "/uploads/media/toma-tres.mp4", tipo: "video", duracion: 8, inicio: 1, fin: 8 }
];

test("la línea de tiempo suma el video y el tiempo elegido de las imágenes", () => {
  const resultado = posts.parseEdit({ clips: CLIPS_VALIDOS });
  assert.equal(resultado.error, undefined, resultado.error || "");
  assert.equal(resultado.edit.clips.length, 3);
  assert.equal(resultado.edit.clips[1].tipo, "image");
  assert.equal(resultado.edit.duracionTotal, 14.5, "5 segundos de video, 2.5 de imagen y 7 de video");
});

test("una sola toma no arma línea de tiempo", () => {
  const resultado = posts.parseEdit({ clips: [CLIPS_VALIDOS[0]] });
  assert.equal(resultado.error, undefined, resultado.error || "");
  assert.equal(resultado.edit.clips, undefined, "con una sola toma la pieza no declara línea");
  assert.equal(resultado.edit.duracionTotal, undefined);
});

test("la línea de tiempo rechaza lo que no se puede reproducir", () => {
  const sinUrl = posts.parseEdit({ clips: [{ tipo: "video", duracion: 5 }, CLIPS_VALIDOS[0]] });
  assert.match(sinUrl.error, /necesita su archivo/, "un clip sin dirección no entra");

  const invertido = posts.parseEdit({
    clips: [CLIPS_VALIDOS[0], { url: "/uploads/media/toma.mp4", tipo: "video", duracion: 8, inicio: 5, fin: 2 }]
  });
  assert.match(invertido.error, /termina antes de empezar/);

  const pasado = posts.parseEdit({
    clips: [CLIPS_VALIDOS[0], { url: "/uploads/media/toma.mp4", tipo: "video", duracion: 10, inicio: 0, fin: 11 }]
  });
  assert.equal(pasado.error, undefined, "un fin pasado de largo se acota a la duración");
  assert.equal(pasado.edit.clips[1].fin, 10);

  const larga = posts.parseEdit({
    clips: Array.from({ length: posts.LIMITE_CLIPS + 1 }, () => CLIPS_VALIDOS[0])
  });
  assert.match(larga.error, new RegExp(String(posts.LIMITE_CLIPS)), "la línea tiene tope");
});

test("la velocidad y las transiciones entran acotadas", () => {
  const resultado = posts.parseEdit({
    clips: [
      { url: "/uploads/media/toma-uno.mp4", tipo: "video", duracion: 10, inicio: 0, fin: 10, velocidad: 0.5 },
      { url: "/uploads/media/toma-dos.mp4", tipo: "video", duracion: 8, inicio: 0, fin: 8, velocidad: 2, transicion: { tipo: "fundido", duracion: 9 } }
    ]
  });
  assert.equal(resultado.error, undefined, resultado.error || "");
  assert.equal(resultado.edit.clips[0].velocidad, 0.5);
  assert.equal(resultado.edit.clips[1].velocidad, 2);
  // 10 segundos a la mitad de velocidad son 20; 8 al doble son 4.
  assert.equal(resultado.edit.duracionTotal, 24);
  // La transición se acota a la mitad de la toma más corta ya montada.
  assert.equal(resultado.edit.clips[1].transicion.tipo, "fundido");
  assert.equal(resultado.edit.clips[1].transicion.duracion, 2);

  const fueraDeRango = posts.parseEdit({
    clips: [
      CLIPS_VALIDOS[0],
      { url: "/uploads/media/toma-dos.mp4", tipo: "video", duracion: 8, inicio: 0, fin: 8, velocidad: 40, transicion: { tipo: "giro", duracion: 1 } }
    ]
  });
  assert.equal(fueraDeRango.edit.clips[1].velocidad, posts.VELOCIDAD_MAXIMA, "la velocidad se acota al tope");
  assert.equal(fueraDeRango.edit.clips[1].transicion.tipo, "corte", "una transición inventada se queda en corte seco");
  assert.ok(posts.TRANSICIONES_CLIP.includes("acercar"), "la lista de transiciones viaja con las constantes");
});

test("el esquema declara velocidad y transición por toma", () => {
  const clips = Post.schema.path("media").schema.path("edit.clips");
  assert.equal(clips.schema.path("velocidad").options.min, 0.25);
  assert.equal(clips.schema.path("velocidad").options.max, 4);
  // La transición es un objeto anidado: sus campos viven con punto.
  assert.deepEqual(clips.schema.path("transicion.tipo").options.enum, posts.TRANSICIONES_CLIP);
  assert.equal(clips.schema.path("transicion.duracion").options.max, 2);
  assert.equal(clips.schema.path("transicion.tipo").options.default, "corte");
});

test("la línea de tiempo sobrevive al guardado y a la lectura", () => {
  const media = Post.schema.path("media");
  assert.ok(media.schema.path("edit.clips"), "el esquema del post guarda los clips");
  assert.ok(media.schema.path("edit.duracionTotal"), "el esquema guarda la duración total");
  assert.equal(media.schema.path("edit.clips").schema.path("url").options.type, String);
  assert.equal(media.schema.path("edit.duracionTotal").options.min, 0);

  const publicacion = {
    media: {
      url: "/uploads/media/toma-uno.mp4",
      type: "video",
      edit: { version: 1, medida: "9:16", clips: CLIPS_VALIDOS, duracionTotal: 14.5 }
    },
    likes: [],
    reactions: [],
    comments: []
  };
  const normalizada = normalizePost(publicacion);
  assert.equal(normalizada.media.edit.clips.length, 3);
  assert.equal(normalizada.media.edit.duracionTotal, 14.5);
});

test("la lectura por id exige sesión y no expone pistas sin publicar", async (t) => {
  const MusicTrack = require("../src/modules/music/MusicTrack");
  const route = music.stack.find(layer => layer.route?.path === "/:trackId" && layer.route.methods.get).route;
  assert.ok(route.stack.some(layer => layer.name === "auth"));
  assert.ok(route.stack.some(layer => layer.name === "requireUser"));
  const handler = route.stack.at(-1).handle;
  const id = "507f1f77bcf86cd799439011";
  let query;
  t.mock.method(MusicTrack, "findOne", async filter => { query = filter; return null; });
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const missing = response();
  await handler({ params: { trackId: id } }, missing);
  assert.deepEqual(query, { _id: id, publicada: true });
  assert.equal(missing.code, 404);
  const invalid = response();
  await handler({ params: { trackId: "invalid" } }, invalid);
  assert.equal(invalid.code, 400);
  const track = { _id: id, titulo: "Pista publicada", url: "/uploads/music/pista.mp3", publicada: true };
  MusicTrack.findOne.mock.mockImplementation(async () => track);
  const found = response();
  await handler({ params: { trackId: id } }, found);
  assert.equal(found.code, 200);
  assert.equal(found.body.pista.url, track.url);
});


test("la imagen necesita duración explícita y no se acelera como el video", () => {
  for (const duracion of [0, 0.001, -1, Infinity]) {
    const resultado = posts.parseEdit({ clips: [CLIPS_VALIDOS[0], { ...CLIPS_VALIDOS[1], duracion }] });
    assert.match(resultado.error, /duración positiva/);
  }
  const resultado = posts.parseEdit({ clips: [CLIPS_VALIDOS[0], { ...CLIPS_VALIDOS[1], velocidad: 4 }] });
  assert.equal(resultado.edit.duracionTotal, 7.5);
  assert.equal(resultado.edit.clips[1].duracion, 2.5);
});

test("una toma única con velocidad editada conserva clip y duración sin perder el corte", () => {
  const resultado = posts.parseEdit({ clips: [{ ...CLIPS_VALIDOS[0], inicio: 1, fin: 5, velocidad: 0.5 }] });
  assert.equal(resultado.error, undefined);
  assert.equal(resultado.edit.clips.length, 1);
  assert.equal(resultado.edit.clips[0].velocidad, 0.5);
  assert.equal(resultado.edit.clips[0].inicio, 1);
  assert.equal(resultado.edit.clips[0].fin, 5);
  assert.equal(resultado.edit.duracionTotal, 8);
});

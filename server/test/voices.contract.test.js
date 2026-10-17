const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const voices = require("../src/modules/voices/voices.routes");
const Voice = require("../src/modules/voices/Voice");
const audio = require("../src/modules/music/audio.routes");
const posts = require("../src/modules/posts/posts.routes");
const Post = require("../src/modules/posts/Post");
const storage = require("../src/config/storage");
const tts = require("../src/modules/voices/tts.service");
const voiceSettings = require("../src/modules/voices/voiceSettings");
const aiError = require("../src/middleware/aiError");

/* ============================================================
   VOCES DEL ESTUDIO Y VOZ EN OFF — contrato

   Lo que estas pruebas cuidan:
   - el catálogo de voces dice la verdad: una voz sin modelo o sin el
     servicio configurado se marca como no disponible, con su motivo;
   - una grabación propia se guarda en su propia carpeta;
   - la voz en off sobrevive al guardado con sus topes.
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

const vozBase = {
  _id: "v1",
  nombre: "Ana del estudio",
  tipo: "catalogo",
  modelo: "",
  url: "",
  duracion: 0,
  configurables: ["velocidad", "tono", "volumen"],
  createdAt: new Date()
};

test("el catálogo de voces es una lectura con sesión y escribir es de administración", () => {
  const lista = rutas(voices);

  const catalogo = lista.find((r) => r.ruta === "/" && r.metodos.includes("get"));
  assert.ok(catalogo, "falta GET /api/voices");
  assert.ok(catalogo.nombres.includes("auth"), "el catálogo exige sesión");
  assert.ok(catalogo.nombres.includes("requireUser"), "el catálogo exige usuario");

  const registrar = lista.find((r) => r.ruta === "/" && r.metodos.includes("post"));
  assert.ok(registrar, "falta POST /api/voices");
  assert.ok(registrar.nombres.includes("auth"));
  assert.ok(registrar.nombres.includes("requireAdmin"), "registrar voces es solo de administración");
});

test("una voz sin modelo o sin servicio no se ofrece como disponible", () => {
  const sinModelo = voices.comoVoz(vozBase, { credencial: true });
  assert.equal(sinModelo.disponible, false);
  assert.equal(sinModelo.motivo, "Esta voz todavía no tiene modelo asignado.");

  const sinCredencial = voices.comoVoz({ ...vozBase, modelo: "proveedor/voz" }, { credencial: false });
  assert.equal(sinCredencial.disponible, false);
  assert.match(sinCredencial.motivo, /servicio de voz/);

  const lista = voices.comoVoz({ ...vozBase, modelo: "proveedor/voz" }, { credencial: true });
  assert.equal(lista.disponible, true);
  assert.equal(lista.motivo, "");
  assert.deepEqual(lista.ajustes, ["velocidad", "tono", "volumen"]);

  // Una grabación propia sin archivo tampoco se puede usar.
  const propiaVacia = voices.comoVoz({ _id: "v2", nombre: "Mi voz", tipo: "propia" }, { credencial: false });
  assert.equal(propiaVacia.disponible, false);
  assert.match(propiaVacia.motivo, /grabación/);

  assert.equal(voices.vocesUsables([vozBase, { ...vozBase, modelo: "proveedor/voz" }], true).length, 1);
});

test("las voces solo se sirven desde el almacén propio", () => {
  assert.equal(voices.esUrlLocalDeVoz("/uploads/voices/toma.m4a"), true);
  assert.equal(voices.esUrlLocalDeVoz("/uploads/music/pista.mp3"), false);
  assert.equal(voices.esUrlLocalDeVoz("https://otro-sitio.com/voz.mp3"), false);
  assert.equal(voices.esUrlLocalDeVoz(""), false);
});

test("el esquema de la voz y la carpeta propia están declarados", () => {
  assert.equal(Voice.schema.path("nombre").options.required, true);
  assert.deepEqual(Voice.schema.path("tipo").options.enum, ["propia", "catalogo"]);
  assert.deepEqual(Voice.schema.path("genero").options.enum, ["femenina", "masculina", "neutra", ""]);
  assert.equal(Voice.schema.path("lista").options.default, false);
  assert.equal(Voice.schema.path("vozProveedor").options.maxlength, 120, "la voz dentro del modelo está declarada");
  assert.ok(storage.VOICES_DIR.endsWith(path.join("uploads", "voices")), "la voz tiene su carpeta");
});

test("subir audio acepta el destino de voz y guarda en su carpeta", () => {
  const fuente = fs.readFileSync(path.join(process.cwd(), "src/modules/music/audio.routes.js"), "utf-8");
  assert.ok(fuente.includes('req.body?.destino === "voz"'), "la ruta distingue el destino");
  assert.ok(fuente.includes('subdir: destino === "voz" ? "voices" : "music"'), "cada destino tiene su carpeta");
  assert.ok(rutas(audio).some((r) => r.ruta === "/audio"), "sigue existiendo POST /api/uploads/audio");
});

test("la voz en off entra en la receta con topes", () => {
  const resultado = posts.parseEdit({
    voz: { url: "/uploads/voices/mi-voz.m4a", nombre: "Mi voz", inicio: 2, fin: 12, volumen: 1.6, fundidoEntrada: 40 }
  });
  assert.equal(resultado.error, undefined, resultado.error || "");
  assert.equal(resultado.edit.voz.url, "/uploads/voices/mi-voz.m4a");
  assert.equal(resultado.edit.voz.volumen, 1, "el volumen se acota");
  assert.equal(resultado.edit.voz.fundidoEntrada, 5, "el fundido no pasa de la mitad de la toma");
  assert.equal(resultado.edit.voz.tipo, "propia");

  const catalogo = posts.parseEdit({ voz: { voiceId: "v1", tipo: "catalogo" } });
  assert.equal(catalogo.edit.voz.voiceId, "v1");
  assert.equal(catalogo.edit.voz.url, "");

  const externa = posts.parseEdit({ voz: { url: "ftp://otro-sitio.com/voz.mp3" } });
  assert.match(externa.error, /voz/);

  const sin = posts.parseEdit({ medida: "1:1" });
  assert.equal(sin.edit.voz, undefined, "sin voz no se inventa el campo");
});

test("la locución usa la misma llave de OpenRouter, con modelo y voz configurables", () => {
  const sinLlave = voiceSettings.ajustesVoz({});
  assert.equal(sinLlave.listo, false);
  assert.equal(sinLlave.variable, "OPENROUTER_API_KEY");
  assert.equal(sinLlave.modelo, voiceSettings.MODELO_POR_DEFECTO);
  assert.equal(sinLlave.voz, voiceSettings.VOZ_POR_DEFECTO);
  assert.equal(sinLlave.limites.texto, 1200);

  const conLlave = voiceSettings.ajustesVoz({
    OPENROUTER_API_KEY: "llave-de-prueba",
    OPENROUTER_TTS_MODEL: "proveedor/voz-2",
    OPENROUTER_TTS_VOICE: "ara"
  });
  assert.equal(conLlave.listo, true);
  assert.equal(conLlave.modelo, "proveedor/voz-2");
  assert.equal(conLlave.voz, "ara");

  // El servicio declara los mismos ajustes que la pantalla muestra.
  assert.equal(voices.ajustesVoz({ OPENROUTER_API_KEY: "x" }).listo, true);
});

test("la locución se pide al punto único de conexión y se guarda en el almacén propio", async () => {
  const llamadas = [];
  const original = global.fetch;
  global.fetch = async (url, opciones) => {
    llamadas.push({ url: String(url), cuerpo: JSON.parse(opciones.body), cabeceras: opciones.headers });
    return new Response(Buffer.from("ID3-falsa-voz"), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" }
    });
  };

  // El guardado real escribe en disco y copia a GridFS: aquí se sustituye
  // por uno de mentira que solo apunta qué se le pidió guardar.
  const guardados = [];
  const guardarFalso = async (peticion) => {
    guardados.push(peticion);
    return { url: "/uploads/voices/locucion.mp3", filePath: "/tmp/locucion.mp3", size: peticion.buffer.length };
  };

  try {
    const toma = await tts.generarLocucion({
      texto: "  Hola, esto es una prueba  ",
      apiKey: "llave-de-prueba",
      voz: "eve",
      env: { OPENROUTER_API_KEY: "llave-de-prueba", OPENROUTER_TTS_MODEL: "proveedor/voz-2" },
      guardar: guardarFalso
    });

    assert.equal(llamadas.length, 1);
    assert.match(llamadas[0].url, /\/audio\/speech$/);
    assert.equal(llamadas[0].cuerpo.model, "proveedor/voz-2");
    assert.equal(llamadas[0].cuerpo.voice, "eve");
    assert.equal(llamadas[0].cuerpo.input, "Hola, esto es una prueba");
    assert.equal(llamadas[0].cuerpo.response_format, "mp3");
    // El SDK arma las cabeceras como objeto o como Headers: se leen igual.
    const cabeceras = new Headers(llamadas[0].cabeceras || {});
    assert.match(cabeceras.get("authorization") || "", /^Bearer /);

    assert.equal(guardados.length, 1);
    assert.equal(guardados[0].subdir, "voices");
    assert.equal(guardados[0].mimetype, "audio/mpeg");
    assert.equal(toma.url, "/uploads/voices/locucion.mp3");
    assert.equal(toma.modelo, "proveedor/voz-2");
    assert.equal(toma.voz, "eve");
  } finally {
    global.fetch = original;
  }
});

test("la locución falla con la verdad: sin llave, sin texto y con proveedor caído", async () => {
  const sinLlave = await tts.generarLocucion({ texto: "algo", env: {} }).catch((error) => error.message);
  assert.equal(sinLlave, "OPENROUTER_API_KEY_NOT_CONFIGURED");
  assert.equal(aiError.getAIErrorResponse(new Error(sinLlave)).status, 503);

  const sinTexto = await tts.generarLocucion({ texto: "   ", env: { OPENROUTER_API_KEY: "x" } }).catch((error) => error.message);
  assert.equal(sinTexto, "VOICE_TEXT_INVALID");
  assert.equal(aiError.getAIErrorResponse(new Error(sinTexto)).status, 400);

  const larguisimo = "a".repeat(tts.LIMITE_TEXTO + 1);
  const pasado = await tts.generarLocucion({ texto: larguisimo, env: { OPENROUTER_API_KEY: "x" } }).catch((error) => error.message);
  assert.equal(pasado, "VOICE_TEXT_TOO_LONG");
  assert.equal(aiError.getAIErrorResponse(new Error(pasado)).status, 400);

  const original = global.fetch;
  global.fetch = async () => new Response("boom", { status: 500 });
  try {
    const caido = await tts.generarLocucion({ texto: "algo", apiKey: "x" }).catch((error) => error.message);
    assert.equal(caido, "VOICE_PROVIDER_UNAVAILABLE");
    assert.equal(aiError.getAIErrorResponse(new Error(caido)).status, 503);
  } finally {
    global.fetch = original;
  }
});

test("la ruta de locución exige sesión y solo genera voces del catálogo con modelo", () => {
  const lista = rutas(voices);
  const locucion = lista.find((r) => r.ruta === "/locucion");
  assert.ok(locucion, "falta POST /api/voices/locucion");
  assert.ok(locucion.metodos.includes("post"));
  assert.ok(locucion.nombres.includes("auth"), "la locución exige sesión");
  assert.ok(locucion.nombres.includes("requireUser"), "la locución exige usuario");

  const fuente = fs.readFileSync(path.join(process.cwd(), "src/modules/voices/voices.routes.js"), "utf-8");
  assert.ok(fuente.includes("Una voz grabada no se genera"), "una voz propia con archivo no se genera");
  assert.ok(fuente.includes("no tiene modelo asignado"), "una voz sin modelo no se genera");
});

test("la voz vive en el esquema de la receta y el servidor monta su ruta", () => {
  const media = Post.schema.path("media");
  assert.ok(media.schema.path("edit.voz.url"), "el esquema guarda la voz");
  assert.equal(media.schema.path("edit.voz.volumen").options.max, 1);
  assert.deepEqual(media.schema.path("edit.voz.tipo").options.enum, ["propia", "catalogo", ""]);

  const servidor = fs.readFileSync(path.join(process.cwd(), "src/http/registerRoutes.js"), "utf-8");
  assert.ok(servidor.includes('app.use("/api/voices", voiceRoutes)'), "falta montar /api/voices");
});

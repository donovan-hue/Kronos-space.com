const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const kairos = require("../src/modules/ai-core/routes/kairos.routes");
const MusicTrack = require("../src/modules/music/MusicTrack");
const voiceSettings = require("../src/modules/voices/voiceSettings");

/* ============================================================
   CAPACIDADES DE KAIROS — contrato

   El tablero de Kairos pinta cada herramienta según lo que diga esta
   respuesta. Lo que se cuida aquí es que diga la verdad:

   - sin variables, cada capacidad de proveedor está en falta y nombra la
     variable que falta;
   - con las variables puestas, está lista;
   - la música dice cuántas pistas hay de verdad;
   - lo que vive en el servidor (trabajos, biblioteca, historial) va listo,
     y los filtros se declaran del estudio sin prometer proveedor.

   Ninguna prueba sale a la red ni toca la base: la capacidad de la música se
   prueba con el contador sustituido.
   ============================================================ */

function rutas(router) {
  return (router.stack || [])
    .filter((capa) => capa.route)
    .map((capa) => ({
      ruta: capa.route.path,
      metodos: Object.keys(capa.route.methods),
      nombres: capa.route.stack.map((paso) => paso.name),
      manejador: capa.route.stack[capa.route.stack.length - 1].handle
    }));
}

const CAPACIDADES_DE_PROVEEDOR = ["imagen", "video", "texto", "chat"];

test("la ruta de capacidades existe y exige sesión", () => {
  const lista = rutas(kairos);
  const capacidades = lista.find((r) => r.ruta === "/capacidades" && r.metodos.includes("get"));
  assert.ok(capacidades, "falta GET /api/kairos/capacidades");
  assert.ok(capacidades.nombres.includes("auth"), "las capacidades exigen sesión");
  assert.ok(capacidades.nombres.includes("requireUser"), "las capacidades exigen usuario");

  const servidor = fs.readFileSync(path.join(process.cwd(), "src/server.js"), "utf-8");
  assert.ok(servidor.includes('app.use("/api/kairos", kairosRoutes)'), "falta montar /api/kairos");
});

test("sin variables, cada proveedor está en falta y dice qué le falta", () => {
  const guardadas = {};
  for (const variable of ["OPENROUTER_API_KEY", "GEMINI_API_KEY", "VIDEO_API_KEY", "VIDEO_API_URL"]) {
    guardadas[variable] = process.env[variable];
    delete process.env[variable];
  }

  try {
    const imagen = kairos.capacidadDeProveedor("image");
    assert.equal(imagen.listo, false);
    assert.equal(imagen.variable, "OPENROUTER_API_KEY");
    assert.deepEqual(imagen.falta, ["OPENROUTER_API_KEY"]);
    assert.equal(imagen.proveedor, "openrouter");

    const video = kairos.capacidadDeProveedor("video");
    assert.equal(video.listo, false);
    assert.deepEqual(video.falta, ["VIDEO_API_KEY", "VIDEO_API_URL"], "el video necesita las dos variables");

    const texto = kairos.capacidadDeProveedor("script");
    assert.equal(texto.listo, false);
    assert.equal(texto.variable, "OPENROUTER_API_KEY");

    const chat = kairos.capacidadDeProveedor("chat");
    assert.equal(chat.listo, false);
    assert.equal(chat.variable, "GEMINI_API_KEY");
  } finally {
    for (const [variable, valor] of Object.entries(guardadas)) {
      if (valor === undefined) delete process.env[variable];
      else process.env[variable] = valor;
    }
  }
});

test("con la llave puesta, imagen, guion y voz quedan listos y el video no", () => {
  const guardadas = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, VIDEO_API_KEY: process.env.VIDEO_API_KEY };
  process.env.OPENROUTER_API_KEY = "llave-de-prueba";
  delete process.env.VIDEO_API_KEY;

  try {
    assert.equal(kairos.capacidadDeProveedor("image").listo, true);
    assert.equal(kairos.capacidadDeProveedor("script").listo, true);
    assert.deepEqual(kairos.capacidadDeProveedor("image").falta, []);
    assert.equal(voiceSettings.ajustesVoz().listo, true, "la voz usa la misma llave");
    assert.equal(kairos.capacidadDeProveedor("video").listo, false, "el video es otro proveedor");
  } finally {
    if (guardadas.OPENROUTER_API_KEY === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = guardadas.OPENROUTER_API_KEY;
    if (guardadas.VIDEO_API_KEY === undefined) delete process.env.VIDEO_API_KEY;
    else process.env.VIDEO_API_KEY = guardadas.VIDEO_API_KEY;
  }
});

test("la respuesta completa dice la verdad de cada herramienta", async () => {
  const guardadas = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    VIDEO_API_KEY: process.env.VIDEO_API_KEY,
    VIDEO_API_URL: process.env.VIDEO_API_URL
  };
  process.env.OPENROUTER_API_KEY = "llave-de-prueba";
  delete process.env.VIDEO_API_KEY;
  delete process.env.VIDEO_API_URL;

  // El contador real consulta la base; aquí se sustituye por uno de mentira.
  const originalCount = MusicTrack.countDocuments;
  MusicTrack.countDocuments = async () => 4;

  try {
    const capacidades = rutas(kairos).find((r) => r.ruta === "/capacidades").manejador;
    let enviado = null;
    const res = {
      status(codigo) {
        this.codigo = codigo;
        return this;
      },
      json(cuerpo) {
        enviado = cuerpo;
        return this;
      }
    };

    await capacidades({ user: { id: "u1" }, query: {} }, res);

    assert.ok(enviado, "la ruta responde");
    for (const nombre of CAPACIDADES_DE_PROVEEDOR) {
      assert.ok(enviado[nombre], `falta la capacidad ${nombre}`);
      assert.equal(typeof enviado[nombre].listo, "boolean", `${nombre} declara listo o no`);
    }

    assert.equal(enviado.imagen.listo, true);
    assert.equal(enviado.video.listo, false);
    assert.deepEqual(enviado.video.falta, ["VIDEO_API_KEY", "VIDEO_API_URL"]);
    assert.equal(enviado.voz.listo, true, "la voz va con la misma llave");
    assert.equal(enviado.voz.modelo, voiceSettings.MODELO_POR_DEFECTO);

    assert.equal(enviado.musica.listo, true);
    assert.equal(enviado.musica.pistas, 4, "la música cuenta las pistas de verdad");

    assert.equal(enviado.filtros.listo, true);
    assert.match(enviado.filtros.nota, /estudio/);
    for (const nombre of ["trabajos", "biblioteca", "historial"]) {
      assert.equal(enviado[nombre].listo, true, `${nombre} vive en el servidor`);
    }
  } finally {
    MusicTrack.countDocuments = originalCount;
    for (const [variable, valor] of Object.entries(guardadas)) {
      if (valor === undefined) delete process.env[variable];
      else process.env[variable] = valor;
    }
  }
});

test("si el catálogo de música no responde, la capacidad lo dice", async () => {
  const originalCount = MusicTrack.countDocuments;
  MusicTrack.countDocuments = async () => {
    throw new Error("sin base");
  };

  try {
    const capacidades = rutas(kairos).find((r) => r.ruta === "/capacidades").manejador;
    let enviado = null;
    const res = { status() { return this; }, json(cuerpo) { enviado = cuerpo; return this; } };

    await capacidades({ user: { id: "u1" }, query: {} }, res);

    assert.equal(enviado.musica.listo, false);
    assert.match(enviado.musica.motivo, /No se pudo leer el catálogo/);
  } finally {
    MusicTrack.countDocuments = originalCount;
  }
});

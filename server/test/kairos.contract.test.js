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

  const servidor = fs.readFileSync(path.join(process.cwd(), "src/http/registerRoutes.js"), "utf-8");
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

// ---------------------------------------------------------------
// 030 — chat con memoria (bloque 2.1).
//
// `POST /api/ai/chat` era una llamada sin estado: el cliente mandaba el
// historial entero en cada petición y el servidor no guardaba nada.
// ---------------------------------------------------------------

const ChatConversation = require("../src/modules/ai-core/ChatConversation");
const { titleFrom } = require("../src/modules/ai-core/routes/chat.routes");

test("030: cada mensaje guarda su estado y el error si lo hubo", () => {
  const message = ChatConversation.schema.path("messages");
  assert.ok(message, "los mensajes viven embebidos en la conversación");

  const estado = ChatConversation.schema.path("messages.estado");
  assert.deepStrictEqual(estado.enumValues, ["ok", "error"]);

  assert.ok(ChatConversation.schema.path("messages.error"));
  assert.ok(ChatConversation.schema.path("messages.model"));

  // La preferencia de tono se congela en el hilo: cambiarla en Ajustes no
  // reescribe lo ya hablado.
  assert.deepStrictEqual(
    ChatConversation.schema.path("personality").enumValues,
    ["normal", "direct", "sarcastic", "grumpy"]
  );
  assert.strictEqual(ChatConversation.schema.path("user").options.ref, "User");

  assert.strictEqual(ChatConversation.MAX_MESSAGES, 200);
  assert.strictEqual(ChatConversation.MAX_MESSAGE_LENGTH, 4000);
});

test("030: el título por defecto sale del primer mensaje", () => {
  assert.strictEqual(titleFrom("  Hola   Kairos \n"), "Hola Kairos");
  assert.strictEqual(titleFrom(""), "");
  const largo = titleFrom("x".repeat(200));
  assert.ok(largo.length <= 120);
  assert.ok(largo.endsWith("…"));
});

test("030: las rutas de conversación existen, exigen sesión y son del dueño", () => {
  // Esta suite no levanta el servidor; se comprueba el contrato en el router
  // y en el código, que es lo que puede romperse aquí.
  const chatRouter = require("../src/modules/ai-core/routes/chat.routes");
  const lista = rutas(chatRouter).filter((r) => r.ruta.startsWith("/chat/conversations"));

  for (const ruta of ["/chat/conversations", "/chat/conversations/:id"]) {
    const capa = lista.find((r) => r.ruta === ruta);
    assert.ok(capa, `falta ${ruta}`);
    assert.ok(capa.nombres.includes("auth"), `${ruta} exige sesión`);
    assert.ok(capa.nombres.includes("requireUser"), `${ruta} exige usuario`);
  }

  const source = fs.readFileSync(
    require.resolve("../src/modules/ai-core/routes/chat.routes.js"),
    "utf8"
  );

  // Todas las consultas filtran por dueño: el id ajeno no revela que exista.
  assert.match(source, /_id: req\.params\.id,\s*\n\s*user: req\.user\.id/);
  // Con hilo, el historial sale de la base y no del cliente.
  assert.match(source, /const effectiveHistory = conversation/);
  // Un fallo del proveedor no borra el mensaje del usuario.
  assert.match(source, /estado: "error"/);
});

test("030: borrar la cuenta borra también sus conversaciones", () => {
  const source = fs.readFileSync(
    require.resolve("../src/modules/users/users.routes.js"),
    "utf8"
  );
  assert.match(source, /ChatConversation\.deleteMany\(\{ user: userId \}\)/);
});

/* ============================================================
   2.4 — libro de consumo y administración de catálogos
   ============================================================ */

test("031: el libro de consumo mide por capacidad y en su propia unidad", () => {
  const AiUsage = require("../src/modules/ai-core/AiUsage");
  const { UNITS_BY_CAPABILITY, monthStart } = require("../src/modules/ai-core/aiUsage.service");

  assert.deepEqual(AiUsage.CAPACITIES, ["chat", "image", "video", "script", "voice"]);
  assert.equal(AiUsage.schema.path("capability").options.enum.join(","), AiUsage.CAPACITIES.join(","));

  // Cada capacidad declara su unidad: sumar imágenes con caracteres no
  // significa nada, así que no hay un «total» único.
  for (const capability of AiUsage.CAPACITIES) {
    assert.ok(UNITS_BY_CAPABILITY[capability], `${capability} sin unidad declarada`);
  }
  assert.equal(UNITS_BY_CAPABILITY.voice, "caracteres");

  // El libro mide coste, no contenido: no guarda prompts ni resultados.
  const campos = Object.keys(AiUsage.schema.paths);
  for (const prohibido of ["prompt", "result", "texto", "content", "message"]) {
    assert.equal(campos.includes(prohibido), false, `el libro no debe guardar ${prohibido}`);
  }

  // El periodo es el mes en curso, no «los últimos 30 días»: el resumen se
  // reinicia el día 1.
  const inicio = monthStart(new Date("2026-11-04T18:00:00.000Z"));
  assert.equal(inicio.toISOString(), "2026-11-01T00:00:00.000Z");
});

test("031: las cinco rutas facturables anotan consumo y hay resumen del mes", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const fuente = (relativa) => fs.readFileSync(path.join(__dirname, "..", relativa), "utf8");

  const emisores = {
    "src/modules/ai-core/routes/chat.routes.js": "chat",
    "src/modules/image-ai/image.routes.js": "image",
    "src/modules/video-ai/video.routes.js": "video",
    "src/modules/script-ai/script.routes.js": "script",
    "src/modules/voices/voices.routes.js": "voice"
  };

  for (const [archivo, capability] of Object.entries(emisores)) {
    const codigo = fuente(archivo);
    assert.match(codigo, /recordUsage/, `${archivo} no anota consumo`);
    assert.match(
      codigo,
      new RegExp(`capability: "${capability}"`),
      `${archivo} no anota la capacidad ${capability}`
    );
    assert.match(codigo, /estado: "error"/, `${archivo} no registra los fallos`);
  }

  // La ruta de resumen existe, exige sesión y devuelve el desglose.
  const chat = fuente("src/modules/ai-core/routes/chat.routes.js");
  assert.match(chat, /router\.get\("\/usage", auth, requireUser/);
  assert.match(chat, /monthlyUsage\(req\.user\.id\)/);

  // Se borra con la cuenta, como el resto de datos del usuario.
  const usuarios = fuente("src/modules/users/users.routes.js");
  assert.match(usuarios, /AiUsage\.deleteMany\(\{ user: userId \}\)/);

  // Y está declarado en el registro de colecciones.
  const registro = fuente("src/db/registry.js");
  assert.match(registro, /ai-core\/AiUsage/);
});

test("031: publicar en los catálogos tiene pantalla de administración", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.join(__dirname, "..", "..");

  // El servidor ya exigía administración; se comprueba que sigue siendo así.
  const musica = fs.readFileSync(path.join(raiz, "server/src/modules/music/music.routes.js"), "utf8");
  const voces = fs.readFileSync(path.join(raiz, "server/src/modules/voices/voices.routes.js"), "utf8");
  assert.match(musica, /router\.post\("\/", auth, requireUser, requireAdmin/);
  assert.match(voces, /router\.post\("\/", auth, requireUser, requireAdmin/);

  // Y ahora hay cliente y pantalla que las llaman.
  const servicioMusica = fs.readFileSync(path.join(raiz, "client/src/services/musicService.js"), "utf8");
  const servicioVoces = fs.readFileSync(path.join(raiz, "client/src/services/voiceService.js"), "utf8");
  assert.match(servicioMusica, /export async function publicarPista/);
  assert.match(servicioVoces, /export async function registrarVoz/);

  const pantalla = fs.readFileSync(path.join(raiz, "client/src/features/admin/CatalogAdmin.jsx"), "utf8");
  assert.match(pantalla, /publicarPista/);
  assert.match(pantalla, /registrarVoz/);

  const app = fs.readFileSync(path.join(raiz, "client/src/App.jsx"), "utf8");
  assert.match(app, /path="\/admin\/catalogos"/);
  assert.match(app, /AdminRoute/);
});

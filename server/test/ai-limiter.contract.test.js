const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");

const aiLimiterDefault = require("../src/middleware/aiLimiter");
const { aiLimiters, aiLimiterFor, createAiLimiter } = aiLimiterDefault;

/* ============================================================
   Presupuesto de las rutas de IA.

   Cubre tres defectos:

     M-01  `standardHeaders: true` emitía cabeceras draft-6
           (ratelimit-limit / -remaining / -reset) mientras el resto del
           servidor usa draft-8 (`RateLimit: "10-in-15min"; r=9; t=900`).
           Dos contratos distintos en la misma API.
     M-02  chat, imagen (dos rutas), guion y video compartían UNA instancia,
           y express-rate-limit cuenta por instancia: 10 intentos en total.
           Generar 10 imágenes dejaba el chat bloqueado 15 minutos.
     NUEVO POST /api/voices/locucion llamaba al TTS de pago de OpenRouter sin
           ningún limitador de IA: solo la alcanzaba el global de 300 por
           15 minutos, treinta veces más presupuesto facturable que el resto.
   ============================================================ */

const CAPACIDADES = ["chat", "image", "script", "video", "voice"];

function escuchar(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` })
    );
  });
}

/** Cabeceras de rate limit de una respuesta, con los nombres en minúscula. */
function cabecerasDeLimite(headers) {
  const sueltas = {};
  for (const [clave, valor] of headers) {
    if (/^ratelimit/i.test(clave)) sueltas[clave.toLowerCase()] = valor;
  }
  return sueltas;
}

test("M-02: cada capacidad tiene su propia instancia, no un presupuesto compartido", () => {
  for (const capacidad of CAPACIDADES) {
    assert.ok(aiLimiters[capacidad], `falta el limitador de la capacidad "${capacidad}"`);
  }

  // Lo decisivo: instancias distintas. Con una sola instancia compartida el
  // contador era único y las cinco rutas se gastaban el mismo presupuesto.
  for (const a of CAPACIDADES) {
    for (const b of CAPACIDADES) {
      if (a === b) continue;
      assert.notEqual(
        aiLimiterFor(a),
        aiLimiterFor(b),
        `"${a}" y "${b}" comparten instancia: volverían a gastarse el mismo presupuesto`
      );
    }
  }
});

test("M-02: agotar una capacidad no bloquea las demás", async () => {
  const app = express();
  app.disable("x-powered-by");
  const limite = createAiLimiter(3);
  const otro = createAiLimiter(3);
  app.post("/agotable", limite, (req, res) => res.json({ ok: true }));
  app.post("/intacta", otro, (req, res) => res.json({ ok: true }));

  const { server, base } = await escuchar(app);
  try {
    const estados = [];
    for (let i = 0; i < 5; i++) {
      estados.push((await fetch(`${base}/agotable`, { method: "POST" })).status);
    }
    assert.deepEqual(estados, [200, 200, 200, 429, 429], "el limitador de prueba no corta donde debe");

    // La otra capacidad no recibió ni una petición: debe seguir intacta.
    const intacta = await fetch(`${base}/intacta`, { method: "POST" });
    assert.equal(
      intacta.status,
      200,
      "agotar una capacidad bloqueó otra: el presupuesto vuelve a ser compartido"
    );
  } finally {
    server.close();
  }
});

test("M-01: las cabeceras son draft-8, como en el resto del servidor", async () => {
  const app = express();
  app.disable("x-powered-by");
  app.post("/ai", createAiLimiter(3), (req, res) => res.json({ ok: true }));

  const { server, base } = await escuchar(app);
  try {
    const respuesta = await fetch(`${base}/ai`, { method: "POST" });
    const cabeceras = cabecerasDeLimite(respuesta.headers);
    const claves = Object.keys(cabeceras);

    // draft-8: `RateLimit` y `RateLimit-Policy`.
    assert.ok(
      claves.includes("ratelimit"),
      `falta la cabecera draft-8 "RateLimit"; presentes: ${claves.join(", ") || "ninguna"}`
    );
    assert.match(
      cabeceras.ratelimit,
      /^"3-in-15min";\s*r=\d+;\s*t=900$/,
      `formato draft-8 inesperado: ${cabeceras.ratelimit}`
    );
    assert.ok(claves.includes("ratelimit-policy"), "falta RateLimit-Policy");

    // draft-6: estas tres NO deben aparecer. Su presencia era el defecto.
    for (const vieja of ["ratelimit-limit", "ratelimit-remaining", "ratelimit-reset"]) {
      assert.equal(
        claves.includes(vieja),
        false,
        `sigue emitiendo la cabecera draft-6 "${vieja}": dos contratos en la misma API`
      );
    }

    // Sin cabeceras heredadas X-RateLimit-*.
    assert.equal(
      respuesta.headers.get("x-ratelimit-limit"),
      null,
      "legacyHeaders sigue activo"
    );
  } finally {
    server.close();
  }
});

test("M-01: el 429 lleva el mensaje en español y conserva el contrato draft-8", async () => {
  const app = express();
  app.disable("x-powered-by");
  app.post("/ai", createAiLimiter(1), (req, res) => res.json({ ok: true }));

  const { server, base } = await escuchar(app);
  try {
    await fetch(`${base}/ai`, { method: "POST" });
    const bloqueada = await fetch(`${base}/ai`, { method: "POST" });

    assert.equal(bloqueada.status, 429);
    const cuerpo = await bloqueada.json();
    assert.equal(cuerpo.error, "Límite de uso de IA alcanzado. Intenta más tarde.");
    assert.match(
      cabecerasDeLimite(bloqueada.headers).ratelimit,
      /r=0;\s*t=900$/,
      "el 429 no informa el presupuesto agotado en draft-8"
    );
  } finally {
    server.close();
  }
});

test("una capacidad desconocida recibe un limitador, no queda sin control", () => {
  const desconocida = aiLimiterFor("capacidad-inventada");
  assert.equal(typeof desconocida, "function");
  assert.equal(desconocida, aiLimiterFor("chat"), "debe recaer en el presupuesto de chat");
  assert.equal(typeof aiLimiterFor(""), "function");
  assert.equal(typeof aiLimiterFor(undefined), "function");
});

test("la exportación por defecto sigue siendo utilizable como middleware", () => {
  // Los cuatro módulos de rutas importaban `aiLimiter` directamente; la
  // exportación por defecto debe seguir siendo un middleware de Express para
  // no romper a quien no haya migrado a `aiLimiterFor`.
  assert.equal(typeof aiLimiterDefault, "function");
  assert.equal(aiLimiterDefault, aiLimiters.chat);
});

test("las cinco capacidades que llaman a un proveedor de pago están limitadas", () => {
  const rutas = {
    "server/src/modules/ai-core/routes/chat.routes.js": 'aiLimiterFor("chat")',
    "server/src/modules/image-ai/image.routes.js": 'aiLimiterFor("image")',
    "server/src/modules/script-ai/script.routes.js": 'aiLimiterFor("script")',
    "server/src/modules/video-ai/video.routes.js": 'aiLimiterFor("video")',
    "server/src/modules/voices/voices.routes.js": 'aiLimiterFor("voice")'
  };

  for (const [ruta, esperado] of Object.entries(rutas)) {
    const fuente = fs.readFileSync(path.join(__dirname, "../..", ruta), "utf8");
    assert.ok(
      fuente.includes(esperado),
      `${ruta} no monta ${esperado}: esa ruta llama a un proveedor facturable sin presupuesto`
    );
  }

  // La locución es el caso que faltaba: se comprueba que está en la propia
  // declaración de la ruta, no en otro sitio del archivo.
  const voices = fs.readFileSync(
    path.join(__dirname, "../../server/src/modules/voices/voices.routes.js"),
    "utf8"
  );
  assert.match(
    voices,
    /router\.post\(\s*"\/locucion",[^)]*aiLimiterFor\("voice"\)/,
    "POST /api/voices/locucion vuelve a estar sin limitador de IA"
  );
});

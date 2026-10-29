const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Timeout y 503 de los proveedores de IA — la tabla que decide qué ve el
 * usuario cuando OpenRouter, Gemini o el proveedor de video fallan.
 *
 * El mecanismo existe: todo servicio de IA lanza un código
 * (`IMAGE_PROVIDER_TIMEOUT`, `VOICE_PROVIDER_UNAVAILABLE`,
 * `OPENROUTER_API_KEY_NOT_CONFIGURED`…) y `middleware/aiError.js` lo traduce a
 * un estado HTTP. Lo que no existía era la prueba, y sin prueba el fallo es
 * silencioso de la peor manera: un código nuevo que alguien inventa en un
 * servicio no está en la tabla, `getAIErrorResponse` lo disfraza de
 * `AI_PROVIDER_ERROR` y el cliente recibe 502 «No se pudo completar la
 * operación de IA» en lugar de 503 «este despliegue no tiene clave» — que es
 * justo el caso que el usuario puede entender y el operador puede arreglar.
 *
 * Un 500 en una caída de proveedor también miente: dice «Kronos se rompió»
 * cuando lo que pasó es que el de arriba no contestó, y en el cliente eso se
 * lee como «reintenta ya» en vez de «intenta más tarde».
 */

const { getAIErrorResponse } = require("../src/middleware/aiError");

/*
 * Qué se considera «código de proveedor de IA». El criterio es el nombre, y no
 * por comodidad: filtrar por archivo habría dejado fuera `src/config/openrouter.js`
 * (que es donde nace `OPENROUTER_API_KEY_NOT_CONFIGURED`) y dentro de los
 * servicios hay códigos de otra familia —`ACCOUNT_DELETE_STORAGE_UNAVAILABLE`,
 * por ejemplo— que se refieren al almacén propio, no al de arriba, y se prueban
 * en su propia suite.
 */
const PARECE_DE_PROVEEDOR =
  /^(?:IMAGE|SCRIPT|VIDEO|VOICE|MUSIC|KAIROS|CHAT|CAPTION|OPENROUTER|GEMINI|AI)_|_PROVIDER_|_API_KEY|API_KEY_NOT_CONFIGURED|_NO_IMAGE|RESULT_(?:INVALID|TOO_LARGE|UNAVAILABLE|PERSIST_FAILED)/;

function archivosDe(dirs) {
  const salida = [];
  const caminar = (directorio) => {
    if (!fs.existsSync(directorio)) return;

    for (const entrada of fs.readdirSync(directorio, { withFileTypes: true })) {
      const ruta = path.join(directorio, entrada.name);

      if (entrada.isDirectory()) caminar(ruta);
      else if (/\.(js|mjs)$/.test(entrada.name)) salida.push(ruta);
    }
  };

  for (const directorio of dirs) caminar(path.join(__dirname, "..", directorio));

  return salida;
}

/** Códigos que el código fuente lanza o propaga, con su archivo. */
function codigosQueSeLanzan() {
  const codigos = new Map();
  const fuente = archivosDe(["src/modules", "src/config", "src/middleware"]);

  for (const ruta of fuente) {
    const texto = fs.readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

    for (const m of texto.matchAll(/throw\s+new\s+Error\(\s*["'`]([A-Z][A-Z0-9_]{5,})["'`]/g)) {
      if (!codigos.has(m[1])) codigos.set(m[1], path.relative(path.join(__dirname, "..", ".."), ruta));
    }

    // `throw new Error(tiempoAgotado ? "A" : "B")`: los dos candidatos cuentan.
    for (const m of texto.matchAll(/throw\s+new\s+Error\([^)]*\)/gs)) {
      for (const c of m[0].matchAll(/["'`]([A-Z][A-Z0-9_]{5,})["'`]/g)) {
        if (!codigos.has(c[1])) codigos.set(c[1], path.relative(path.join(__dirname, "..", ".."), ruta));
      }
    }
  }

  return codigos;
}

/** La tabla declarada, leída del módulo para no duplicar el literal aquí. */
function tablaDeErrores() {
  const texto = fs.readFileSync(path.join(__dirname, "..", "src", "middleware", "aiError.js"), "utf8");
  const inicio = texto.indexOf("const AI_ERRORS = {");
  const fin = texto.indexOf("\n};", inicio);

  assert.ok(inicio >= 0 && fin > inicio, "no se encontró la tabla AI_ERRORS en src/middleware/aiError.js");

  const cuerpo = texto.slice(inicio, fin);
  const entrada = /(["']?[A-Z][A-Z0-9_]{3,}|[A-Z][A-Z0-9_]{3,})\s*:\s*\{[^{}]*status:\s*(\d{3})/g;
  const tabla = new Map();

  for (const m of cuerpo.matchAll(entrada)) tabla.set(m[1].replace(/["'`]/g, ""), Number(m[2]));

  assert.ok(tabla.size > 20, `la tabla se leyó corta (${tabla.size} entradas): revisa el parser del test`);

  return tabla;
}

test("todo código de proveedor que se lanza está declarado en la tabla", () => {
  const tabla = tablaDeErrores();
  const sinDeclarar = [];

  for (const [codigo, origen] of codigosQueSeLanzan()) {
    if (!PARECE_DE_PROVEEDOR.test(codigo)) continue;
    if (!tabla.has(codigo)) sinDeclarar.push(`${codigo} (${origen})`);
  }

  assert.deepEqual(
    sinDeclarar,
    [],
    "un código sin entrada en AI_ERRORS llega al cliente como 502 genérico: nadie sabe que el proveedor no está configurado"
  );
});

test("las caídas del proveedor no se disfrazan de fallo propio: 503, 504 o 429", () => {
  const tabla = tablaDeErrores();
  const mal = [];

  for (const [codigo, status] of tabla) {
    if (!PARECE_DE_PROVEEDOR.test(codigo)) continue;
    // `_NOT_SUPPORTED` es la petición mal formada (una capacidad que no existe),
    // no una caída del de arriba: ahí 400 es la respuesta honesta.
    if (/NOT_SUPPORTED$/.test(codigo)) continue;
    if (status === 400 || status === 401 || status === 404) continue;
    if (![429, 502, 503, 504].includes(status)) mal.push(`${codigo} → ${status}`);
  }

  assert.deepEqual(mal, [], "un error de proveedor respondido con 500 dice «Kronos se rompió» cuando no contestó el de arriba");
});

test("timeout es 504, proveedor ausente es 503, límite es 429", () => {
  const esperadas = {
    OPENROUTER_API_KEY_NOT_CONFIGURED: 503,
    GEMINI_API_KEY_NOT_CONFIGURED: 503,
    IMAGE_PROVIDER_TIMEOUT: 504,
    IMAGE_PROVIDER_UNAVAILABLE: 503,
    SCRIPT_PROVIDER_TIMEOUT: 504,
    VOICE_PROVIDER_TIMEOUT: 504,
    VOICE_PROVIDER_UNAVAILABLE: 503,
    VIDEO_PROVIDER_TIMEOUT: 504,
    VIDEO_PROVIDER_UNAVAILABLE: 503,
    VIDEO_PROVIDER_NETWORK_ERROR: 503,
    IMAGE_RESULT_PERSIST_FAILED: 503,
    AI_CAPABILITY_NOT_SUPPORTED: 400
  };

  for (const [codigo, status] of Object.entries(esperadas)) {
    const respuesta = getAIErrorResponse(new Error(codigo));

    assert.equal(respuesta.code, codigo, `${codigo} debe conservarse como código, no diluirse en AI_PROVIDER_ERROR`);
    assert.equal(respuesta.status, status, `${codigo} debe responder ${status}`);
    assert.match(respuesta.message, /^[A-ZÁÉÍÓÚÑÜa-záéíóúñü]/, "el mensaje llega al usuario: se escribe en español y con mayúscula inicial");
  }
});

test("un fallo no catalogado no se convierte en 500 ni filtra el secreto", () => {
  const secrecao = Object.assign(new Error("OpenAI is 401: sk-or-vi-UNA-CLAVE-FALSA-0123456789"), {
    status: 401
  });
  const respuesta = getAIErrorResponse(secrecao);

  assert.equal(respuesta.code, "AI_PROVIDER_ERROR", "lo desconocido se nombra como lo que es: error de proveedor");
  assert.equal(respuesta.status, 502);
  assert.ok(!respuesta.message.includes("sk-or-"), "el mensaje al cliente no puede repetir la clave del proveedor");
  assert.ok(!/401/.test(respuesta.message), "ni el status ni el cuerpo del proveedor se reenvían tal cual");

  const sinError = getAIErrorResponse(undefined);

  assert.equal(sinError.status, 502, "un catch sin error conocido tampoco produce 500");
  assert.equal(typeof sinError.message, "string");
});

test("los cinco endpoints de IA mapean por la tabla compartida", () => {
  const rutas = [
    "src/modules/ai-core/routes/chat.routes.js",
    "src/modules/image-ai/image.routes.js",
    "src/modules/script-ai/script.routes.js",
    "src/modules/video-ai/video.routes.js",
    "src/modules/voices/voices.routes.js"
  ];

  for (const relativo of rutas) {
    const texto = fs.readFileSync(path.join(__dirname, "..", relativo), "utf8");

    assert.match(texto, /getAIErrorResponse\(/, `${relativo} debe responder con la tabla, no con un status a mano`);

    const sinMapear = [];

    // Un catch que responde 500 y llama a un servicio de proveedor en la misma
    // ruta es el patrón que hay que evitar: el proveedor se cae y el cliente ve
    // un fallo de Kronos.
    for (const bloque of texto.matchAll(/router\.(?:post|get|patch)\(([\s\S]*?)\n\}\);/g)) {
      const cuerpo = bloque[1];

      if (!/aiLimiter|generarLocucion|imageService\.|videoService|scriptService|model\.service|\.chat\.completions/.test(cuerpo)) continue;
      if (/getAIErrorResponse/.test(cuerpo)) continue;

      for (const m of cuerpo.matchAll(/status\((4\d\d|5\d\d)\)/g)) sinMapear.push(m[1]);
    }

    assert.deepEqual(
      sinMapear,
      [],
      `${relativo} responde un status fijo en una ruta que llama al proveedor: se salta la tabla de errores de IA`
    );
  }
});

test("el timeout declarado del cliente es finito en todos los servicios de IA", () => {
  const servicios = archivosDe(["src/modules", "src/config"]).filter((ruta) => /\.(service|routes)\.js$/.test(ruta));
  const sinCota = [];

  for (const ruta of servicios) {
    const texto = fs.readFileSync(ruta, "utf8");

    if (!/OPENROUTER|openrouter|gemini|VIDEO_API_KEY|createOpenRouterClient/.test(texto)) continue;
    if (!/fetch\(|\.create\(|createOpenRouterClient\(/.test(texto)) continue;
    if (/timeout\s*[:=]|AbortSignal\.timeout/.test(texto)) continue;

    sinCota.push(path.relative(path.join(__dirname, "..", ".."), ruta));
  }

  assert.deepEqual(
    sinCota,
    [],
    "una llamada al proveedor sin timeout es una petición que puede quedar colgada para siempre ocupando un worker"
  );
});

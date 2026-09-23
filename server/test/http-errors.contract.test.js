const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * KRONOS-AUDIT-004 — regresión del contrato de errores HTTP.
 *
 * Antes de este bloque, comprobado sobre HTTP real:
 *
 *   POST /api/auth/login  cuerpo JSON incompleto
 *     -> 400 {"error":"Unexpected end of JSON input"}
 *   POST /api/auth/login  cuerpo de 2 MB
 *     -> 413 {"error":"request entity too large"}
 *   GET  /
 *     -> 404 text/html "<title>Error</title> ... Cannot GET /"
 *
 * Los dos primeros filtraban el mensaje del runtime en inglés; el tercero
 * devolvía HTML donde todo el resto del servicio responde JSON. Estas
 * pruebas fijan el comportamiento correcto y, sobre todo, evitan que los
 * mensajes de aplicación en español se pierdan por un filtro demasiado
 * amplio.
 *
 * HTTP real sobre la app real. Ningún caso necesita base de datos: todos
 * cortan antes de cualquier consulta.
 */

const previousSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "kronos-http-errors-secret";
process.env.CLIENT_URL = "https://kronos-space.com";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");
const {
  describeClientError,
  isStorageUnavailable
} = require("../src/middleware/httpErrors");

let baseUrl;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));

  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }

  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

async function request(path, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
  const text = await response.text();
  let data = null;

  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  return { status: response.status, data, text, contentType: response.headers.get("content-type") };
}

const json = (value) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: typeof value === "string" ? value : JSON.stringify(value)
});

// ---------------------------------------------------------------
// Cuerpo ilegible: mensaje propio, nunca el del runtime
// ---------------------------------------------------------------

test("JSON incompleto responde 400 INVALID_JSON y no el mensaje del runtime", async () => {
  const { status, data } = await request("/api/auth/login", json('{"email":'));

  assert.equal(status, 400);
  assert.equal(data.code, "INVALID_JSON");
  assert.equal(data.error, "El cuerpo de la petición no es JSON válido.");
  assert.ok(
    !/Unexpected|JSON input|position|token/i.test(data.error),
    `el mensaje no debe exponer el error del parser: ${data.error}`
  );
});

test("JSON que no es objeto responde 400 INVALID_JSON", async () => {
  const { status, data } = await request("/api/auth/login", json('"solo-un-string"'));

  assert.equal(status, 400);
  assert.equal(data.code, "INVALID_JSON");
});

test("cuerpo por encima del límite responde 413 PAYLOAD_TOO_LARGE en español", async () => {
  const { status, data } = await request(
    "/api/auth/login",
    json({ relleno: "z".repeat(2 * 1024 * 1024) })
  );

  assert.equal(status, 413);
  assert.equal(data.code, "PAYLOAD_TOO_LARGE");
  assert.equal(data.error, "El contenido de la petición supera el tamaño permitido.");
  assert.ok(!/entity too large/i.test(data.error));
});

test("charset no soportado responde 415 UNSUPPORTED_CHARSET", async () => {
  const { status, data } = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=latin1" },
    body: '{"a":1}'
  });

  assert.equal(status, 415);
  assert.equal(data.code, "UNSUPPORTED_CHARSET");
});

// ---------------------------------------------------------------
// Los errores de aplicación conservan su mensaje en español
// ---------------------------------------------------------------

test("una validación de la aplicación sigue respondiendo con su propio mensaje", async () => {
  const { status, data } = await request("/api/auth/login", json({}));

  assert.equal(status, 400);
  assert.equal(data.error, "email y password son obligatorios");
  assert.equal(data.code, undefined, "no debe reetiquetarse como error de infraestructura");
});

test("un 401 de la aplicación no se transforma en 503", async () => {
  const { status, data } = await request("/api/posts");

  assert.equal(status, 401);
  assert.equal(data.error, "Token requerido");
});

// ---------------------------------------------------------------
// 404 JSON en todo el servicio, no solo en /api
// ---------------------------------------------------------------

for (const path of ["/", "/cualquier-cosa", "/uploads/no-existe.jpg", "/api/nope"]) {
  test(`ruta desconocida ${path} responde 404 JSON`, async () => {
    const { status, data, contentType } = await request(path);

    assert.equal(status, 404);
    assert.match(contentType, /application\/json/);
    assert.equal(data.error, "Recurso no encontrado");
    assert.equal(data.code, "NOT_FOUND");
    assert.equal(data.path, path);
  });
}

test("ninguna ruta desconocida devuelve la página HTML de Express", async () => {
  for (const path of ["/", "/favicon.ico", "/no/existe/esto"]) {
    const { text, contentType } = await request(path);

    assert.ok(!/text\/html/.test(contentType), `${path} no debe responder HTML`);
    assert.ok(!/Cannot (GET|POST)/.test(text), `${path} no debe devolver el 404 de Express`);
  }
});

// ---------------------------------------------------------------
// Taxonomía: unitarias del módulo
// ---------------------------------------------------------------

test("describeClientError traduce los tipos de body-parser y deja pasar lo demás", () => {
  assert.equal(
    describeClientError({ type: "entity.too.large", status: 413 }).code,
    "PAYLOAD_TOO_LARGE"
  );
  assert.equal(
    describeClientError({ type: "entity.parse.failed", status: 400 }).code,
    "INVALID_JSON"
  );
  assert.equal(describeClientError({ type: "desconocido", status: 400 }), null);
  assert.equal(describeClientError(new Error("error de aplicación")), null);
  assert.equal(describeClientError(undefined), null);
  assert.equal(describeClientError(null), null);
});

test("isStorageUnavailable reconoce los fallos de almacenamiento", () => {
  assert.equal(isStorageUnavailable({ name: "MongooseError" }), true);
  assert.equal(isStorageUnavailable({ name: "MongoServerSelectionError" }), true);
  assert.equal(isStorageUnavailable({ code: "ECONNREFUSED" }), true);
  assert.equal(isStorageUnavailable({ name: "ValidationError" }), false);
  assert.equal(isStorageUnavailable(new Error("normal")), false);
  assert.equal(isStorageUnavailable(undefined), false);
});

test("POST /api/auth/refresh responde 503 cuando no hay almacenamiento", async () => {
  // El token no está vacío, así que la validación del contrato pasa y el
  // flujo llega a la consulta: sin base de datos debe ser 503 (servicio no
  // disponible), no 401 (cerraría una sesión que quizá sigue siendo válida)
  // ni 500 (fallo del programa).
  const { status, data } = await request(
    "/api/auth/refresh",
    json({ refreshToken: "krt_token_que_no_existe_en_ninguna_base" })
  );

  assert.equal(status, 503);
  assert.equal(data.code, "AUTH_STORAGE_UNAVAILABLE");
});

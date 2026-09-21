const test = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-block-009-015-contract-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { parseSearchQuery, escapeRegex, SCOPES } = require("../src/modules/search/search.routes");
const User = require("../src/modules/users/User");
const { buildImagePrompt } = require("../src/modules/image-ai/image.service");
const { signSessionToken } = require("../src/modules/auth/session.service");
const { safeRequestId } = require("../src/middleware/requestContext");
const { server, io } = require("../src/server");

let baseUrl;

async function request(path, { method = "GET" } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data, requestId: response.headers.get("x-request-id") };
}

test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

test("009: parser de búsqueda limita entrada, scope y regex literal", () => {
  assert.deepStrictEqual(SCOPES, ["all", "users", "posts"]);
  assert.strictEqual(escapeRegex("a+b?"), "a\\+b\\?");
  assert.strictEqual(parseSearchQuery({ q: "a" }).code, "QUERY_TOO_SHORT");
  assert.strictEqual(parseSearchQuery({ q: "kronos", scope: "media" }).code, "INVALID_SCOPE");
  const parsed = parseSearchQuery({ q: "kronos+ai", scope: "posts", page: "2", limit: "999" });
  assert.strictEqual(parsed.scope, "posts");
  assert.strictEqual(parsed.skip, 30);
  assert.strictEqual(parsed.limit, 30);
  assert.ok(parsed.regex.test("Kronos+AI"));
  assert.ok(!parsed.regex.test("KronosssAI"));
});

test("010: controles de imagen se incorporan en el prompt sin perder el original", () => {
  const prompt = buildImagePrompt({
    prompt: "Ciudad nocturna",
    negativePrompt: "texto, marcas de agua",
    style: "editorial"
  });
  assert.match(prompt, /Estilo visual: editorial/);
  assert.match(prompt, /Ciudad nocturna/);
  assert.match(prompt, /Evita: texto, marcas de agua/);
});

test("011: access token nuevo queda asociado a la familia del dispositivo", () => {
  const user = { _id: new mongoose.Types.ObjectId(), username: "kronos" };
  const session = signSessionToken(user, { sessionId: new mongoose.Types.ObjectId().toString() });
  const payload = jwt.decode(session.token);
  assert.strictEqual(payload.id, String(user._id));
  assert.ok(payload.sid);
  assert.ok(payload.jti);
});

test("015: las preferencias del feed persisten modo e intereses normalizados", () => {
  const mode = User.schema.path("preferences.feed.mode");
  const interests = User.schema.path("preferences.feed.interests");
  assert.deepStrictEqual(mode.enumValues, ["latest", "following", "interests"]);
  assert.equal(interests.instance, "Array");
  assert.equal(interests.validators[0].validator([]), true);
  assert.equal(interests.validators[0].validator(Array.from({ length: 21 }, () => "arte")), false);
});

test("015: request id entrante se valida y salud/rutas nuevas no omiten autenticación", async () => {
  assert.strictEqual(safeRequestId("valid-request_42"), "valid-request_42");
  assert.notStrictEqual(safeRequestId("<invalid>"), "<invalid>");

  const health = await request("/health");
  assert.strictEqual(health.status, 503);
  assert.ok(health.requestId);

  for (const path of ["/api/search?q=kronos", "/api/admin/overview", "/api/observability/summary", "/api/auth/sessions"]) {
    const response = await request(path);
    assert.strictEqual(response.status, 401, path);
    assert.ok(response.requestId, path);
  }
});

const test = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-block-009-015-contract-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { parseSearchQuery, SCOPES } = require("../src/modules/search/search.routes");
const { escapeRegex } = require("../src/utils/queryHelpers");
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

// ---------------------------------------------------------------
// 029 — perfil y cuenta (bloque 1.6): apariencia persistida y cambio de
// contraseña, incluidas las cuentas que entraron con Google.
// ---------------------------------------------------------------

const { evaluatePasswordChange, MIN_LENGTH } = require("../src/modules/users/passwordPolicy");

test("029: la apariencia es una preferencia real del esquema", () => {
  const appearance = User.schema.path("preferences.appearance");
  assert.ok(appearance, "preferences.appearance debe existir en el esquema");
  assert.deepStrictEqual(appearance.enumValues, ["light", "dark", "system"]);
  // Oscuro por defecto: el tema de marca no cambia para quien no elige.
  assert.strictEqual(appearance.defaultValue, "dark");

  const source = require("node:fs").readFileSync(
    require.resolve("../src/modules/users/users.routes.js"),
    "utf8"
  );
  // Y se puede escribir por la ruta de preferencias, con validación de valores.
  assert.match(source, /appearance: \["light", "dark", "system"\]/);
  assert.match(source, /\["appearance", body\.appearance\]/);
});

test("029: las reglas de contraseña cubren los casos que importan", () => {
  assert.equal(MIN_LENGTH, 8);

  const base = { hasPassword: true, currentPassword: "actual-123", confirmPassword: "nueva-1234" };

  assert.strictEqual(evaluatePasswordChange({ ...base, newPassword: "" }).code, "PASSWORD_REQUIRED");
  assert.strictEqual(evaluatePasswordChange({ ...base, newPassword: "corta" }).code, "PASSWORD_TOO_SHORT");
  assert.strictEqual(
    evaluatePasswordChange({ ...base, newPassword: "nueva-1234", confirmPassword: "otra-1234" }).code,
    "PASSWORD_MISMATCH"
  );
  assert.strictEqual(
    evaluatePasswordChange({ ...base, currentPassword: "", newPassword: "nueva-1234" }).code,
    "CURRENT_PASSWORD_REQUIRED"
  );
  assert.strictEqual(
    evaluatePasswordChange({ ...base, currentPassword: "misma-123", newPassword: "misma-123", confirmPassword: "misma-123" }).code,
    "PASSWORD_UNCHANGED"
  );

  // bcrypt ignora más de 72 bytes: la contraseña se rechaza, no se trunca.
  assert.strictEqual(
    evaluatePasswordChange({ ...base, newPassword: "a".repeat(80), confirmPassword: "a".repeat(80) }).code,
    "PASSWORD_TOO_LONG"
  );

  assert.strictEqual(evaluatePasswordChange({ ...base, newPassword: "nueva-1234" }).ok, true);
});

test("029: una cuenta sin contraseña (Google) puede crear la primera", () => {
  const created = evaluatePasswordChange({
    hasPassword: false,
    currentPassword: "",
    newPassword: "primera-clave",
    confirmPassword: "primera-clave"
  });

  assert.strictEqual(created.ok, true);
  assert.strictEqual(created.newPassword, "primera-clave");

  // Y sigue validando el resto de reglas.
  assert.strictEqual(
    evaluatePasswordChange({ hasPassword: false, newPassword: "corta", confirmPassword: "corta" }).code,
    "PASSWORD_TOO_SHORT"
  );
});

test("029: la ruta de contraseña existe, exige sesión y revoca las demás sesiones", async () => {
  const withoutSession = await request("/api/users/me/password", { method: "PATCH" });
  assert.strictEqual(withoutSession.status, 401);

  // `PATCH /users/me` sigue siendo la vía de nombre y biografía, y ahora el
  // cliente la llama desde el perfil.
  const profileUpdate = await request("/api/users/me", { method: "PATCH" });
  assert.strictEqual(profileUpdate.status, 401);

  const source = require("node:fs").readFileSync(
    require.resolve("../src/modules/users/users.routes.js"),
    "utf8"
  );
  assert.match(source, /router\.patch\("\/me\/password", auth, requireUser/);
  assert.match(source, /revokeUserRefreshTokens\(req\.user\.id, "password-changed"\)/);
});

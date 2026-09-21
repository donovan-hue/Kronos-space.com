const test = require("node:test");
const assert = require("node:assert/strict");

const { getFeatureFlags, isFeatureEnabled, DEFAULT_FLAGS } = require("../src/config/featureFlags");

test("los flags tienen defaults encendidos y solo se declaran una vez", () => {
  assert.ok(DEFAULT_FLAGS.capsules);
  assert.ok(DEFAULT_FLAGS.pulse);
  assert.ok(DEFAULT_FLAGS.analytics);
  assert.deepEqual(getFeatureFlags({}), DEFAULT_FLAGS, "sin overrides el default manda");
});

test("FEATURE_FLAG_<NOMBRE> apaga o prende solo lo que existe", () => {
  assert.equal(isFeatureEnabled("pulse", { FEATURE_FLAG_PULSE: "false" }), false);
  assert.equal(isFeatureEnabled("pulse", { FEATURE_FLAG_PULSE: "true" }), true);
  assert.equal(isFeatureEnabled("pulse", { FEATURE_FLAG_ANALYTICS: "false" }), true, "un flag no toca al otro");
  assert.equal(isFeatureEnabled("desconocido", { FEATURE_FLAG_DESCONOCIDO: "false" }), false, "flags no declarados no existen");
  assert.equal(isFeatureEnabled("pulse", { FEATURE_FLAG_PULSE: "basura" }), true, "valor inválido cae en el default");
});

test("el endpoint público /api/flags está montado junto a /api/health", () => {
  const source = require("fs").readFileSync(
    require("path").join(__dirname, "..", "src", "server.js"),
    "utf8"
  );
  assert.match(source, /app\.get\("\/api\/flags"/);
  // Pública por diseño: sin middleware de autenticación en esa línea.
  const line = source.split("\n").find((entry) => entry.includes('app.get("/api/flags"'));
  assert.doesNotMatch(line, /auth/);
});

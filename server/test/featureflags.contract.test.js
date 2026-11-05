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
  assert.equal(
    isFeatureEnabled("aiComposer", { FEATURE_FLAG_AI_COMPOSER: "false" }),
    false,
    "el nombre con guion bajo encuentra la clave camelCase"
  );
  assert.equal(
    isFeatureEnabled("aiComposer", { FEATURE_FLAG_AICOMPOSER: "false" }),
    false,
    "el nombre en mayúsculas también encuentra aiComposer"
  );
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

/* ============================================================
   2.5 — los flags apagan la función en el servidor, no solo el menú
   ============================================================ */

const requireFeatureFlag = require("../src/middleware/featureFlag");

/** Middleware con respuesta simulada: mide la decisión, no Express. */
function ejecutarGuarda(nombre, env) {
  const original = { ...process.env };
  for (const clave of Object.keys(process.env)) {
    if (clave.startsWith("FEATURE_FLAG_")) delete process.env[clave];
  }
  Object.assign(process.env, env || {});

  const respuesta = {
    codigo: null,
    body: null,
    status(codigo) { this.codigo = codigo; return this; },
    json(payload) { this.body = payload; return this; }
  };
  let siguiente = false;

  try {
    requireFeatureFlag(nombre)({}, respuesta, () => { siguiente = true; });
  } finally {
    for (const clave of Object.keys(process.env)) {
      if (clave.startsWith("FEATURE_FLAG_")) delete process.env[clave];
    }
    Object.assign(process.env, original);
  }

  return { siguiente, respuesta };
}

test("2.5: un flag apagado responde 404 con código propio, uno encendido deja pasar", () => {
  const encendido = ejecutarGuarda("capsules", {});
  assert.equal(encendido.siguiente, true, "por defecto el flag está encendido");

  const apagado = ejecutarGuarda("capsules", { FEATURE_FLAG_CAPSULES: "false" });
  assert.equal(apagado.siguiente, false, "apagado no debe llegar al router");
  assert.equal(apagado.respuesta.codigo, 404, "una función apagada no existe: 404, no 403");
  assert.equal(apagado.respuesta.body.code, "FEATURE_DISABLED");
  assert.equal(apagado.respuesta.body.flag, "capsules");
});

test("2.5: un flag con typo revienta al construir la guarda, no apaga el módulo en silencio", () => {
  // `isFeatureEnabled` devuelve false para nombres desconocidos: sin esta
  // comprobación, `requireFeatureFlag("capsule")` apagaría cápsulas para
  // siempre y nadie lo notaría hasta producción.
  assert.throws(() => requireFeatureFlag("capsule"), /FEATURE_FLAG_UNKNOWN/);
  assert.throws(() => requireFeatureFlag(""), /FEATURE_FLAG_UNKNOWN/);
});

test("2.5: cada módulo con flag declarado monta su guarda en el servidor", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.join(__dirname, "..", "..");
  const registro = fs.readFileSync(path.join(raiz, "server/src/http/registerRoutes.js"), "utf8");

  // Los tres módulos con router propio.
  assert.match(registro, /app\.use\("\/api\/capsules", abuseLimiter, flag\(MODULE_FLAGS\.capsules\)/);
  assert.match(registro, /app\.use\("\/api\/pulse", abuseLimiter, flag\(MODULE_FLAGS\.pulse\)/);
  assert.match(registro, /app\.use\("\/api\/analytics", abuseLimiter, flag\(MODULE_FLAGS\.analytics\)/);

  // `archive` vive dentro de stories y `aiComposer` dentro de ai/chat: sus
  // guardas están en la ruta concreta, no en el montaje del módulo.
  const historias = fs.readFileSync(path.join(raiz, "server/src/modules/stories/stories.routes.js"), "utf8");
  assert.match(historias, /router\.get\("\/me\/archive", auth, requireUser, requireFeatureFlag\("archive"\)/);

  const chat = fs.readFileSync(path.join(raiz, "server/src/modules/ai-core/routes/chat.routes.js"), "utf8");
  assert.match(chat, /isFeatureEnabled\("aiComposer"\)/);
  assert.match(chat, /code: "FEATURE_DISABLED",\s*\n\s*flag: "aiComposer"/);
  // El chat con hilo no se apaga con el flag del compositor.
  assert.match(chat, /if \(!req\.body\?\.conversationId && !isAiComposerEnabled\(\)\)/);

  // Ningún flag declarado se queda sin guarda: el contrato es que todos los
  // nombres de DEFAULT_FLAGS aparezcan en una guarda del servidor.
  const { DEFAULT_FLAGS } = require("../src/config/featureFlags");
  const codigo = [
    registro,
    historias,
    chat,
    fs.readFileSync(path.join(raiz, "server/src/modules/capsules/capsules.routes.js"), "utf8")
  ].join("\n");

  const publicaciones = fs.readFileSync(path.join(raiz, "server/src/modules/posts/posts.routes.js"), "utf8");
  assert.match(publicaciones, /router\.get\("\/vertical", auth, requireUser, requireFeatureFlag\("vertical"\)/);

  const todo = `${codigo}\n${publicaciones}`;
  const sinGuarda = Object.keys(DEFAULT_FLAGS).filter((nombre) => !todo.includes(`"${nombre}"`));

  assert.deepEqual(sinGuarda, [], `flags declarados sin guarda en el servidor: ${sinGuarda.join(", ")}`);
});

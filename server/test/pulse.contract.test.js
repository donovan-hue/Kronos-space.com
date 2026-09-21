const test = require("node:test");
const assert = require("node:assert/strict");

const SeenPost = require("../src/modules/pulse/SeenPost");
const FeedSignal = require("../src/modules/pulse/FeedSignal");
const pulseRoutes = require("../src/modules/pulse/pulse.routes");
const { DEFAULT_SESSION, MAX_SESSION } = pulseRoutes;

function routePaths() {
  return (pulseRoutes.stack || []).map((layer) => layer.route?.path).filter(Boolean);
}

test("registro de visto y señales persisten con unicidad por usuario", () => {
  const seenIndexes = SeenPost.schema.indexes();
  assert.ok(seenIndexes.some(([fields]) => fields.user === 1 && fields.post === 1));
  assert.equal(SeenPost.schema.path("post").options.ref, "Post");

  assert.deepEqual(FeedSignal.schema.path("direction").enumValues, ["more", "less"]);
  const signalIndexes = FeedSignal.schema.indexes();
  assert.ok(signalIndexes.some(([fields]) => fields.user === 1 && fields.tag === 1));
  assert.equal(FeedSignal.schema.path("tag").options.lowercase, true);
});

test("la sesión de Pulso es finita y acotada", () => {
  assert.equal(DEFAULT_SESSION, 8);
  assert.equal(MAX_SESSION, 20);
});

test("rutas de Pulso cubren sesión, visto, señales y transparencia", () => {
  assert.deepEqual(routePaths(), ["/", "/seen/:postId", "/signal", "/signals"]);
  for (const layer of pulseRoutes.stack.filter((item) => item.route)) {
    assert.ok(layer.route.stack.length >= 3, `la ruta ${layer.route.path} debe exigir auth y usuario`);
  }
});

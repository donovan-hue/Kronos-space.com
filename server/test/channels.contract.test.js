const test = require("node:test");
const assert = require("node:assert/strict");

const Channel = require("../src/modules/channels/Channel");
const ChannelMessage = require("../src/modules/channels/ChannelMessage");
const channelsRouter = require("../src/modules/channels/channels.routes");

function routePaths() {
  return (channelsRouter.stack || []).map((layer) => layer.route?.path).filter(Boolean);
}

test("canales persisten órbita, responsable, tipo y suscriptores sin mezclar mensajes", () => {
  assert.equal(Channel.schema.path("orbit").options.ref, "Orbit");
  assert.equal(Channel.schema.path("owner").options.ref, "User");
  assert.equal(Channel.schema.path("name").options.maxlength, 80);
  assert.deepEqual(Channel.schema.path("type").enumValues, ["announcement", "discussion"]);
  assert.equal(Channel.schema.path("subscribers").instance, "Array");
  assert.equal(ChannelMessage.schema.path("channel").options.ref, "Channel");
  assert.equal(ChannelMessage.schema.path("text").options.maxlength, 2000);
});

test("parser de canales limita nombre, descripción y modalidad", () => {
  const { parseChannelPayload } = channelsRouter;
  assert.equal(parseChannelPayload({ orbitId: "bad", name: "Avisos", type: "announcement" }).error, "Órbita inválida");
  assert.equal(parseChannelPayload({ orbitId: "65f000000000000000000001", name: "Avisos", type: "announcement" }).name, "Avisos");
  assert.equal(parseChannelPayload({ orbitId: "65f000000000000000000001", name: "Avisos", type: "other" }).error, "Tipo de canal no válido");
  assert.match(parseChannelPayload({ orbitId: "65f000000000000000000001", name: "x".repeat(81), type: "discussion" }).error, /80/);
});

test("rutas de canales exponen creación, suscripción, lectura y publicación", () => {
  assert.deepEqual(routePaths(), [
    "/",
    "/",
    "/:channelId",
    "/:channelId/subscribe",
    "/:channelId/subscribe",
    "/:channelId/messages",
    "/:channelId/messages"
  ]);
  for (const layer of channelsRouter.stack.filter((item) => item.route)) {
    assert.ok(layer.route.stack.length >= 3, `la ruta ${layer.route.path} debe exigir auth y usuario`);
  }
});

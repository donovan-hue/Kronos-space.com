const test = require("node:test");
const assert = require("node:assert/strict");

const Capsule = require("../src/modules/capsules/Capsule");
const capsulesRouter = require("../src/modules/capsules/capsules.routes");
const { encryptText, decryptText } = require("../src/modules/capsules/capsule.crypto");

function routePaths() {
  return (capsulesRouter.stack || []).map((layer) => layer.route?.path).filter(Boolean);
}

test("cápsulas persisten estados, cifrado obligatorio y colaboradores acotados", () => {
  assert.equal(Capsule.schema.path("owner").options.ref, "User");
  assert.equal(Capsule.schema.path("title").options.maxlength, 160);
  assert.equal(Capsule.schema.path("opensAt").options.required, true);
  assert.deepEqual(Capsule.schema.path("state").enumValues, ["draft", "scheduled", "opened", "cancelled"]);
  assert.equal(Capsule.schema.path("messages.cipherText").options.required, true);
  assert.equal(Capsule.schema.path("messages.iv").options.required, true);
  assert.equal(Capsule.schema.path("messages.authTag").options.required, true);
  assert.equal(Capsule.schema.path("messages.text"), undefined, "el texto plano jamás se persiste");
  assert.equal(Capsule.schema.path("contributors").instance, "Array");
  assert.ok(Capsule.schema.indexes().some(([fields]) => fields.state === 1 && fields.opensAt === 1));
});

test("el cifrado es reversible pero el documento nunca guarda texto plano", () => {
  process.env.CAPSULE_SECRET = process.env.CAPSULE_SECRET || "kronos-capsule-contract-secret";
  const secret = "Carta para el yo del futuro";
  const sealed = encryptText(secret);
  assert.notEqual(sealed.cipherText, secret);
  assert.ok(!JSON.stringify(sealed).includes(secret), "el secreto no puede aparecer en el documento");
  assert.equal(decryptText(sealed), secret);

  const tampered = { ...sealed, cipherText: Buffer.from("otra cosa").toString("base64") };
  assert.throws(() => decryptText(tampered), "un cipherText alterado debe fallar el authTag");
});

test("parser de cápsulas exige título, fecha futura y zona horaria real", () => {
  const { parseCapsulePayload } = capsulesRouter;
  assert.match(parseCapsulePayload({ title: "" }).error, /título/);
  assert.match(parseCapsulePayload({ title: "Cápsula", opensAt: "no-fecha" }).error, /fecha de apertura/);
  assert.match(parseCapsulePayload({ title: "Cápsula", opensAt: "2000-01-01T00:00:00Z" }).error, /futuro/);
  assert.match(parseCapsulePayload({ title: "Cápsula", opensAt: "2099-01-01T00:00:00Z", timezone: "Marte/Olympus" }).error, /Zona horaria/);

  const parsed = parseCapsulePayload({
    title: "Carta 2030",
    opensAt: "2099-01-01T00:00:00Z",
    timezone: "America/Mexico_City",
    message: "Hola futuro"
  });
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.timezone, "America/Mexico_City");
  assert.equal(parsed.message, "Hola futuro");
});

test("rutas de cápsulas cubren ciclo completo con autenticación", () => {
  assert.deepEqual(routePaths(), [
    "/",
    "/",
    "/:capsuleId",
    "/:capsuleId/seal",
    "/:capsuleId/cancel",
    "/:capsuleId/messages",
    "/:capsuleId/invite",
    "/:capsuleId"
  ]);
  for (const layer of capsulesRouter.stack.filter((item) => item.route)) {
    assert.ok(layer.route.stack.length >= 3, `la ruta ${layer.route.path} debe exigir auth y usuario`);
  }
});

test("la cápsula normalizada nunca expone el criptograma", () => {
  const capsule = {
    _id: "cap-1",
    owner: { _id: "u1", username: "ana", displayName: "Ana", avatar: "" },
    title: "Carta",
    opensAt: new Date(Date.now() + 86400000),
    timezone: "UTC",
    state: "draft",
    contributors: [],
    messages: [{ author: "u1", cipherText: "AAAA", iv: "BBBB", authTag: "CCCC", createdAt: new Date() }],
    createdAt: new Date()
  };
  const normalized = capsulesRouter.normalizeCapsule(capsule, "u1");
  assert.ok(!JSON.stringify(normalized).includes("cipherText"), "el criptograma no puede viajar");
  // En draft la dueña ve el mensaje (descifrado por las rutas; aquí el
  // contrato verifica posición y permisos, no el descifrado).
  assert.equal(normalized.messages.length, 1);
  assert.equal(normalized.canSeal, true);

  const scheduled = capsulesRouter.normalizeCapsule({ ...capsule, state: "scheduled" }, "u1");
  assert.deepEqual(scheduled.messages, [], "sellada: los mensajes no viajan");
  assert.equal(scheduled.canCancel, true);
  assert.ok(scheduled.msUntilOpen >= 0);
});

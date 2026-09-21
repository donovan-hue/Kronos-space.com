const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const Circle = require("../src/modules/circles/Circle");
const circlesRouter = require("../src/modules/circles/circles.routes");
const { normalizeAudience } = require("../src/modules/posts/audience.service");

const circleId = new mongoose.Types.ObjectId();

let server;
let baseUrl;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/circles", circlesRouter);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

test("Círculos: el modelo persiste propietario, descripción y miembros", () => {
  assert.equal(Circle.schema.path("owner").options.ref, "User");
  assert.equal(Circle.schema.path("owner").options.required, true);
  assert.equal(Circle.schema.path("name").options.maxlength, 80);
  assert.equal(Circle.schema.path("description").options.maxlength, 300);
  assert.equal(Circle.schema.path("members").instance, "Array");
  assert.ok(Circle.schema.indexes().some(([fields]) => fields.owner === 1 && fields.name === 1));
});

test("Círculos: la audiencia exige un círculo válido y conserva su referencia", () => {
  assert.deepEqual(normalizeAudience({ type: "circle", circleId: circleId.toString() }), {
    type: "circle",
    circleId: circleId.toString()
  });
  assert.equal(normalizeAudience({ type: "circle", circleId: "not-an-id" }), null);
});

test("Círculos: todas las operaciones requieren autenticación", async () => {
  const responses = await Promise.all([
    fetch(`${baseUrl}/circles`),
    fetch(`${baseUrl}/circles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Privado" })
    }),
    fetch(`${baseUrl}/circles/${circleId}`, { method: "PATCH" }),
    fetch(`${baseUrl}/circles/${circleId}`, { method: "DELETE" }),
    fetch(`${baseUrl}/circles/${circleId}/members`),
    fetch(`${baseUrl}/circles/${circleId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: new mongoose.Types.ObjectId().toString() })
    })
  ]);
  assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 401, 401, 401]);
});

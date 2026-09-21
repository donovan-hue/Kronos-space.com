const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const Orbit = require("../src/modules/orbits/Orbit");
const orbitsRouter = require("../src/modules/orbits/orbits.routes");
const { normalizeAudience } = require("../src/modules/posts/audience.service");

const orbitId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
let server;
let baseUrl;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/orbits", orbitsRouter);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

test("Órbitas: el modelo persiste comunidad, reglas, visibilidad, duración y roles", () => {
  assert.equal(Orbit.schema.path("owner").options.ref, "User");
  assert.equal(Orbit.schema.path("owner").options.required, true);
  assert.equal(Orbit.schema.path("name").options.maxlength, 80);
  assert.equal(Orbit.schema.path("description").options.maxlength, 500);
  assert.equal(Orbit.schema.path("rules").instance, "Array");
  assert.deepEqual(Orbit.schema.path("visibility").enumValues, ["public", "private"]);
  assert.equal(Orbit.schema.path("members").schema.path("role").enumValues.join(","), "owner,moderator,member");
  assert.ok(Orbit.schema.indexes().some(([fields]) => fields.owner === 1 && fields.name === 1));
});

test("Órbitas: la audiencia normaliza una referencia propia y rechaza IDs inválidos", () => {
  assert.deepEqual(normalizeAudience({ type: "orbit", orbitId: orbitId.toString() }), {
    type: "orbit",
    orbitId: orbitId.toString()
  });
  assert.equal(normalizeAudience({ type: "orbit", orbitId: "invalid" }), null);
});

test("Órbitas: listar, crear, editar, borrar y membresías requieren autenticación", async () => {
  const memberPath = `${baseUrl}/orbits/${orbitId}/members/${userId}`;
  const responses = await Promise.all([
    fetch(`${baseUrl}/orbits`),
    fetch(`${baseUrl}/orbits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Comunidad" }) }),
    fetch(`${baseUrl}/orbits/${orbitId}`),
    fetch(`${baseUrl}/orbits/${orbitId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Editada" }) }),
    fetch(`${baseUrl}/orbits/${orbitId}`, { method: "DELETE" }),
    fetch(`${baseUrl}/orbits/${orbitId}/join`, { method: "POST" }),
    fetch(`${baseUrl}/orbits/${orbitId}/leave`, { method: "POST" }),
    fetch(`${baseUrl}/orbits/${orbitId}/members`),
    fetch(`${baseUrl}/orbits/${orbitId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: userId.toString() }) }),
    fetch(memberPath, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "moderator" }) }),
    fetch(memberPath, { method: "DELETE" })
  ]);
  assert.deepEqual(responses.map((response) => response.status), Array(11).fill(401));
});

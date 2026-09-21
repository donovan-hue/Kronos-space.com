const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const Draft = require("../src/modules/drafts/Draft");
const draftsRouter = require("../src/modules/drafts/drafts.routes");

test("014: los borradores pertenecen a un autor y mantienen el límite persistido de 50", () => {
  const authorPath = Draft.schema.path("author");
  const contentPath = Draft.schema.path("content");
  const mediaItemsPath = Draft.schema.path("mediaItems");

  assert.equal(authorPath.options.ref, "User");
  assert.equal(authorPath.options.required, true);
  assert.equal(contentPath.options.maxlength, 5000);
  assert.equal(mediaItemsPath.instance, "Array");
  assert.equal(mediaItemsPath.caster.schema.path("url").options.maxlength, 2000);
  assert.equal(mediaItemsPath.validators[0].validator([]), true);
  assert.equal(mediaItemsPath.validators[0].validator(Array.from({ length: 5 }, () => ({ url: "x" }))), false);
  assert.ok(Draft.schema.indexes().some(([fields]) => fields.author === 1 && fields.updatedAt === -1));
});

test("014: listar, crear, editar y eliminar borradores requieren autenticación", async () => {
  const app = express();
  app.use(express.json());
  app.use("/drafts", draftsRouter);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const draftId = new mongoose.Types.ObjectId().toString();

  try {
    const responses = await Promise.all([
      fetch(`${baseUrl}/drafts`),
      fetch(`${baseUrl}/drafts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "Borrador" }) }),
      fetch(`${baseUrl}/drafts/${draftId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "Editado" }) }),
      fetch(`${baseUrl}/drafts/${draftId}`, { method: "DELETE" })
    ]);
    assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 401]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

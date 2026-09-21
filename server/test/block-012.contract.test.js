const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const SavedCollection = require("../src/modules/collections/SavedCollection");
const collectionsRouter = require("../src/modules/collections/collections.routes");

test("012: el modelo de colecciones conserva propiedad, límites y unicidad por usuario", () => {
  const ownerPath = SavedCollection.schema.path("owner");
  const namePath = SavedCollection.schema.path("name");
  const descriptionPath = SavedCollection.schema.path("description");
  const postsPath = SavedCollection.schema.path("posts");

  assert.equal(ownerPath.options.ref, "User");
  assert.equal(ownerPath.options.required, true);
  assert.equal(namePath.options.maxlength, 80);
  assert.equal(descriptionPath.options.maxlength, 300);
  assert.equal(postsPath.instance, "Array");
  assert.equal(postsPath.caster.instance, "ObjectId");
  assert.ok(SavedCollection.schema.indexes().some(([fields, options]) => fields.owner === 1 && fields.name === 1 && options.unique));
});

test("012: todas las operaciones de colecciones exigen sesión antes de consultar MongoDB", async () => {
  const app = express();
  app.use(express.json());
  app.use("/collections", collectionsRouter);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const collectionId = new mongoose.Types.ObjectId().toString();
  const postId = new mongoose.Types.ObjectId().toString();

  try {
    const requests = [
      fetch(`${baseUrl}/collections`),
      fetch(`${baseUrl}/collections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Privadas" }) }),
      fetch(`${baseUrl}/collections/${collectionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Renombrada" }) }),
      fetch(`${baseUrl}/collections/${collectionId}`, { method: "DELETE" }),
      fetch(`${baseUrl}/collections/${collectionId}/posts`),
      fetch(`${baseUrl}/collections/${collectionId}/posts/${postId}`, { method: "POST" }),
      fetch(`${baseUrl}/collections/${collectionId}/posts/${postId}`, { method: "DELETE" })
    ];
    const responses = await Promise.all(requests);
    assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 401, 401, 401, 401]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

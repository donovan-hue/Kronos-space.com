const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("media ACL resolves the ImageGeneration model from image-ai", () => {
  const middlewarePath = path.join(__dirname, "../src/middleware/mediaAcl.js");
  const modelPath = path.join(__dirname, "../src/modules/image-ai/ImageGeneration.js");
  const source = fs.readFileSync(middlewarePath, "utf8");

  assert.equal(fs.existsSync(modelPath), true, "el modelo ImageGeneration debe existir en image-ai");
  assert.doesNotThrow(
    () => require.resolve("../src/modules/image-ai/ImageGeneration"),
    "la ruta del modelo debe poder resolverse desde la suite de servidor"
  );
  assert.match(
    source,
    /require\(["']\.\.\/modules\/image-ai\/ImageGeneration["']\)/,
    "mediaAcl debe importar el modelo desde modules/image-ai"
  );
  assert.doesNotMatch(
    source,
    /require\(["']\.\.\/modules\/image\/ImageGeneration["']\)/,
    "mediaAcl no debe usar la ruta inexistente modules/image"
  );
});

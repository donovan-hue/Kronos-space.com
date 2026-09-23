const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");

/**
 * KRONOS-UI-025…030 — contratos sin base de datos.
 * La persistencia real depende de MongoDB Atlas/CI; aquí se verifican
 * validaciones puras, estados y montaje de rutas protegidas.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-block-025-030-contract-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");
const { normalizeControls, readProviderResult } = require("../src/modules/video-ai/video.service");
const {
  detectImageMime,
  assertSafeProviderUrl,
  MAX_IMAGE_BYTES,
  IMAGE_PROVIDER_TIMEOUT_MS
} = require("../src/modules/image-ai/image.service");
const VideoGeneration = require("../src/modules/video-ai/VideoGeneration");
const ImageGeneration = require("../src/modules/image-ai/ImageGeneration");
const Post = require("../src/modules/posts/Post");

let baseUrl;

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`);
  let data = null;
  try { data = await response.json(); } catch { /* respuesta vacía */ }
  return { status: response.status, data };
}

test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

test("025/026: búsqueda global y rutas de Kairos exigen autenticación", async () => {
  const paths = [
    "/api/search?q=kronos",
    "/api/ai/images/history",
    "/api/ai/videos/history",
    "/api/ai/scripts/history"
  ];

  for (const path of paths) {
    const response = await request(path);
    assert.strictEqual(response.status, 401, `${path} debe exigir sesión`);
  }
});

test("027: el modelo de imagen conserva controles creativos y resultados acotados", async () => {
  assert.ok(ImageGeneration.schema.path("negativePrompt"));
  assert.ok(ImageGeneration.schema.path("style"));
  assert.strictEqual(ImageGeneration.schema.path("negativePrompt").options.maxlength, 2000);
  assert.strictEqual(ImageGeneration.schema.path("style").options.maxlength, 80);
  assert.strictEqual(ImageGeneration.schema.path("imageUrl").options.maxlength, 2000);
  assert.equal(IMAGE_PROVIDER_TIMEOUT_MS, 45000);
  assert.equal(MAX_IMAGE_BYTES, 10 * 1024 * 1024);

  assert.equal(detectImageMime(Buffer.from("iVBORw0KGgo=", "base64")), "image/png");
  assert.equal(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00])), "image/jpeg");
  assert.equal(detectImageMime(Buffer.from("not-an-image")), "");
  await assert.rejects(
    () => assertSafeProviderUrl(new URL("https://127.0.0.1/result.png")),
    /IMAGE_RESULT_INVALID/
  );
  await assert.rejects(
    () => assertSafeProviderUrl(new URL("http://cdn.example.com/result.png")),
    /IMAGE_RESULT_INVALID/
  );
});

test("028: un job de video acepta estados reales y normaliza respuesta del proveedor", () => {
  assert.deepStrictEqual(normalizeControls({ prompt: "  cámara orbital  ", negativePrompt: "  blur ", style: "  sci-fi " }), {
    prompt: "cámara orbital",
    negativePrompt: "blur",
    style: "sci-fi"
  });
  assert.throws(() => normalizeControls({ prompt: "" }), /INVALID_VIDEO_PROMPT/);
  assert.deepStrictEqual(readProviderResult({ id: "job-1", status: "processing", progress: 42 }), {
    providerJobId: "job-1",
    videoUrl: "",
    status: "processing",
    progress: 42
  });
  assert.deepStrictEqual(readProviderResult({ id: "job-1", status: "succeeded", url: "https://cdn.test/video.mp4" }), {
    providerJobId: "job-1",
    videoUrl: "https://cdn.test/video.mp4",
    status: "completed",
    progress: 100
  });
  assert.ok(VideoGeneration.schema.path("providerJobId"));
  assert.ok(VideoGeneration.schema.path("progress"));
});

test("029: el modelo de publicación permite publicar un resultado de video", () => {
  assert.ok(Post.schema.path("media.type").enumValues.includes("video"));
});

test("030: las rutas de historial y sus acciones están montadas", async () => {
  const paths = [
    ["/api/ai/images/507f1f77bcf86cd799439011", "DELETE"],
    ["/api/ai/videos/507f1f77bcf86cd799439011", "DELETE"],
    ["/api/ai/videos/507f1f77bcf86cd799439011/status", "GET"],
    ["/api/ai/scripts/507f1f77bcf86cd799439011", "DELETE"],
    ["/api/ai/scripts/projects/507f1f77bcf86cd799439011", "DELETE"]
  ];

  for (const [path, method] of paths) {
    const response = await fetch(`${baseUrl}${path}`, { method });
    assert.strictEqual(response.status, 401, `${method} ${path} debe exigir sesión`);
  }
});

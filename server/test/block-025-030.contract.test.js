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

/* ------------------------------------------------------------------ */
/* 2.3 — el video generado se guarda en almacén propio                */
/* ------------------------------------------------------------------ */

const {
  detectVideoMime,
  ensureVideoBuffer,
  isStoredUrl,
  persistProviderVideo,
  MAX_VIDEO_BYTES
} = require("../src/modules/video-ai/video.storage");

/** MP4 mínimo: caja `ftyp` con brand `isom` + relleno. */
function fakeMp4(bytes = 32) {
  const buffer = Buffer.alloc(bytes, 0);
  buffer.writeUInt32BE(bytes - 8, 0);
  buffer.write("ftyp", 4, "ascii");
  buffer.write("isom", 8, "ascii");
  return buffer;
}

test("2.3: el formato del video se valida por firma, no por la URL", () => {
  assert.equal(detectVideoMime(fakeMp4()), "video/mp4");

  const mov = Buffer.alloc(32, 0);
  mov.writeUInt32BE(24, 0);
  mov.write("ftyp", 4, "ascii");
  mov.write("qt  ", 8, "ascii");
  assert.equal(detectVideoMime(mov), "video/quicktime");

  const webm = Buffer.alloc(32, 0);
  webm.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  assert.equal(detectVideoMime(webm), "video/webm");

  const gif = Buffer.from("GIF89a" + "0".repeat(26), "ascii");
  assert.equal(detectVideoMime(gif), "image/gif");

  // Un HTML disfrazado de video no se guarda como si fuera video.
  assert.equal(detectVideoMime(Buffer.from("<html>no soy un video</html>")), "");
  assert.throws(() => ensureVideoBuffer(Buffer.from("no soy un video")), /VIDEO_RESULT_INVALID/);
  assert.equal(MAX_VIDEO_BYTES, 200 * 1024 * 1024);
});

test("2.3: una URL del proveedor se descarga y se guarda con URL propia", async () => {
  const originalFetch = globalThis.fetch;
  let pedida = "";

  // Proveedor simulado: https público que devuelve un MP4 real por streaming.
  // El DNS también se inyecta: la guarda resuelve el host, y resolver de verdad
  // haría que la prueba dependiera de la red del entorno.
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  globalThis.fetch = async (url) => {
    pedida = String(url);
    return new Response(fakeMp4(64), {
      status: 200,
      headers: { "content-type": "video/mp4" }
    });
  };

  try {
    const saved = await persistProviderVideo({
      url: "https://cdn.proveedor.example/video-123.mp4",
      userId: new mongoose.Types.ObjectId().toString(),
      lookup
    });

    assert.equal(pedida, "https://cdn.proveedor.example/video-123.mp4");
    assert.equal(saved.stored, true);
    assert.equal(saved.mimetype, "video/mp4");
    assert.match(saved.url, /^\/uploads\/media\/\d+-[a-f0-9]+\.mp4$/);
    assert.ok(saved.size > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("2.3: un resultado que ya vive en nuestro almacén no se vuelve a descargar", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("no debería descargarse: ya es una URL propia");
  };

  try {
    const saved = await persistProviderVideo({
      url: "/uploads/media/1700000000000-abcdef123456.mp4",
      userId: new mongoose.Types.ObjectId().toString()
    });

    assert.equal(saved.url, "/uploads/media/1700000000000-abcdef123456.mp4");
    assert.equal(saved.alreadyStored, true);
    assert.equal(isStoredUrl("/uploads/media/1700000000000-abcdef123456.mp4"), true);
    assert.equal(isStoredUrl("https://cdn.proveedor.example/x.mp4"), false);
    assert.equal(isStoredUrl("/uploads/media/../../etc/passwd"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("2.3: la descarga del proveedor rechaza destinos privados y cuerpos no-video", async () => {
  const userId = new mongoose.Types.ObjectId().toString();

  await assert.rejects(
    () => persistProviderVideo({ url: "http://cdn.proveedor.example/x.mp4", userId }),
    /VIDEO_RESULT_INVALID/
  );

  const originalFetch = globalThis.fetch;
  try {
    const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
    globalThis.fetch = async () =>
      new Response("<html>secuestrado</html>", {
        status: 200,
        headers: { "content-type": "video/mp4" }
      });
    await assert.rejects(
      () => persistProviderVideo({ url: "https://cdn.proveedor.example/x.mp4", userId, lookup }),
      /VIDEO_RESULT_INVALID/
    );

    globalThis.fetch = async () => new Response("no encontrado", { status: 404 });
    await assert.rejects(
      () => persistProviderVideo({ url: "https://cdn.proveedor.example/x.mp4", userId, lookup }),
      /VIDEO_RESULT_UNAVAILABLE/
    );

    // Un host que resuelve a una dirección privada se rechaza antes de pedirlo:
    // ese es el SSRF que la guarda evita.
    const privado = async () => [{ address: "10.0.0.7", family: 4 }];
    await assert.rejects(
      () =>
        persistProviderVideo({
          url: "https://interno.proveedor.example/x.mp4",
          userId,
          lookup: privado
        }),
      /VIDEO_RESULT_INVALID/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("2.3: la ruta de video persiste el resultado y limpia la copia al borrar", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "modules", "video-ai", "video.routes.js"),
    "utf8"
  );

  // El guardado ocurre tanto al crear como al sondear: un video que termina
  // en el sondeo también tiene copia propia.
  assert.equal(
    (source.match(/await ensureStoredVideo\(generation\)/g) || []).length,
    2,
    "la copia propia se hace en la creación y en el sondeo"
  );
  assert.match(source, /persistProviderVideo/);
  assert.match(source, /providerVideoUrl/);
  assert.match(source, /purgeUnreferencedMedia\(\[generation\.videoUrl\]\)/);

  const model = VideoGeneration.schema;
  assert.ok(model.path("providerVideoUrl"), "la URL del proveedor se guarda aparte");
  assert.strictEqual(model.path("stored").instance, "Boolean");
  assert.strictEqual(model.path("stored").defaultValue, false);
});

test("2.3: los proyectos de guion se pueden listar, abrir, exportar y borrar", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const routes = fs.readFileSync(
    path.join(__dirname, "..", "src", "modules", "script-ai", "script.routes.js"),
    "utf8"
  );

  // Las cinco rutas existen y filtran por dueño.
  assert.match(routes, /router\.get\("\/projects", auth, requireUser/);
  assert.match(routes, /router\.get\("\/projects\/:id", auth, requireUser/);
  assert.match(routes, /router\.get\("\/projects\/:id\/export", auth, requireUser/);
  assert.match(routes, /router\.put\("\/projects\/:id", auth, requireUser/);
  assert.match(routes, /router\.delete\("\/projects\/:id", auth, requireUser/);
  assert.equal(
    (routes.match(/user: req\.user\.id/g) || []).length >= 5,
    true,
    "toda ruta de proyectos filtra por el dueño"
  );

  const service = fs.readFileSync(
    path.join(__dirname, "..", "..", "client", "src", "services", "aiService.js"),
    "utf8"
  );
  for (const fn of [
    "listScriptProjects",
    "getScriptProject",
    "updateScriptProject",
    "deleteScriptProject",
    "exportScriptProject"
  ]) {
    assert.match(service, new RegExp(`export async function ${fn}`), `falta ${fn} en el cliente`);
  }

  const screen = fs.readFileSync(
    path.join(__dirname, "..", "..", "client", "src", "features", "script-ai", "ScriptProjects.jsx"),
    "utf8"
  );
  assert.match(screen, /Abrir/);
  assert.match(screen, /Exportar \.txt/);
  assert.match(screen, /Exportar \.json/);
});

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { SAFE_NAME, filenameOf } = require("../src/config/durableUploads");
const { saveBuffer, respondUploadError, MEDIA_DIR } = require("../src/config/storage");

test("solo se persisten y sirven nombres generados por el almacenamiento", () => {
  assert.equal(filenameOf("/uploads/media/171000-abc123def456.jpg"), "media/171000-abc123def456.jpg");
  assert.equal(SAFE_NAME.test("media/171000-abc123def456.jpg"), true);
  assert.equal(SAFE_NAME.test("avatars/171000-abc123def456.png"), true);
  assert.equal(SAFE_NAME.test("covers/171000-abc123def456.webp"), true);
  assert.equal(SAFE_NAME.test("../etc/passwd"), false);
  assert.equal(SAFE_NAME.test("media/../../server.js"), false);
  assert.equal(SAFE_NAME.test("media/not-our-name.jpg"), false);
  assert.equal(SAFE_NAME.test("media/171000-abc123def456.html"), false);
});

test("sin GridFS en entorno fail-closed saveBuffer falla con 503, limpia disco y ninguna ruta de subida lo disimula como 500", async () => {
  const originalEnv = process.env.NODE_ENV;
  const before = fs.existsSync(MEDIA_DIR) ? new Set(fs.readdirSync(MEDIA_DIR)) : new Set();

  for (const envValue of ["production", "", undefined]) {
    if (envValue === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = envValue;

    let thrown = null;
    try {
      await saveBuffer({
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        mimetype: "image/jpeg",
        originalname: "prueba.jpg",
        subdir: "media"
      });
    } catch (error) {
      thrown = error;
    }

    assert.ok(thrown, `debió fallar con NODE_ENV=${String(envValue)}`);
    assert.equal(thrown.statusCode, 503);
    assert.equal(thrown.code, "UPLOAD_STORAGE_UNAVAILABLE");

    const after = fs.existsSync(MEDIA_DIR) ? fs.readdirSync(MEDIA_DIR) : [];
    const leaked = after.filter((file) => !before.has(file));
    assert.deepEqual(leaked, [], "saveBuffer debe limpiar el archivo local si falla la copia durable");

    let capturedStatus = null;
    let capturedBody = null;
    const fakeRes = {
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(payload) {
        capturedBody = payload;
        return this;
      }
    };
    respondUploadError(fakeRes, thrown, "Error subiendo media");
    assert.equal(capturedStatus, 503);
    assert.equal(capturedBody?.code, "UPLOAD_STORAGE_UNAVAILABLE");
  }

  process.env.NODE_ENV = originalEnv;

  const uploadRouteFiles = [
    "modules/posts/posts.routes.js",
    "modules/messages/messages.routes.js",
    "modules/users/users.routes.js",
    "modules/music/audio.routes.js",
    "modules/music/music.routes.js",
    "modules/voices/voices.routes.js"
  ];
  for (const relative of uploadRouteFiles) {
    const content = fs.readFileSync(path.join(__dirname, "..", "src", relative), "utf8");
    assert.match(content, /respondUploadError/, `${relative} debe propagar 503 con respondUploadError`);
  }
});

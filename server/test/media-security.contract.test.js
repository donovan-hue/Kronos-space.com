const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const express = require("express");

/**
 * Seguridad de media sin base de datos: la cadena REAL de middlewares
 * (ACL de /uploads, express.static y validación de multer). Estas pruebas
 * cubren el camino sin consultas; el acceso por propietario, GridFS y el
 * borrado se verifican contra MongoDB real en media-acl.e2e.test.js.
 */

const { mediaAcl, mediaPath } = require("../src/middleware/mediaAcl");
const { handleMediaUpload, handleUpload, hasValidImageSignature } = require("../src/middleware/upload");

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);

const SECRET_BYTES = "PRIVATE-MEDIA-BYTES-DO-NOT-LEAK";

function withServer(app, fn) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", async () => {
      try {
        resolve(await fn(server.address().port));
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
  });
}

/** Petición HTTP cruda: no normaliza `..` como lo hace fetch/undici. */
function rawGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: rawPath }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        type: res.headers["content-type"] || "",
        body: Buffer.concat(chunks)
      }));
    });
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("TIMEOUT"));
    });
  });
}

function uploadsFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kronos-media-"));
  fs.mkdirSync(path.join(root, "media"));
  fs.mkdirSync(path.join(root, "avatars"));
  fs.writeFileSync(path.join(root, "media", "private.png"), SECRET_BYTES);
  fs.writeFileSync(path.join(root, "avatars", "public.png"), PNG_1X1);
  return root;
}

function uploadApp() {
  const app = express();
  app.post("/media", handleMediaUpload("media"), (req, res) => res.status(201).json({ ok: true, size: req.file?.size || 0 }));
  app.post("/image", handleUpload("avatar"), (req, res) => res.status(201).json({ ok: true }));
  app.use((error, req, res, next) => res.status(500).json({ error: "interno" }));
  return app;
}

async function post(port, route, field, buffer, { type, name = "f.bin" } = {}) {
  const form = new FormData();
  form.append(field, new Blob([buffer], { type: type || "application/octet-stream" }), name);
  const response = await fetch(`http://127.0.0.1:${port}${route}`, { method: "POST", body: form });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data };
}

// ---------------------------------------------------------------
// Traversal y bypass de ACL (regresión de la auditoría de media)
// ---------------------------------------------------------------

test("regresión: /uploads/avatars/../media/<archivo> no sirve media privada (404 JSON)", async () => {
  const root = uploadsFixture();
  const app = express();
  app.use("/uploads", mediaAcl);
  app.use("/uploads", express.static(root, { etag: true }));

  await withServer(app, async (port) => {
    for (const rawPath of [
      "/uploads/avatars/../media/private.png",
      "/uploads/avatars/%2e%2e/media/private.png",
      "/uploads/avatars/..%2fmedia%2fprivate.png",
      "/uploads/avatars/%2e%2e%2fmedia%2fprivate.png",
      "/uploads/avatars/..%5cmedia%5cprivate.png"
    ]) {
      const response = await rawGet(port, rawPath);
      assert.equal(response.status, 404, rawPath);
      assert.match(response.type, /application\/json/, rawPath);
      assert.equal(response.body.toString().includes(SECRET_BYTES), false, `${rawPath} no filtra bytes`);
      assert.equal(JSON.parse(response.body.toString()).code, "NOT_FOUND", rawPath);
    }
  });
});

test("regresión: una URL mal codificada responde 404 JSON, no HTML ni 500", async () => {
  const root = uploadsFixture();
  const app = express();
  app.use("/uploads", mediaAcl);
  app.use("/uploads", express.static(root, { etag: true }));

  await withServer(app, async (port) => {
    const response = await rawGet(port, "/uploads/media/%E0%A4%A.png");
    assert.equal(response.status, 404);
    assert.match(response.type, /application\/json/);
    assert.equal(JSON.parse(response.body.toString()).code, "NOT_FOUND");
  });
});

test("mediaPath: rechaza traversal, barra invertida y byte nulo; normaliza rutas válidas", () => {
  const req = (baseUrl, p) => ({ baseUrl, path: p });

  assert.equal(mediaPath(req("/uploads", "/avatars/../media/x.png")), null);
  assert.equal(mediaPath(req("/uploads", "/avatars/%2e%2e/media/x.png")), null);
  assert.equal(mediaPath(req("/uploads", "/media/..%5c..%5cpackage.json")), null);
  assert.equal(mediaPath(req("/uploads", "/media/a\0b.png")), null);
  assert.equal(mediaPath(req("/uploads", "/media/%E0%A4%A.png")), null);
  assert.equal(mediaPath(req("/uploads", "/media/1-abc.png")), "/uploads/media/1-abc.png");
  assert.equal(mediaPath(req("/uploads", "/avatars/a.png?v=2")), "/uploads/avatars/a.png");
});

test("avatar público legítimo sigue sirviéndose sin autenticación", async () => {
  const root = uploadsFixture();
  const app = express();
  app.use("/uploads", mediaAcl);
  app.use("/uploads", express.static(root, { etag: true }));

  await withServer(app, async (port) => {
    const response = await rawGet(port, "/uploads/avatars/public.png");
    assert.equal(response.status, 200);
    assert.equal(response.type, "image/png");
    assert.deepEqual(response.body, PNG_1X1);
  });
});

// ---------------------------------------------------------------
// Validación de subida: MIME falso, corrupto, tamaño y tipo
// ---------------------------------------------------------------

test("upload: un tipo no permitido se rechaza con 400 JSON", async () => {
  await withServer(uploadApp(), async (port) => {
    const response = await post(port, "/media", "media", Buffer.from("hola"), { type: "text/plain", name: "a.txt" });
    assert.equal(response.status, 400);
    assert.equal(response.data.error, "Formato no permitido. Usa imagen JPG/PNG/WebP o video MP4/WebM/MOV.");
  });
});

test("upload: MIME falso (texto declarado como PNG) se rechaza por firma", async () => {
  await withServer(uploadApp(), async (port) => {
    const response = await post(port, "/media", "media", Buffer.from("not an image"), { type: "image/png", name: "fake.png" });
    assert.equal(response.status, 400);
    assert.equal(response.data.error, "El contenido del archivo no coincide con su formato");
  });
});

test("upload: un PNG real pasa la validación", async () => {
  await withServer(uploadApp(), async (port) => {
    const response = await post(port, "/media", "media", PNG_1X1, { type: "image/png", name: "ok.png" });
    assert.equal(response.status, 201, JSON.stringify(response.data));
  });
});

test("upload: un PNG corrupto (cabecera válida, sin trailer IEND) se rechaza", async () => {
  const truncated = PNG_1X1.subarray(0, PNG_1X1.length - 12);
  assert.equal(hasValidImageSignature({ mimetype: "image/png", buffer: truncated }), false);

  await withServer(uploadApp(), async (port) => {
    const response = await post(port, "/media", "media", truncated, { type: "image/png", name: "corrupt.png" });
    assert.equal(response.status, 400);
    assert.equal(response.data.error, "El contenido del archivo no coincide con su formato");
  });
});

test("upload: un JPEG sin marcador EOI y un WebP con tamaño RIFF incorrecto se rechazan", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assert.equal(hasValidImageSignature({ mimetype: "image/jpeg", buffer: jpeg }), false, "JPEG truncado");

  const jpegOk = Buffer.concat([jpeg, Buffer.from([0xff, 0xd9])]);
  assert.equal(hasValidImageSignature({ mimetype: "image/jpeg", buffer: jpegOk }), true, "JPEG con EOI");

  const webp = Buffer.alloc(20);
  webp.write("RIFF", 0, "ascii");
  webp.writeUInt32LE(999, 4);
  webp.write("WEBP", 8, "ascii");
  assert.equal(hasValidImageSignature({ mimetype: "image/webp", buffer: webp }), false, "RIFF incoherente");

  const webpOk = Buffer.alloc(20);
  webpOk.write("RIFF", 0, "ascii");
  webpOk.writeUInt32LE(12, 4);
  webpOk.write("WEBP", 8, "ascii");
  assert.equal(hasValidImageSignature({ mimetype: "image/webp", buffer: webpOk }), true, "RIFF coherente");
});

test("upload: imagen mayor de 10 MB se rechaza con 413 JSON", async () => {
  const big = Buffer.concat([PNG_1X1.subarray(0, 8), Buffer.alloc(10 * 1024 * 1024 + 1, 0)]);

  await withServer(uploadApp(), async (port) => {
    const response = await post(port, "/media", "media", big, { type: "image/png", name: "big.png" });
    assert.equal(response.status, 413);
    assert.equal(response.data.error, "La imagen no puede superar 10 MB");
  });
});

test("upload: video mayor de 50 MB se rechaza con 413 JSON", async () => {
  const video = Buffer.alloc(50 * 1024 * 1024 + 1, 0);
  video.write("ftyp", 4, "ascii");

  await withServer(uploadApp(), async (port) => {
    const response = await post(port, "/media", "media", video, { type: "video/mp4", name: "big.mp4" });
    assert.equal(response.status, 413);
    assert.equal(response.data.error, "El archivo supera el límite permitido");
  });
});

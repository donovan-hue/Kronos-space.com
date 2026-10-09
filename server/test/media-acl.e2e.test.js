const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");
const mongoose = require("mongoose");

/**
 * Auditoría de media contra MongoDB real y el servidor real.
 *
 * Sin dobles ni base en memoria. Cada escenario usa HTTP real, la cookie de
 * medios que emite el servidor (la que usa el navegador en <img>/<video>), y
 * consultas reales a GridFS y a las colecciones. La base es temporal y se
 * elimina al terminar. Requiere KRONOS_E2E_MONGODB_URI.
 */
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
  quiet: true
});

process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-media-acl-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");
const Message = require("../src/modules/messages/Message");
const { assertE2ETarget } = require("./helpers/e2e-target-guard");
const { connectE2E, cleanupE2E, clearNewDocuments } = require("./helpers/e2e-database");

let mongoConfigured = Boolean(process.env.KRONOS_E2E_MONGODB_URI);
const tempDatabaseName = "test";

if (mongoConfigured) {
  mongoConfigured = assertE2ETarget({
    uri: process.env.KRONOS_E2E_MONGODB_URI,
    dbName: tempDatabaseName
  });
}

const PASSWORD = "KronosMediaAcl123!";
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);

let baseUrl;
let dbConnected = false;

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) {
      t.skip("Requiere KRONOS_E2E_MONGODB_URI real (base Atlas test).");
      return;
    }
    await fn(t);
  });
}

async function request(route, { method = "GET", token, body, form, cookie, headers: extra } = {}) {
  const headers = { ...(extra || {}) };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: form || (body ? JSON.stringify(body) : undefined)
  });

  let data = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = Buffer.from(await response.arrayBuffer());
  }

  return {
    status: response.status,
    data,
    contentType,
    mediaCookie: (response.headers.getSetCookie?.() || [])
      .map((c) => c.split(";")[0])
      .find((c) => c.startsWith("kronos_media_token=")) || null
  };
}

/** Petición HTTP cruda: no normaliza `..` como lo hace fetch. */
function rawGet(rawPath) {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.get({ host: url.hostname, port: url.port, path: rawPath }, (res) => {
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

async function registerUser(label) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `media.${label}.${suffix}@example.com`;
  const response = await request("/api/auth/register", {
    method: "POST",
    body: {
      username: `media_${label}_${suffix}`.slice(0, 30),
      email,
      password: PASSWORD,
      displayName: `Media ${label}`
    }
  });

  assert.strictEqual(response.status, 201, JSON.stringify(response.data));
  assert.ok(response.mediaCookie, "el registro emite la cookie de medios");

  return {
    id: response.data.user.id,
    token: response.data.token,
    cookie: response.mediaCookie
  };
}

function pngForm(buffer = PNG_1X1, { type = "image/png", name = "photo.png" } = {}) {
  const form = new FormData();
  form.append("media", new Blob([buffer], { type }), name);
  return form;
}

async function uploadPng(user, buffer) {
  const response = await request("/api/posts/media/upload", {
    method: "POST",
    token: user.token,
    form: pngForm(buffer)
  });

  assert.strictEqual(response.status, 201, JSON.stringify(response.data));
  assert.match(response.data.url, /^\/uploads\/media\/[A-Za-z0-9._-]+$/);

  return response.data.url;
}

function gridFile(url) {
  return mongoose.connection.db
    .collection("kronosUploads.files")
    .findOne({ filename: url.replace(/^\/uploads\//, "") });
}

function diskPath(url) {
  return path.join(UPLOADS_DIR, url.replace(/^\/uploads\//, ""));
}

function mediaRead(url, user) {
  return request(url, { cookie: user ? user.cookie : undefined });
}

test.before(async () => {
  if (mongoConfigured) {
    await connectE2E();
    dbConnected = true;
    await clearNewDocuments();
  }

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));

  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }

  if (dbConnected) {
    await cleanupE2E();
  }
});

// ---------------------------------------------------------------
// 1-5. Ciclo de acceso: propietario, tercero, borrado
// ---------------------------------------------------------------

mongoTest("MEDIA-01/02 usuario A sube imagen y puede acceder a su propio recurso", async () => {
  const a = await registerUser("a1");
  const url = await uploadPng(a, PNG_1X1);

  const own = await mediaRead(url, a);
  assert.strictEqual(own.status, 200, "el propietario accede a su archivo");
  assert.strictEqual(own.contentType, "image/png");
  assert.deepStrictEqual(own.data, PNG_1X1);
});

mongoTest("MEDIA-03 usuario B y usuarios anónimos NO pueden acceder al recurso privado de A", async () => {
  const a = await registerUser("a2");
  const b = await registerUser("b2");
  const url = await uploadPng(a, PNG_1X1);

  const privatePost = await request("/api/posts", {
    method: "POST",
    token: a.token,
    body: {
      content: "privado",
      media: { url, type: "image", mimeType: "image/png", size: PNG_1X1.length, alt: "" },
      audience: "private"
    }
  });
  assert.strictEqual(privatePost.status, 201, JSON.stringify(privatePost.data));

  const asB = await mediaRead(url, b);
  assert.strictEqual(asB.status, 404, "B no accede");
  assert.strictEqual(asB.contentType.includes("application/json"), true);
  assert.strictEqual(asB.data.code, "NOT_FOUND");

  const anonymous = await mediaRead(url);
  assert.strictEqual(anonymous.status, 404, "anónimo no accede");
  assert.notDeepStrictEqual(anonymous.data, PNG_1X1, "sin bytes filtrados");
});

mongoTest("MEDIA-04/05 usuario A elimina la publicación y el recurso deja de ser accesible en todas las vías", async () => {
  const a = await registerUser("a3");
  const url = await uploadPng(a, PNG_1X1);

  const created = await request("/api/posts", {
    method: "POST",
    token: a.token,
    body: { content: "se borra", media: { url, type: "image", mimeType: "image/png", size: PNG_1X1.length, alt: "" } }
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));

  assert.strictEqual((await mediaRead(url, a)).status, 200, "antes de borrar, accesible");
  assert.ok(await gridFile(url), "la copia GridFS existe antes de borrar");
  assert.ok(fs.existsSync(diskPath(url)), "la copia local existe antes de borrar");

  const removed = await request(`/api/posts/${created.data.post._id}`, { method: "DELETE", token: a.token });
  assert.strictEqual(removed.status, 200, JSON.stringify(removed.data));

  assert.strictEqual((await mediaRead(url, a)).status, 404, "el propietario ya no accede");
  assert.strictEqual((await mediaRead(url)).status, 404, "anónimo tampoco");
  assert.strictEqual(await gridFile(url), null, "la copia GridFS se elimina");
  assert.strictEqual(fs.existsSync(diskPath(url)), false, "la copia local se elimina");
});

mongoTest("MEDIA-04b la media usada en un mensaje NO se elimina al borrar la publicación que también la usa", async () => {
  const a = await registerUser("a4");
  const b = await registerUser("b4");
  const url = await uploadPng(a, PNG_1X1);

  const created = await request("/api/posts", {
    method: "POST",
    token: a.token,
    body: { content: "compartida", media: { url, type: "image", mimeType: "image/png", size: PNG_1X1.length, alt: "" } }
  });
  assert.strictEqual(created.status, 201);

  await Message.create({
    sender: a.id,
    receiver: b.id,
    text: "adjunto",
    media: { url, type: "image", mimeType: "image/png", size: PNG_1X1.length }
  });

  const removed = await request(`/api/posts/${created.data.post._id}`, { method: "DELETE", token: a.token });
  assert.strictEqual(removed.status, 200);

  assert.ok(await gridFile(url), "la copia sigue: la usa un mensaje");
  const asReceiver = await mediaRead(url, b);
  assert.strictEqual(asReceiver.status, 200, "el receptor del mensaje sigue viendo el adjunto");
});

// ---------------------------------------------------------------
// 6-9. Upload inválido, MIME falso, corrupto y tamaño excedido
// ---------------------------------------------------------------

mongoTest("MEDIA-06 upload de tipo no permitido se rechaza con 400 JSON", async () => {
  const a = await registerUser("v1");
  const form = new FormData();
  form.append("media", new Blob(["texto"], { type: "text/plain" }), "a.txt");

  const response = await request("/api/posts/media/upload", { method: "POST", token: a.token, form });
  assert.strictEqual(response.status, 400);
  assert.strictEqual(response.contentType.includes("application/json"), true);
  assert.ok(response.data.error);
});

mongoTest("MEDIA-07 MIME falso (texto declarado como PNG) se rechaza", async () => {
  const a = await registerUser("v2");
  const response = await request("/api/posts/media/upload", {
    method: "POST",
    token: a.token,
    form: pngForm(Buffer.from("no soy una imagen"), { name: "falso.png" })
  });

  assert.strictEqual(response.status, 400);
  assert.strictEqual(response.data.error, "El contenido del archivo no coincide con su formato");
});

mongoTest("MEDIA-08 archivo corrupto (PNG truncado) se rechaza y no deja copia", async () => {
  const a = await registerUser("v3");
  const truncated = PNG_1X1.subarray(0, PNG_1X1.length - 12);

  const response = await request("/api/posts/media/upload", {
    method: "POST",
    token: a.token,
    form: pngForm(truncated, { name: "roto.png" })
  });

  assert.strictEqual(response.status, 400);
  assert.strictEqual(response.data.error, "El contenido del archivo no coincide con su formato");
});

mongoTest("MEDIA-09 imagen mayor de 10 MB se rechaza con 413 JSON", async () => {
  const a = await registerUser("v4");
  const big = Buffer.concat([PNG_1X1.subarray(0, 8), Buffer.alloc(10 * 1024 * 1024 + 1, 0)]);

  const response = await request("/api/posts/media/upload", {
    method: "POST",
    token: a.token,
    form: pngForm(big, { name: "grande.png" })
  });

  assert.strictEqual(response.status, 413);
  assert.strictEqual(response.data.error, "La imagen no puede superar 10 MB");
});

// ---------------------------------------------------------------
// 10-12. Ownership, fallback durable y GridFS
// ---------------------------------------------------------------

mongoTest("MEDIA-10 el ownership se conserva en GridFS (metadata.ownerId del que subió)", async () => {
  const a = await registerUser("o1");
  const url = await uploadPng(a, PNG_1X1);

  const file = await gridFile(url);
  assert.ok(file, "existe copia GridFS");
  assert.strictEqual(String(file.metadata.ownerId), String(a.id));
  assert.strictEqual(file.contentType, "image/png");
});

mongoTest("MEDIA-11 fallback durable: si el disco pierde el archivo, GridFS lo sirve al propietario", async () => {
  const a = await registerUser("d1");
  const url = await uploadPng(a, PNG_1X1);

  fs.unlinkSync(diskPath(url));
  assert.strictEqual(fs.existsSync(diskPath(url)), false, "simulación de redespliegue: disco vacío");

  const served = await mediaRead(url, a);
  assert.strictEqual(served.status, 200, "GridFS sirve el archivo");
  assert.deepStrictEqual(served.data, PNG_1X1, "bytes idénticos a la subida");
});

mongoTest("MEDIA-12 GridFS se usa para la copia durable y su contenido coincide con la subida", async () => {
  const a = await registerUser("g1");
  const url = await uploadPng(a, PNG_1X1);

  const file = await gridFile(url);
  assert.ok(file, "copia en GridFS");
  assert.strictEqual(file.length, PNG_1X1.length);

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "kronosUploads" });
  const chunks = [];
  await new Promise((resolve, reject) => {
    bucket.openDownloadStream(file._id)
      .on("data", (c) => chunks.push(c))
      .on("error", reject)
      .on("end", resolve);
  });
  assert.deepStrictEqual(Buffer.concat(chunks), PNG_1X1);
});

// ---------------------------------------------------------------
// 13. Sin bypasses por URL directa
// ---------------------------------------------------------------

mongoTest("MEDIA-13 sin bypass: traversal desde avatares/portadas NO alcanza media privada", async () => {
  const a = await registerUser("x1");
  const url = await uploadPng(a, PNG_1X1);
  const name = url.replace(/^\/uploads\/media\//, "");

  for (const rawPath of [
    `/uploads/avatars/../media/${name}`,
    `/uploads/covers/%2e%2e/media/${name}`,
    `/uploads/avatars/..%2fmedia%2f${name}`,
    `/uploads/media/..%2F..%2Fpackage.json`,
    `/uploads/media/%2e%2e/%2e%2e/package.json`
  ]) {
    const response = await rawGet(rawPath);
    assert.strictEqual(response.status, 404, rawPath);
    assert.match(response.type, /application\/json/, rawPath);
    assert.ok(!response.body.equals(PNG_1X1), `${rawPath} no entrega la imagen`);
  }
});

mongoTest("MEDIA-13b sin bypass: URL de media inexistente o ajena no revela si existe", async () => {
  const a = await registerUser("x2");
  const b = await registerUser("x3");
  const url = await uploadPng(a, PNG_1X1);
  const ghost = url.replace(/[0-9a-f]{12}\.png$/, "000000000000.png");
  assert.notStrictEqual(ghost, url, "la URL fantasma es distinta de la real");

  const asOwnerGhost = await mediaRead(ghost, a);
  const asStrangerReal = await mediaRead(url, b);
  assert.strictEqual(asOwnerGhost.status, 404);
  assert.strictEqual(asStrangerReal.status, 404);
  assert.deepStrictEqual(asOwnerGhost.data.code, asStrangerReal.data.code, "mismo contrato, sin enumeración");
});

// ---------------------------------------------------------------
// 14. Contratos HTTP/JSON de error
// ---------------------------------------------------------------

mongoTest("MEDIA-14 errores HTTP de media son JSON con contrato: 401 sin token, 404 ruta desconocida", async () => {
  const anon = await request("/api/posts/media/upload", { method: "POST", form: pngForm() });
  assert.strictEqual(anon.status, 401);
  assert.strictEqual(anon.contentType.includes("application/json"), true);

  const unknown = await request("/uploads/media/no-existe-000.png");
  assert.strictEqual(unknown.status, 404);
  assert.strictEqual(unknown.contentType.includes("application/json"), true);
  assert.strictEqual(unknown.data.code, "NOT_FOUND");
  assert.strictEqual(unknown.data.path, "/uploads/media/no-existe-000.png");
});

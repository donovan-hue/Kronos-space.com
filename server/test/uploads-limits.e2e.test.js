const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/**
 * T04 + T13 — Límites de subida y regresión de seguridad de archivos.
 *
 * Lo que estas pruebas vigilan, contra el servidor real (no con dobles):
 *
 *   1. un archivo sobredimensionado se rechaza con 413 y su mensaje,
 *   2. un tipo no permitido se rechaza aunque el nombre diga otra cosa,
 *   3. un contenido que no coincide con el tipo declarado se rechaza por
 *      firma (no basta con decirlo en la cabecera),
 *   4. un nombre malicioso NO decide dónde se guarda el archivo: el servidor
 *      genera el nombre, y la URL resultante se sirve sin salir de /uploads.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-uploads-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const { hasValidImageSignature } = require("../src/middleware/upload");
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

const PASSWORD = "KronosSubidas123!";
// PNG 1×1 completo: la validación de #52 exige IEND además de firma/IHDR.
// El anterior fixture terminaba dentro del encabezado y ya no era un PNG válido.
const PNG_MINIMO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);
const TEXTO_CUALQUIERA = Buffer.from("esto no es una imagen, aunque lo diga el nombre");

test("fixture de subida: PNG completo aceptado por la validación real", () => {
  assert.strictEqual(hasValidImageSignature({ buffer: PNG_MINIMO, mimetype: "image/png" }), true);
});

let baseUrl;
let connected = false;
const archivosCreados = [];

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) return t.skip("Requiere KRONOS_E2E_MONGODB_URI real (base Atlas test).");
    try {
      await fn();
    } catch (error) {
      console.log(`KRONOS_E2E_FAIL [${name}] :: ${(error?.message || error).toString().replace(/\s+/g, " ").slice(0, 500)}`);
      throw error;
    }
  });
}

async function register(displayName) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: `subida_${suffix}`,
      email: `subida.${suffix}@example.test`,
      password: PASSWORD,
      displayName
    })
  });
  const data = await response.json().catch(() => null);
  assert.strictEqual(response.status, 201, JSON.stringify(data));
  return { id: data.user.id, token: data.token };
}

async function subirAvatar(token, { buffer, tipo, nombre }) {
  const form = new FormData();
  form.append("avatar", new Blob([buffer], { type: tipo }), nombre);
  const response = await fetch(`${baseUrl}/api/users/me/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

test.before(async () => {
  if (mongoConfigured) {
    await connectE2E();
    connected = true;
    await clearNewDocuments();
  }
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.beforeEach(async () => {
  if (connected) await clearNewDocuments();
});

test.after(async () => {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (connected) await cleanupE2E();

  // Los archivos subidos son datos de ejecución, no del repositorio: se
  // retiran para no dejar rastro de la prueba.
  for (const url of archivosCreados) {
    const filePath = path.join(__dirname, "..", url.replace(/^\//, ""));
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Si ya no está, el objetivo (no dejarlo) se cumplió igual.
    }
  }
});

mongoTest("subidas: un archivo sobredimensionado se rechaza con 413", async () => {
  const user = await register("Subidor");
  // 10 MB + 1 byte: el límite de imagen es 10 MB.
  const grande = Buffer.alloc(10 * 1024 * 1024 + 1, 0x41);

  const respuesta = await subirAvatar(user.token, { buffer: grande, tipo: "image/png", nombre: "grande.png" });

  assert.strictEqual(respuesta.status, 413, JSON.stringify(respuesta.data));
  assert.match(respuesta.data.error, /límite/i, "el mensaje explica el motivo");
});

mongoTest("subidas: un tipo no permitido se rechaza aunque el nombre lo disimule", async () => {
  const user = await register("Subidor");

  const respuesta = await subirAvatar(user.token, {
    buffer: PNG_MINIMO,
    tipo: "image/gif",
    nombre: "foto.png"
  });

  assert.strictEqual(respuesta.status, 400, JSON.stringify(respuesta.data));
  assert.match(respuesta.data.error, /Formato de imagen no permitido/i);
});

mongoTest("subidas: el contenido que no coincide con el tipo declarado se rechaza por firma", async () => {
  const user = await register("Subidor");

  const respuesta = await subirAvatar(user.token, {
    buffer: TEXTO_CUALQUIERA,
    tipo: "image/png",
    nombre: "disfrazada.png"
  });

  assert.strictEqual(respuesta.status, 400, JSON.stringify(respuesta.data));
  assert.match(respuesta.data.error, /no coincide con su formato/i);
});

mongoTest("subidas: un nombre malicioso no decide dónde se guarda el archivo", async () => {
  const user = await register("Subidor");

  const respuesta = await subirAvatar(user.token, {
    buffer: PNG_MINIMO,
    tipo: "image/png",
    nombre: "../../../../etc/kronos.png"
  });

  assert.strictEqual(respuesta.status, 200, JSON.stringify(respuesta.data));

  const url = String(respuesta.data.avatar || "");
  assert.match(url, /^\/uploads\/avatars\/[A-Za-z0-9.-]+$/, `la URL la genera el servidor: ${url}`);
  assert.ok(!url.includes(".."), "la URL no conserva el recorrido del nombre recibido");

  // El archivo se sirve de verdad, y sale del almacén de la aplicación.
  const servido = await fetch(`${baseUrl}${url}`);
  assert.strictEqual(servido.status, 200, `el archivo guardado se sirve: ${url}`);
  archivosCreados.push(url);

  // Y quedó registrado como avatar del usuario, no como un archivo suelto.
  const yo = await fetch(`${baseUrl}/api/users/me`, { headers: { Authorization: `Bearer ${user.token}` } });
  const perfil = await yo.json();
  assert.strictEqual(perfil.avatar, url);
});

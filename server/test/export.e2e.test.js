const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");

/**
 * T07 — Exportación de datos con cuenta real.
 *
 * El derecho a llevarse lo propio se comprueba con una cuenta de verdad, no
 * con dobles: se registra una persona, publica y comenta, y luego pide su
 * exportación, la descarga y encuentra dentro lo que escribió. También se
 * comprueba la ventana de una por semana y que nadie pueda descargar una
 * exportación que no pidió.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-export-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
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

const PASSWORD = "KronosExport123!";
let baseUrl;
let connected = false;

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

async function request(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const tipo = response.headers.get("content-type") || "";
  const data = tipo.includes("json") ? await response.json().catch(() => null) : await response.text();
  return { status: response.status, data, headers: response.headers };
}

async function register(displayName) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const response = await request("/api/auth/register", {
    method: "POST",
    body: {
      username: `export_${suffix}`,
      email: `export.${suffix}@example.test`,
      password: PASSWORD,
      displayName
    }
  });
  assert.strictEqual(response.status, 201, JSON.stringify(response.data));
  return { id: response.data.user.id, token: response.data.token, username: response.data.user.username };
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
});

mongoTest("exportación: sin solicitar, la descarga no está disponible", async () => {
  const persona = await register("Persona");
  const estado = await request("/api/export/status", { token: persona.token });

  assert.strictEqual(estado.status, 200, JSON.stringify(estado.data));
  assert.strictEqual(estado.data.canDownload, false, "nadie descarga lo que no pidió");

  const descarga = await request("/api/export/download", { token: persona.token });
  assert.strictEqual(descarga.status, 403, JSON.stringify(descarga.data));
  assert.strictEqual(descarga.data.code, "EXPORT_NOT_REQUESTED");
});

mongoTest("exportación: la cuenta real pide, descarga y se encuentra dentro", async () => {
  const persona = await register("Persona");
  const otra = await register("Otra");

  const publicado = await request("/api/posts", {
    method: "POST",
    token: persona.token,
    body: { content: "Mi primera publicación exportable" }
  });
  assert.strictEqual(publicado.status, 201, JSON.stringify(publicado.data));

  const comentado = await request(`/api/posts/${publicado.data.post._id}/comments`, {
    method: "POST",
    token: persona.token,
    body: { content: "Un comentario propio que también viaja" }
  });
  assert.strictEqual(comentado.status, 201, JSON.stringify(comentado.data));

  const solicitud = await request("/api/export/request", { method: "POST", token: persona.token });
  assert.strictEqual(solicitud.status, 200, JSON.stringify(solicitud.data));
  assert.strictEqual(solicitud.data.ok, true);
  assert.strictEqual(solicitud.data.downloadUrl, "/api/export/download");

  const descarga = await request("/api/export/download", { token: persona.token });
  assert.strictEqual(descarga.status, 200, `descarga: ${String(descarga.data).slice(0, 200)}`);
  assert.match(descarga.headers.get("content-disposition") || "", /attachment; filename="kronos-export-/, "viene como archivo adjunto");

  const paquete = typeof descarga.data === "string" ? JSON.parse(descarga.data) : descarga.data;
  assert.strictEqual(paquete.platform, "Kronos Space");
  assert.strictEqual(paquete.user.username, persona.username, "el paquete es de quien lo pidió");
  assert.ok(
    paquete.posts.some((p) => p.content === "Mi primera publicación exportable"),
    "la publicación propia viaja en el paquete"
  );
  assert.ok(
    paquete.comments.some((c) => c.content === "Un comentario propio que también viaja"),
    "el comentario propio viaja en el paquete"
  );
  assert.ok(
    !paquete.posts.some((p) => String(p.author) === otra.id),
    "no viaja nada que no sea de quien exporta"
  );
});

mongoTest("exportación: la ventana es de una por semana y responde 429 sin abrir otra", async () => {
  const persona = await register("Persona");

  const primera = await request("/api/export/request", { method: "POST", token: persona.token });
  assert.strictEqual(primera.status, 200, JSON.stringify(primera.data));

  const segunda = await request("/api/export/request", { method: "POST", token: persona.token });
  assert.strictEqual(segunda.status, 429, JSON.stringify(segunda.data));
  assert.strictEqual(segunda.data.code, "EXPORT_RATE_LIMIT");
  assert.ok(segunda.data.nextAvailableDate, "dice cuándo vuelve a estar disponible");

  const estado = await request("/api/export/status", { token: persona.token });
  assert.strictEqual(estado.data.eligible, false);
  assert.strictEqual(estado.data.canDownload, true, "la ventana abierta sigue permitiendo descargar");
});

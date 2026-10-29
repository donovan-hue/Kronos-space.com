const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");

/**
 * POLÍTICA DE PUBLICACIÓN sobre MongoDB real.
 *
 * Sin dobles ni base en memoria: exige `KRONOS_E2E_MONGODB_URI` y trabaja en la
 * base temporal del corredor e2e. Sin esa variable, cada caso se salta y
 * declara por qué — la decisión pura se prueba en
 * `posting-policy.contract.test.js`, que sí corre siempre.
 *
 * Lo que solo se puede ver aquí: que la guarda se aplica en la ruta (no solo en
 * el módulo), que el 403 llega con el código que consume el compositor, que un
 * repost está cubierto, que los comentarios NO lo están, y que verificar el
 * correo desbloquea la publicación sin reiniciar el proceso.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-posting-policy-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const User = require("../src/modules/users/User");
const { assertE2ETarget } = require("./helpers/e2e-target-guard");
const { connectE2E, cleanupE2E, clearNewDocuments } = require("./helpers/e2e-database");

let mongoConfigured = Boolean(process.env.KRONOS_E2E_MONGODB_URI);

if (mongoConfigured) {
  mongoConfigured = assertE2ETarget({
    uri: process.env.KRONOS_E2E_MONGODB_URI,
    dbName: "test"
  });
}

const PASSWORD = "KronosPolicy123!";
const VAR = "REQUIRE_VERIFIED_EMAIL_TO_POST";
let baseUrl;
let connected = false;

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) return t.skip("Requiere KRONOS_E2E_MONGODB_URI");
    try {
      await fn();
    } catch (error) {
      console.log(`POSTING_POLICY_E2E_FAIL [${name}] :: ${(error?.message || error).toString().replace(/\s+/g, " ").slice(0, 500)}`);
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
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data };
}

async function register(prefix) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const response = await request("/api/auth/register", {
    method: "POST",
    body: {
      username: `${prefix}_${suffix}`,
      email: `${prefix}.${suffix}@example.test`,
      password: PASSWORD,
      displayName: prefix
    }
  });
  assert.strictEqual(response.status, 201, JSON.stringify(response.data));
  return { id: response.data.user.id, token: response.data.token };
}

/** La variable se restaura siempre: una prueba no puede dejar encendida una guarda global. */
async function conGuardaactivada(fn) {
  const previo = process.env[VAR];
  process.env[VAR] = "true";
  try {
    return await fn();
  } finally {
    if (previo === undefined) delete process.env[VAR];
    else process.env[VAR] = previo;
  }
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

test.after(async () => {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (connected) await cleanupE2E();
});

mongoTest("con la guarda apagada se publica sin correo verificado (el default documented)", async () => {
  delete process.env[VAR];
  const autor = await register("off");
  const creado = await request("/api/posts", {
    method: "POST",
    token: autor.token,
    body: { content: "Publicación con la guarda apagada" }
  });
  assert.strictEqual(creado.status, 201, JSON.stringify(creado.data));
});

mongoTest("encendida: publicación y repost rechazados con código, comentario no", async () => {
  const novel = await register("novel");
  const otro = await register("otro");

  // Un post ajeno, público, para tener algo que republicar.
  const delOtro = await request("/api/posts", {
    method: "POST",
    token: otro.token,
    body: { content: "Contenido público de otra cuenta" }
  });
  assert.strictEqual(delOtro.status, 201, JSON.stringify(delOtro.data));

  await conGuardaactivada(async () => {
    const intento = await request("/api/posts", {
      method: "POST",
      token: novel.token,
      body: { content: "Intento con correo sin verificar" }
    });
    assert.strictEqual(intento.status, 403, JSON.stringify(intento.data));
    assert.strictEqual(intento.data.code, "correo_no_verificado", "el compositor depende de este código");
    assert.match(intento.data.error, /verificar tu correo/i);

    const reposte = await request(`/api/posts/${delOtro.data.post._id}/repost`, {
      method: "POST",
      token: novel.token,
      body: { content: "" }
    });
    assert.strictEqual(reposte.status, 403, "republicar también es publicar en el feed de terceros");
    assert.strictEqual(reposte.data.code, "correo_no_verificado");

    // Ámbito declarado: la conversación uno a uno no pasa por peaje.
    const comentario = await request(`/api/posts/${delOtro.data.post._id}/comments`, {
      method: "POST",
      token: novel.token,
      body: { content: "Comentario sin verificar" }
    });
    assert.strictEqual(comentario.status, 201, JSON.stringify(comentario.data));

    // Guardar un borrador sigue disponible: la guarda es de publicación, no de cuenta.
    const borrador = await request("/api/drafts", {
      method: "POST",
      token: novel.token,
      body: { content: "Borrador guardado pese a la guarda" }
    });
    assert.strictEqual(borrador.status, 201, JSON.stringify(borrador.data));
  });
});

mongoTest("verificar el correo desbloquea la publicación sin reiniciar el proceso", async () => {
  const cuenta = await register("verif");

  await conGuardaactivada(async () => {
    const antes = await request("/api/posts", {
      method: "POST",
      token: cuenta.token,
      body: { content: "Antes de verificar" }
    });
    assert.strictEqual(antes.status, 403);

    await User.updateOne({ _id: cuenta.id }, { $set: { emailVerified: true } });

    const despues = await request("/api/posts", {
      method: "POST",
      token: cuenta.token,
      body: { content: "Después de verificar" }
    });
    assert.strictEqual(despues.status, 201, JSON.stringify(despues.data));
  });
});

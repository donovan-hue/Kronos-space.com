const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

/**
 * PULSO (Fase 6) — contratos con MongoDB real: la sesión es finita, no
 * repite lo ya visto, respeta señales más/menos y la audiencia.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-pulse-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const User = require("../src/modules/users/User");
const Post = require("../src/modules/posts/Post");
const SeenPost = require("../src/modules/pulse/SeenPost");
const FeedSignal = require("../src/modules/pulse/FeedSignal");
const { assertE2ETarget } = require("./helpers/e2e-target-guard");
const { connectE2E, cleanupE2E, clearNewDocuments } = require("./helpers/e2e-database");

let mongoConfigured = Boolean(process.env.KRONOS_E2E_MONGODB_URI);
const tempDatabaseName = "test";

// R-12 — fail-closed: no se conecta a un clúster que no se pueda demostrar de
// pruebas. `dbName` protege la BASE, no el CLÚSTER: si la URI apuntara al
// servicio real, estas pruebas escribirían en su infraestructura.
if (mongoConfigured) {
  mongoConfigured = assertE2ETarget({
    uri: process.env.KRONOS_E2E_MONGODB_URI,
    dbName: tempDatabaseName
  });
}
const PASSWORD = "KronosPulse123!";
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
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

async function register(displayName) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const response = await request("/api/auth/register", {
    method: "POST",
    body: {
      username: `e2e_${suffix}`,
      email: `e2e.${suffix}@example.test`,
      password: PASSWORD,
      displayName
    }
  });
  assert.strictEqual(response.status, 201, JSON.stringify(response.data));
  return { id: response.data.user.id, token: response.data.token, username: response.data.user.username };
}

async function createPost(token, body) {
  const response = await request("/api/posts", { method: "POST", token, body });
  assert.strictEqual(response.status, 201, JSON.stringify(response.data));
  return response.data.post;
}

/**
 * Aislamiento de la sesión. El Pulso ofrece TODAS las publicaciones elegibles de
 * la base para el lector, no solo las del autor del test. En Atlas `test` quedan
 * publicaciones de corridas anteriores (una corrida cancelada no ejecuta su
 * limpieza) y, si no se descuentan, la sesión las cuenta como pendientes.
 * Se marcan como vistas para este lector recién creado, así la sesión contiene
 * solo lo que crea el test. Es preparación de datos: no altera la API ni las
 * aserciones.
 */
async function isolateViewerFromExistingPosts(viewerId) {
  const existing = await Post.distinct("_id", { "moderation.hidden": { $ne: true } });
  for (let index = 0; index < existing.length; index += 500) {
    const chunk = existing.slice(index, index + 500).map((postId) => ({ user: viewerId, post: postId }));
    await SeenPost.insertMany(chunk, { ordered: false });
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

test.beforeEach(async () => {
  // Aislamiento real entre pruebas: sin esto, las publicaciones de pruebas
  // anteriores del archivo aparecen en el Pulso de las siguientes.
  if (connected) {
    await clearNewDocuments();
  }
});

test.after(async () => {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (connected) {
    await cleanupE2E();
  }
});

mongoTest("pulso: la sesión es finita y no repite lo ya visto", async () => {
  const author = await register("Autora");
  const viewer = await register("Lectora");
  await request(`/api/users/${author.id}/follow`, { method: "POST", token: viewer.token });
  await isolateViewerFromExistingPosts(viewer.id);

  for (let index = 0; index < 5; index += 1) {
    await createPost(author.token, { content: `Pulso ${index}` });
  }

  const first = await request("/api/pulse?limit=3", { token: viewer.token });
  assert.strictEqual(first.status, 200, JSON.stringify(first.data));
  assert.strictEqual(first.data.sessionSize, 3, "la sesión se corta en el límite pedido");
  const firstIds = first.data.posts.map((post) => post._id);

  for (const postId of firstIds) {
    const seen = await request(`/api/pulse/seen/${postId}`, { method: "POST", token: viewer.token });
    assert.strictEqual(seen.status, 200, JSON.stringify(seen.data));
    // Idempotente: marcar dos veces no duplica.
    await request(`/api/pulse/seen/${postId}`, { method: "POST", token: viewer.token });
  }
  const seenDocs = await SeenPost.countDocuments({ user: viewer.id });
  assert.strictEqual(seenDocs, 3, "tres vistos, sin duplicados");

  const second = await request("/api/pulse?limit=3", { token: viewer.token });
  const secondIds = second.data.posts.map((post) => post._id);
  assert.strictEqual(second.data.sessionSize, 2, "quedaban solo dos sin ver");
  assert.ok(secondIds.every((id) => !firstIds.includes(id)), "nada de la primera sesión se repite");

  // La segunda sesión también se consume: sin marcarla, la tercera
  // legítimamente trae los mismos dos pendientes.
  for (const postId of secondIds) {
    await request(`/api/pulse/seen/${postId}`, { method: "POST", token: viewer.token });
  }

  const third = await request("/api/pulse?limit=3", { token: viewer.token });
  assert.strictEqual(third.data.sessionSize, 0);
  assert.strictEqual(third.data.completed, true, "la sesión termina de verdad");
});

mongoTest("pulso: las señales more priorizan y less excluyen", async () => {
  const author = await register("Autora");
  const viewer = await register("Lectora");
  await request(`/api/users/${author.id}/follow`, { method: "POST", token: viewer.token });
  await isolateViewerFromExistingPosts(viewer.id);

  // Los temas nacen del contenido (#): el campo hashtags del body no existe.
  // El relleno sin tema verifica que el tema "more" encabeza de verdad.
  await createPost(author.token, { content: "Relleno sin tema" });
  const arte = await createPost(author.token, { content: "Obra nueva #arte" });
  await createPost(author.token, { content: "Otra obra #arte" });
  const comida = await createPost(author.token, { content: "Receta #comida" });

  const less = await request("/api/pulse/signal", {
    method: "POST",
    token: viewer.token,
    body: { postId: comida._id, direction: "less" }
  });
  assert.strictEqual(less.status, 200, JSON.stringify(less.data));
  assert.deepEqual(less.data.tags, ["comida"]);

  const more = await request("/api/pulse/signal", {
    method: "POST",
    token: viewer.token,
    body: { postId: arte._id, direction: "more" }
  });
  assert.strictEqual(more.status, 200, JSON.stringify(more.data));

  const session = await request("/api/pulse?limit=10", { token: viewer.token });
  assert.strictEqual(session.status, 200);
  assert.ok(session.data.lessTags.includes("comida"));
  assert.ok(session.data.moreTags.includes("arte"));
  // El hashtag vive en el contenido ("Obra nueva #arte"), así que la
  // búsqueda es por subcadena: includes() exacto nunca encontraría
  // "Obra nueva" como elemento del arreglo.
  const contents = session.data.posts.map((post) => post.content);
  const has = (needle) => contents.some((content) => content.includes(needle));
  assert.ok(has("Obra nueva"), "lo marcado como more sigue presente");
  assert.ok(!has("Receta"), "lo marcado como less queda fuera");
  // Prioridad real: el tema marcado como more encabeza la sesión.
  const firstArte = contents.findIndex((content) => content.includes("#arte"));
  const firstResto = contents.findIndex((content) => !content.includes("#arte"));
  assert.ok(
    firstArte !== -1 && (firstResto === -1 || firstArte < firstResto),
    "las publicaciones del tema more van primero"
  );

  const signals = await request("/api/pulse/signals", { token: viewer.token });
  assert.strictEqual(signals.status, 200);
  assert.equal(signals.data.signals.length, 2, "una señal por tema, sin duplicados");
});

mongoTest("pulso: respeta la audiencia de las publicaciones", async () => {
  const author = await register("Autora");
  const follower = await register("Seguidora");
  const stranger = await register("Desconocida");
  await request(`/api/users/${author.id}/follow`, { method: "POST", token: follower.token });

  await createPost(author.token, {
    content: "Solo para seguidores",
    audience: { type: "followers" }
  });
  await createPost(author.token, { content: "Público del pulso" });

  const asFollower = await request("/api/pulse", { token: follower.token });
  const followerContents = asFollower.data.posts.map((post) => post.content);
  assert.ok(followerContents.includes("Solo para seguidores"), "la seguidora ve la privada");
  assert.ok(followerContents.includes("Público del pulso"));

  const asStranger = await request("/api/pulse", { token: stranger.token });
  const strangerContents = asStranger.data.posts.map((post) => post.content);
  assert.ok(!strangerContents.includes("Solo para seguidores"), "quien no sigue no ve la privada");
  assert.ok(strangerContents.includes("Público del pulso"));
});

mongoTest("pulso: una publicación legada sin content se sirve como texto, no como undefined", async () => {
  const author = await register("Legado");
  const viewer = await register("Lectora legado");

  // Documento legado: escrito sin el campo `content` (no lo aplica el esquema
  // al leer con lean()). Es la forma exacta que hizo fallar el test en Atlas.
  const legacyId = new mongoose.Types.ObjectId();
  await Post.collection.insertOne({
    _id: legacyId,
    author: new mongoose.Types.ObjectId(author.id),
    audience: { type: "public" },
    hashtags: [],
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const session = await request("/api/pulse?limit=20", { token: viewer.token });
  assert.strictEqual(session.status, 200, JSON.stringify(session.data));

  for (const post of session.data.posts) {
    assert.equal(typeof post.content, "string", `publicación ${post._id} sin content textual`);
  }

  const legacy = session.data.posts.find((post) => post._id === String(legacyId));
  assert.ok(legacy, "la publicación legada pública es elegible para el Pulso");
  assert.equal(legacy.content, "", "el valor por defecto del esquema es cadena vacía");
});

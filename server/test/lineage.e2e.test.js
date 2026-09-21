const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

/**
 * LINAJE CREATIVO (Fase 7) — contratos con MongoDB real: remix con
 * atribución verificada, etiquetado IA de Kairos y visibilidad.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-lineage-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const User = require("../src/modules/users/User");
const Post = require("../src/modules/posts/Post");

const mongoConfigured = Boolean(process.env.MONGODB_URI);
const tempDatabaseName = `kronos_e2e_${crypto.randomBytes(6).toString("hex")}`;
const PASSWORD = "KronosLineage123!";
let baseUrl;
let connected = false;

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) return t.skip("Requiere MONGODB_URI real (base temporal kronos_e2e_*). Sin URI no se simula persistencia.");
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

test.before(async () => {
  if (mongoConfigured) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: tempDatabaseName, serverSelectionTimeoutMS: 15000 });
    connected = true;
    await Promise.all([User.deleteMany({}), Post.deleteMany({})]);
  }
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (connected) {
    if (tempDatabaseName.startsWith("kronos_e2e_")) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

mongoTest("lineage: el remix conserva la media original y la atribución la fija el servidor", async () => {
  const author = await register("Autora");
  const remixer = await register("Remixadora");
  await request(`/api/users/${author.id}/follow`, { method: "POST", token: remixer.token });

  const original = await createPost(author.token, {
    content: "Obra original",
    media: { url: "/uploads/media/e2e-obra.jpg", type: "image", alt: "Obra" }
  });

  // El cliente no puede falsificar linaje de remix en la creación genérica.
  const fake = await request("/api/posts", {
    method: "POST",
    token: remixer.token,
    body: { content: "falso remix", lineage: { tool: "remix", derivedFrom: original._id } }
  });
  assert.strictEqual(fake.status, 400, JSON.stringify(fake.data));

  const remix = await request(`/api/posts/${original._id}/remix`, {
    method: "POST",
    token: remixer.token,
    body: { content: "Mi versión" }
  });
  assert.strictEqual(remix.status, 201, JSON.stringify(remix.data));
  const remixPost = remix.data.post;
  assert.equal(remixPost.lineage.tool, "remix");
  assert.equal(remixPost.lineage.derivedFrom, String(original._id));
  assert.equal(remixPost.lineage.derivedFromAuthor.username, author.username, "la atribución nombra a la autora original");
  assert.equal(remixPost.media.url, original.media.url, "la media original se conserva");
  assert.equal(remixPost.author.username, remixer.username);

  // El linaje persiste en la base y es consultable.
  const stored = await Post.findById(remixPost._id).lean();
  assert.equal(String(stored.lineage.derivedFrom), String(original._id));

  const detail = await request(`/api/posts/${remixPost._id}`, { token: remixer.token });
  assert.equal(detail.data.post.lineage.derivedFromAuthor.username, author.username);
});

mongoTest("lineage: las publicaciones de Kairos llegan etiquetadas como IA", async () => {
  const creator = await register("Creadora");
  const viewer = await register("Lectora");
  await request(`/api/users/${creator.id}/follow`, { method: "POST", token: viewer.token });

  const published = await createPost(creator.token, {
    content: "Generado con Kairos",
    media: { url: "/uploads/media/e2e-kairos.png", type: "image", alt: "Generación" },
    lineage: { tool: "kairos-image", aiGenerated: true }
  });
  assert.equal(published.lineage.tool, "kairos-image");
  assert.equal(published.lineage.aiGenerated, true);
  assert.equal(published.lineage.derivedFrom, null);

  // Sin linaje declarado, la publicación es honesta: sin etiqueta.
  const manual = await createPost(creator.token, { content: "Foto propia" });
  assert.equal(manual.lineage.aiGenerated, false);

  const feed = await request("/api/posts", { token: viewer.token });
  const kairosPost = feed.data.posts.find((post) => post._id === published._id);
  const manualPost = feed.data.posts.find((post) => post._id === manual._id);
  assert.equal(kairosPost.lineage.aiGenerated, true);
  assert.equal(manualPost.lineage.aiGenerated, false);
});

mongoTest("lineage: no se puede remezclar lo que no se puede ver", async () => {
  const author = await register("Autora");
  const stranger = await register("Desconocida");

  const privatePost = await createPost(author.token, {
    content: "Solo seguidores",
    media: { url: "/uploads/media/e2e-privada.jpg", type: "image" },
    audience: { type: "followers" }
  });

  const blocked = await request(`/api/posts/${privatePost._id}/remix`, {
    method: "POST",
    token: stranger.token,
    body: { content: "remix no autorizado" }
  });
  assert.strictEqual(blocked.status, 403, "sin acceso a la original no hay remix");

  const textOnly = await createPost(author.token, { content: "Solo texto" });
  const noMedia = await request(`/api/posts/${textOnly._id}/remix`, {
    method: "POST",
    token: stranger.token
  });
  assert.strictEqual(noMedia.status, 409, "sin media no hay remix");
  const follower = author;
  const ownRemix = await request(`/api/posts/${privatePost._id}/remix`, {
    method: "POST",
    token: follower.token
  });
  assert.strictEqual(ownRemix.status, 201, "la autora puede remezclar su propia pieza");
});

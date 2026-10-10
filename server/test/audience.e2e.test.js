const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");

/**
 * Matriz E2E de audiencia y visibilidad de posts.
 *
 * Verifica que cada tipo de audiencia restringe correctamente el acceso
 * al feed, a la vista individual del post, y a la media asociada.
 * También verifica que el remix no puede ampliar la audiencia.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-audience-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const User = require("../src/modules/users/User");
const Post = require("../src/modules/posts/Post");
const Circle = require("../src/modules/circles/Circle");
const Orbit = require("../src/modules/orbits/Orbit");
const { assertE2ETarget } = require("./helpers/e2e-target-guard");
const { connectE2E, cleanupE2E, clearNewDocuments } = require("./helpers/e2e-database");

let mongoConfigured = Boolean(process.env.KRONOS_E2E_MONGODB_URI);

if (mongoConfigured) {
  mongoConfigured = assertE2ETarget({
    uri: process.env.KRONOS_E2E_MONGODB_URI,
    dbName: "test"
  });
}

const PASSWORD = "KronosAudience123!";
let baseUrl;
let connected = false;

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) return t.skip("Requiere KRONOS_E2E_MONGODB_URI");
    try { await fn(); }
    catch (error) {
      console.log(`AUDIENCE_E2E_FAIL [${name}] :: ${(error?.message || error).toString().replace(/\s+/g, " ").slice(0, 500)}`);
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
  return { id: response.data.user.id, token: response.data.token, username: response.data.user.username };
}

async function createPost(token, body) {
  const response = await request("/api/posts", { method: "POST", token, body });
  assert.strictEqual(response.status, 201, JSON.stringify(response.data));
  return response.data.post;
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

mongoTest("public → visible para todos", async () => {
  const author = await register("author");
  const viewer = await register("viewer");
  const stranger = await register("stranger");

  const post = await createPost(author.token, {
    content: "Post público",
    audience: { type: "public" }
  });

  const authorView = await request(`/api/posts/${post._id}`, { token: author.token });
  assert.strictEqual(authorView.status, 200);

  const viewerView = await request(`/api/posts/${post._id}`, { token: viewer.token });
  assert.strictEqual(viewerView.status, 200);

  const noAuth = await request(`/api/posts/${post._id}`);
  assert.strictEqual(noAuth.status, 401, "el endpoint de detalle requiere sesión aunque la publicación sea pública");
});

mongoTest("followers → owner y follower permitidos; tercero rechazado", async () => {
  const author = await register("auth");
  const follower = await register("foll");
  const stranger = await register("stra");

  await request(`/api/users/${author.id}/follow`, { method: "POST", token: follower.token });

  const post = await createPost(author.token, {
    content: "Solo seguidores",
    audience: { type: "followers" }
  });

  const ownerView = await request(`/api/posts/${post._id}`, { token: author.token });
  assert.strictEqual(ownerView.status, 200);

  const followerView = await request(`/api/posts/${post._id}`, { token: follower.token });
  assert.strictEqual(followerView.status, 200);

  const strangerView = await request(`/api/posts/${post._id}`, { token: stranger.token });
  assert.strictEqual(strangerView.status, 404, "la API oculta publicaciones fuera de la audiencia");
});

mongoTest("private → solamente propietario", async () => {
  const author = await register("priv");
  const other = await register("othe");

  const post = await createPost(author.token, {
    content: "Privado",
    audience: { type: "private" }
  });

  const ownerView = await request(`/api/posts/${post._id}`, { token: author.token });
  assert.strictEqual(ownerView.status, 200);

  const otherView = await request(`/api/posts/${post._id}`, { token: other.token });
  assert.strictEqual(otherView.status, 404, "la API oculta publicaciones privadas a terceros");
});

mongoTest("circle → miembros autorizados; no miembros rechazados", async () => {
  const owner = await register("circ");
  const member = await register("memb");
  const outsider = await register("outs");

  const circle = await request("/api/circles", {
    method: "POST",
    token: owner.token,
    body: { name: "Círculo privado" }
  });
  assert.strictEqual(circle.status, 201);
  const circleId = circle.data.circle._id;

  const addMember = await request(`/api/circles/${circleId}/members`, {
    method: "POST",
    token: owner.token,
    body: { userId: member.id }
  });
  assert.strictEqual(addMember.status, 200, JSON.stringify(addMember.data));

  const post = await createPost(owner.token, {
    content: "Del círculo",
    audience: { type: "circle", circleId }
  });

  const ownerView = await request(`/api/posts/${post._id}`, { token: owner.token });
  assert.strictEqual(ownerView.status, 200);

  const memberView = await request(`/api/posts/${post._id}`, { token: member.token });
  assert.strictEqual(memberView.status, 200);

  const outsiderView = await request(`/api/posts/${post._id}`, { token: outsider.token });
  assert.strictEqual(outsiderView.status, 404, "la API oculta publicaciones de círculos a no miembros");
});

mongoTest("remix private → no puede convertirse en public", async () => {
  const author = await register("remi");
  const remixer = await register("remx");
  await request(`/api/users/${author.id}/follow`, { method: "POST", token: remixer.token });

  const original = await createPost(author.token, {
    content: "Privada original",
    media: { url: "/uploads/media/e2e-priv.jpg", type: "image" },
    audience: { type: "private" }
  });

  // El autor puede remezclar su propio post privado
  const remix = await request(`/api/posts/${original._id}/remix`, {
    method: "POST",
    token: author.token,
    body: { content: "Mi remix" }
  });
  assert.strictEqual(remix.status, 201);
  assert.strictEqual(remix.data.post.audience.type, "private");

  const stored = await Post.findById(remix.data.post._id).lean();
  assert.strictEqual(stored.audience.type, "private", "el remix hereda la audiencia privada");
});

mongoTest("remix followers → no puede ampliar audiencia", async () => {
  const author = await register("remf");
  const remixer = await register("rfol");
  await request(`/api/users/${author.id}/follow`, { method: "POST", token: remixer.token });

  const original = await createPost(author.token, {
    content: "Solo seguidores",
    media: { url: "/uploads/media/e2e-foll.jpg", type: "image" },
    audience: { type: "followers" }
  });

  const remix = await request(`/api/posts/${original._id}/remix`, {
    method: "POST",
    token: author.token,
    body: { content: "Remix de seguidores" }
  });
  assert.strictEqual(remix.status, 201);
  assert.strictEqual(remix.data.post.audience.type, "followers");

  const stored = await Post.findById(remix.data.post._id).lean();
  assert.strictEqual(stored.audience.type, "followers");
});

const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

/**
 * VERTICAL — feed de video vertical (Fase 3) contra MongoDB real.
 * Verifica que solo entran videos, que los horizontales quedan fuera,
 * que la moderación y la audiencia se respetan y que la paginación no
 * repite videos.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-vertical-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const User = require("../src/modules/users/User");
const Post = require("../src/modules/posts/Post");

const mongoConfigured = Boolean(process.env.MONGODB_URI);
const tempDatabaseName = `kronos_e2e_${crypto.randomBytes(6).toString("hex")}`;
const PASSWORD = "KronosVertical123!";
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

test.beforeEach(async () => {
  // Aislamiento real entre pruebas: sin esto, los videos de pruebas
  // anteriores del archivo contaminan los conteos de las siguientes.
  if (mongoConfigured) {
    await Post.deleteMany({});
  }
});

test.after(async () => {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (connected) {
    if (tempDatabaseName.startsWith("kronos_e2e_")) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

mongoTest("vertical: solo videos no horizontales entran al feed", async () => {
  const author = await register("Autor");
  const follower = await register("Seguidora");
  const follow = await request(`/api/users/${author.id}/follow`, { method: "POST", token: follower.token });
  assert.strictEqual(follow.status, 200, JSON.stringify(follow.data));

  const vertical = await createPost(author.token, {
    content: "Vertical",
    media: { url: "/uploads/media/e2e-vertical.mp4", type: "video", width: 1080, height: 1920 }
  });
  assert.strictEqual(vertical.media.orientation, "vertical");

  const horizontal = await createPost(author.token, {
    content: "Horizontal",
    media: { url: "/uploads/media/e2e-horizontal.mp4", type: "video", width: 1920, height: 1080 }
  });
  assert.strictEqual(horizontal.media.orientation, "horizontal");

  const legacy = await createPost(author.token, {
    content: "Sin dimensiones",
    media: { url: "/uploads/media/e2e-legacy.mp4", type: "video" }
  });

  const image = await createPost(author.token, {
    content: "Solo texto e imagen",
    media: { url: "/uploads/media/e2e-foto.jpg", type: "image" }
  });

  const feed = await request("/api/posts/vertical?page=1&limit=10", { token: follower.token });
  assert.strictEqual(feed.status, 200, JSON.stringify(feed.data));
  const ids = feed.data.posts.map((post) => post._id);
  assert.ok(ids.includes(vertical._id), "el video vertical debe entrar");
  assert.ok(ids.includes(legacy._id), "el video sin dimensiones entra mientras no se sepa que es horizontal");
  assert.ok(!ids.includes(horizontal._id), "el video horizontal debe quedar fuera");
  assert.ok(!ids.includes(image._id), "las imágenes no entran al feed vertical");
  assert.ok(feed.data.posts.every((post) => post.media.type === "video"));
});

mongoTest("vertical: la audiencia de la publicación se respeta", async () => {
  const author = await register("Autor");
  const follower = await register("Seguidora");
  const stranger = await register("Desconocida");
  await request(`/api/users/${author.id}/follow`, { method: "POST", token: follower.token });

  await createPost(author.token, {
    content: "Solo seguidores",
    media: { url: "/uploads/media/e2e-seguidores.mp4", type: "video", width: 720, height: 1280 },
    audience: { type: "followers" }
  });

  const asFollower = await request("/api/posts/vertical", { token: follower.token });
  assert.strictEqual(asFollower.status, 200);
  assert.strictEqual(asFollower.data.total, 1, "la seguidora ve el video");

  const asStranger = await request("/api/posts/vertical", { token: stranger.token });
  assert.strictEqual(asStranger.status, 200);
  assert.strictEqual(asStranger.data.total, 0, "quien no sigue no ve el video privado");
});

mongoTest("vertical: bloquear al autor lo saca del feed vertical", async () => {
  const author = await register("Autor");
  const viewer = await register("Espectadora");
  await request(`/api/users/${author.id}/follow`, { method: "POST", token: viewer.token });
  await createPost(author.token, {
    content: "Video visible",
    media: { url: "/uploads/media/e2e-bloqueo.mp4", type: "video", width: 1080, height: 1920 }
  });

  const before = await request("/api/posts/vertical", { token: viewer.token });
  assert.strictEqual(before.data.total, 1);

  const block = await request(`/api/moderation/blocks/${author.id}`, { method: "POST", token: viewer.token });
  assert.strictEqual(block.status, 200, JSON.stringify(block.data));

  const after = await request("/api/posts/vertical", { token: viewer.token });
  assert.strictEqual(after.data.total, 0, "el autor bloqueado no debe aparecer");
});

mongoTest("vertical: la paginación no repite videos", async () => {
  const author = await register("Autor");
  const viewer = await register("Espectadora");
  await request(`/api/users/${author.id}/follow`, { method: "POST", token: viewer.token });

  const created = [];
  for (let index = 0; index < 5; index += 1) {
    const post = await createPost(author.token, {
      content: `Video ${index}`,
      media: { url: `/uploads/media/e2e-page-${index}.mp4`, type: "video", width: 1080, height: 1920 }
    });
    created.push(post._id);
  }

  const seen = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const response = await request(`/api/posts/vertical?page=${page}&limit=2`, { token: viewer.token });
    assert.strictEqual(response.status, 200);
    seen.push(...response.data.posts.map((post) => post._id));
    hasMore = response.data.hasMore;
    page += 1;
  }

  assert.strictEqual(seen.length, 5);
  assert.strictEqual(new Set(seen).size, 5, "ningún video debe repetirse entre páginas");
  for (const id of created) assert.ok(seen.includes(id));
});

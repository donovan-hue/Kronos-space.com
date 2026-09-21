const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

/**
 * STORIES (Fase 3) — contratos con MongoDB real. Verifica que las
 * historias expiran de verdad, que la audiencia y la moderación se
 * respetan contra persistencia real y que vistas/respuestas no filtran
 * usuarios. No repite suites de bloques cerrados.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-stories-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const User = require("../src/modules/users/User");
const Story = require("../src/modules/stories/Story");
const Circle = require("../src/modules/circles/Circle");

const mongoConfigured = Boolean(process.env.MONGODB_URI);
const tempDatabaseName = `kronos_e2e_${crypto.randomBytes(6).toString("hex")}`;
const PASSWORD = "KronosStories123!";
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

async function createStory(token, payload) {
  const response = await request("/api/stories", { method: "POST", token, body: payload });
  assert.strictEqual(response.status, 201, JSON.stringify(response.data));
  return response.data.story;
}

const MEDIA = { url: "/uploads/media/e2e-historia.jpg", type: "image", mimeType: "image/jpeg", size: 2048, alt: "Historia E2E" };

test.before(async () => {
  if (mongoConfigured) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: tempDatabaseName, serverSelectionTimeoutMS: 15000 });
    connected = true;
    await Promise.all([User.deleteMany({}), Story.deleteMany({}), Circle.deleteMany({})]);
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

mongoTest("stories: crear exige media de Kronos y fija expiración de 24 h en el servidor", async () => {
  const author = await register("Autor");
  const badUrl = await request("/api/stories", { method: "POST", token: author.token, body: { media: { url: "https://cdn.terceros.dev/x.jpg", type: "image" } } });
  assert.strictEqual(badUrl.status, 400);

  const story = await createStory(author.token, { media: MEDIA, caption: "Hola mundo" });
  assert.strictEqual(story.caption, "Hola mundo");
  assert.strictEqual(story.isActive, true);
  assert.strictEqual(story.mine, true);
  assert.strictEqual(story.viewsCount, 0);
  const ttlHours = (new Date(story.expiresAt).getTime() - Date.now()) / 3600000;
  assert.ok(ttlHours > 23.9 && ttlHours <= 24, `expiración inesperada: ${ttlHours}`);
  assert.ok(!("views" in story) && !("replies" in story));
});

mongoTest("stories: la bandeja solo trae historias activas de quienes sigues, con no vistas", async () => {
  const author = await register("Autor");
  const follower = await register("Seguidora");
  const stranger = await register("Desconocida");

  const story = await createStory(author.token, { media: MEDIA });
  const follow = await request(`/api/users/${author.id}/follow`, { method: "POST", token: follower.token });
  assert.strictEqual(follow.status, 200, JSON.stringify(follow.data));

  const followerTray = await request("/api/stories", { token: follower.token });
  assert.strictEqual(followerTray.status, 200);
  const followerGroup = followerTray.data.groups.find((group) => String(group.author._id) === author.id);
  assert.ok(followerGroup, "la seguidora debería ver al autor en la bandeja");
  assert.strictEqual(followerGroup.hasUnseen, true);
  assert.strictEqual(followerGroup.stories[0]._id, story._id);

  const strangerTray = await request("/api/stories", { token: stranger.token });
  assert.strictEqual(strangerTray.status, 200);
  assert.ok(!strangerTray.data.groups.some((group) => String(group.author._id) === author.id), "quien no sigue no debería ver la historia");
});

mongoTest("stories: las vistas son idempotentes y solo el autor ve quién y qué respondió", async () => {
  const author = await register("Autor");
  const viewer = await register("Espectadora");

  const story = await createStory(author.token, { media: MEDIA });
  const first = await request(`/api/stories/${story._id}/view`, { method: "POST", token: viewer.token });
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.data.viewsCount, 1);
  const second = await request(`/api/stories/${story._id}/view`, { method: "POST", token: viewer.token });
  assert.strictEqual(second.data.viewsCount, 1, "marcar dos veces no debe duplicar la vista");

  const reply = await request(`/api/stories/${story._id}/reply`, { method: "POST", token: viewer.token, body: { text: "Me encanta" } });
  assert.strictEqual(reply.status, 201, JSON.stringify(reply.data));
  assert.strictEqual(reply.data.repliesCount, 1);

  const ownReply = await request(`/api/stories/${story._id}/reply`, { method: "POST", token: author.token, body: { text: "gracias" } });
  assert.strictEqual(ownReply.status, 400, "el autor no puede responderse a sí mismo");

  const strangerReplies = await request(`/api/stories/${story._id}/replies`, { token: viewer.token });
  assert.strictEqual(strangerReplies.status, 403, "solo el autor lee las respuestas");
  const strangerViews = await request(`/api/stories/${story._id}/views`, { token: viewer.token });
  assert.strictEqual(strangerViews.status, 403, "solo el autor lee las vistas");

  const authorReplies = await request(`/api/stories/${story._id}/replies`, { token: author.token });
  assert.strictEqual(authorReplies.status, 200);
  assert.strictEqual(authorReplies.data.replies.length, 1);
  assert.strictEqual(authorReplies.data.replies[0].user._id, viewer.id);

  const authorViews = await request(`/api/stories/${story._id}/views`, { token: author.token });
  assert.strictEqual(authorViews.status, 200);
  assert.strictEqual(authorViews.data.viewers[0].username, viewer.username);
});

mongoTest("stories: la audiencia seguidores y círculo se respeta contra la base real", async () => {
  const author = await register("Autor");
  const follower = await register("Seguidora");
  const outsider = await register("De fuera");

  const follow = await request(`/api/users/${author.id}/follow`, { method: "POST", token: follower.token });
  assert.strictEqual(follow.status, 200);

  const circleResponse = await request("/api/circles", { method: "POST", token: author.token, body: { name: "Íntimos" } });
  assert.strictEqual(circleResponse.status, 201, JSON.stringify(circleResponse.data));
  const circleId = circleResponse.data.circle._id;
  const addMember = await request(`/api/circles/${circleId}/members`, { method: "POST", token: author.token, body: { userId: follower.id } });
  assert.strictEqual(addMember.status, 200, JSON.stringify(addMember.data));

  const followersStory = await createStory(author.token, { media: MEDIA, audience: { type: "followers" } });
  const circleStory = await createStory(author.token, { media: MEDIA, audience: { type: "circle", circleId } });

  const asFollower = await request("/api/stories", { token: follower.token });
  const ids = asFollower.data.groups.flatMap((group) => group.stories.map((item) => item._id));
  assert.ok(ids.includes(followersStory._id), "la seguidora ve la historia de seguidores");
  assert.ok(ids.includes(circleStory._id), "la miembro del círculo ve la historia de círculo");

  const asOutsiderFollowers = await request(`/api/stories/${followersStory._id}`, { token: outsider.token });
  assert.strictEqual(asOutsiderFollowers.status, 403, "quien no sigue no puede abrir la historia de seguidores");
  const asOutsiderCircle = await request(`/api/stories/${circleStory._id}`, { token: outsider.token });
  assert.strictEqual(asOutsiderCircle.status, 403, "quien no está en el círculo no puede abrir la historia de círculo");
});

mongoTest("stories: las historias expiran de verdad y solo el autor las conserva en su archivo", async () => {
  const author = await register("Autor");
  const viewer = await register("Espectadora");

  const active = await createStory(author.token, { media: MEDIA, caption: "Viva" });
  const expired = await Story.create({
    author: author.id,
    media: { url: "/uploads/media/e2e-vieja.jpg", type: "image" },
    caption: "Ya expirada",
    audience: { type: "public" },
    expiresAt: new Date(Date.now() - 60 * 60 * 1000)
  });

  const viewerSees = await request(`/api/stories/${expired._id}`, { token: viewer.token });
  assert.strictEqual(viewerSees.status, 404, "una historia expirada no debe ser visible para nadie más");

  const tray = await request("/api/stories", { token: viewer.token });
  assert.strictEqual(tray.status, 200);
  assert.ok(!tray.data.groups.some((group) => group.stories.some((item) => item._id === String(expired._id))), "la bandeja excluye expiradas");

  const archive = await request("/api/stories/me/archive", { token: author.token });
  assert.strictEqual(archive.status, 200);
  const archiveIds = archive.data.stories.map((item) => item._id);
  assert.ok(archiveIds.includes(String(expired._id)), "el archivo conserva la expirada");
  assert.ok(archiveIds.includes(active._id), "el archivo también lista la activa");
  const expiredEntry = archive.data.stories.find((item) => item._id === String(expired._id));
  assert.strictEqual(expiredEntry.isActive, false);

  const deleteByViewer = await request(`/api/stories/${active._id}`, { method: "DELETE", token: viewer.token });
  assert.strictEqual(deleteByViewer.status, 403, "solo el autor elimina");
  const deleteByAuthor = await request(`/api/stories/${active._id}`, { method: "DELETE", token: author.token });
  assert.strictEqual(deleteByAuthor.status, 200);
  const gone = await request(`/api/stories/${active._id}`, { token: author.token });
  assert.strictEqual(gone.status, 404);
});

mongoTest("stories: bloquear al autor lo saca de la bandeja sin tocar sus historias", async () => {
  const author = await register("Autor");
  const viewer = await register("Espectadora");

  await createStory(author.token, { media: MEDIA });
  const block = await request(`/api/moderation/blocks/${author.id}`, { method: "POST", token: viewer.token });
  assert.strictEqual(block.status, 200, JSON.stringify(block.data));

  const tray = await request("/api/stories", { token: viewer.token });
  assert.strictEqual(tray.status, 200);
  assert.ok(!tray.data.groups.some((group) => String(group.author._id) === author.id), "el autor bloqueado no debe aparecer");

  const stillThere = await Story.countDocuments({ author: author.id });
  assert.strictEqual(stillThere, 1, "el bloqueo no borra historias del autor");
});

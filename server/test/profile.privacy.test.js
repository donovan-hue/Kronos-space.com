const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { publicUser, normalizePrivacy, privacyUpdates } = require("../src/modules/users/profilePrivacy");
const profilePostFilter = require("../src/modules/posts/profilePostFilter");
const normalizePost = require("../src/modules/posts/normalizePost");
const User = require("../src/modules/users/User");
const Post = require("../src/modules/posts/Post");
const session = require("../src/modules/auth/session.service");
const previousSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "profile-privacy-isolated-tests";
mock.method(session, "isSessionRevoked", async () => false);
const usersRouter = require("../src/modules/users/users.routes");
const postsRouter = require("../src/modules/posts/posts.routes");
const owner = "507f1f77bcf86cd799439011", visitor = "507f1f77bcf86cd799439012";
const privateUser = { _id: owner, username: "example", bio: "Not public", email: "fictional@example.com", passwordHash: "secret", followers: [visitor], following: [visitor], profilePrivacy: { showBio: false, showFollowCounts: false, discoverable: false } };
function query(value) {
  const chain = { select: () => chain, sort: () => chain, populate: () => chain, skip: () => chain, limit: () => chain, lean: async () => value };
  return chain;
}

// KRONOS-UI-011: las consultas de feed/perfil ahora revisan bloqueos,
// silencios y publicaciones ocultas. Sin MongoDB se simulan vacías.
const Block = require("../src/modules/moderation/Block");
const Mute = require("../src/modules/moderation/Mute");
const HiddenPost = require("../src/modules/moderation/HiddenPost");
function mockModeration(t) {
  t.mock.method(Block, "find", () => query([]));
  t.mock.method(Block, "exists", async () => null);
  t.mock.method(Mute, "find", () => query([]));
  t.mock.method(Mute, "exists", async () => null);
  t.mock.method(HiddenPost, "find", () => query([]));
}
let server, base;
before(async () => {
  const app = express(); app.use(express.json()); app.use("/users", usersRouter); app.use("/posts", postsRouter);
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve)); mock.restoreAll();
  if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
});
async function request(method, path, viewer = visitor, body) {
  const headers = { "Content-Type": "application/json" };
  if (viewer) headers.Authorization = `Bearer ${jwt.sign({ id: viewer }, process.env.JWT_SECRET, { expiresIn: "1m" })}`;
  return fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

test("usuarios anteriores siguen visibles por defecto; proyección no filtra secretos", () => {
  assert.deepEqual(normalizePrivacy(), { showBio: true, showFollowCounts: true, discoverable: true });
  const visible = publicUser({ ...privateUser, profilePrivacy: undefined }, visitor);
  assert.equal(visible.bio, privateUser.bio);
  for (const key of ["email", "passwordHash", "followers", "following", "profilePrivacy"]) assert.equal(visible[key], undefined);
  const hidden = publicUser(privateUser, visitor);
  assert.equal(hidden.bio, ""); assert.equal(hidden.followersCount, null); assert.equal(hidden.followingCount, null);
  assert.equal(hidden.isFollowing, true);
  assert.equal(publicUser(privateUser, owner).bio, privateUser.bio);
  assert.equal(publicUser(privateUser, owner).followersCount, 1);
});

test("solo admite ajustes booleanos conocidos y conserva campos no enviados", () => {
  assert.deepEqual(privacyUpdates({ showBio: false }), { "profilePrivacy.showBio": false });
  for (const body of [{}, [], null, { showBio: "false" }, { showBio: false, userId: owner }, { passwordHash: "x" }]) assert.equal(privacyUpdates(body), null);
});

test("preferencias requieren sesión, se guardan solo para req.user y no cambian credenciales", async t => {
  const update = t.mock.method(User, "findByIdAndUpdate", () => query(privateUser));
  assert.equal((await request("PATCH", "/users/me/privacy", null, { showBio: false })).status, 401);
  assert.equal((await request("PATCH", "/users/me/privacy", visitor, { showBio: "false" })).status, 400);
  assert.equal(update.mock.callCount(), 0);
  const response = await request("PATCH", "/users/me/privacy", owner, { showBio: false });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).privacy, privateUser.profilePrivacy);
  assert.deepEqual(update.mock.calls[0].arguments[0], owner);
  assert.deepEqual(update.mock.calls[0].arguments[1], { $set: { "profilePrivacy.showBio": false } });
});

test("perfil por ID y username aplican privacidad, búsqueda excluye no descubribles", async t => {
  mockModeration(t);
  t.mock.method(User, "findById", () => query(privateUser));
  t.mock.method(User, "findOne", () => query(privateUser));
  // Los conteos se calculan con agregación (sin traer los arrays).
  t.mock.method(User, "aggregate", async () => [{ _id: owner, followersCount: 1, followingCount: 1, isFollowing: true }]);
  const search = t.mock.method(User, "find", () => query([]));
  for (const path of [`/users/${owner}`, "/users/username/example"]) {
    const data = await (await request("GET", path)).json();
    assert.equal(data.bio, ""); assert.equal(data.followersCount, null); assert.equal(data.email, undefined);
  }
  await request("GET", "/users/search?q=example");
  assert.deepEqual(search.mock.calls[0].arguments[0]["profilePrivacy.discoverable"], { $ne: false });
});

test("listas de seguidores/siguiendo son paginadas, reales y respetan privacidad", async t => {
  mockModeration(t);
  const visibleFollower = { _id: visitor, username: "visitor", displayName: "Visitante", avatar: "", bio: "Bio", followers: [], following: [owner], profilePrivacy: {} };
  let target = { ...privateUser, profilePrivacy: { ...privateUser.profilePrivacy, showFollowCounts: true } };
  t.mock.method(User, "findById", () => query(target));
  const find = t.mock.method(User, "find", () => query([visibleFollower]));
  // Total visible ($setDifference) + conteos de la página, en agregación.
  t.mock.method(User, "aggregate", async () => [{ _id: visitor, rawTotal: 1, total: 1, followersCount: 0, followingCount: 1, isFollowing: false }]);

  const response = await request("GET", `/users/${owner}/followers?page=1&limit=1`, visitor);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.users.length, 1);
  assert.equal(data.users[0].username, "visitor");
  assert.equal(data.hasMore, false);
  assert.deepEqual(find.mock.calls[0].arguments[0]._id.$in.map(String), [visitor]);

  target = { ...privateUser, profilePrivacy: { ...privateUser.profilePrivacy, showFollowCounts: false } };
  const hidden = await request("GET", `/users/${owner}/following`, visitor);
  assert.equal(hidden.status, 403);
});

test("filtros de pestaña mantienen contrato histórico y prohíben guardados por perfil", () => {
  assert.deepEqual(profilePostFilter(owner), { author: owner });
  assert.deepEqual(profilePostFilter(owner, "posts"), { author: owner, repostOf: null });
  assert.deepEqual(profilePostFilter(owner, "reposts"), { author: owner, repostOf: { $ne: null } });
  const mediaFilter = profilePostFilter(owner, "media");
  assert.equal(mediaFilter.author, owner);
  assert.deepEqual(mediaFilter.$or[0]["media.url"], { $type: "string", $ne: "" });
  assert.deepEqual(mediaFilter.$or[1]["mediaItems.0.url"], { $type: "string", $ne: "" });
  assert.equal(profilePostFilter(owner, "saved"), null);
  assert.equal(profilePostFilter(owner, { $ne: null }), null);
});

test("paginación filtra conteo y resultados con la misma pestaña", async t => {
  mockModeration(t);
  const find = t.mock.method(Post, "find", () => query([]));
  const count = t.mock.method(Post, "countDocuments", async () => 0);
  for (const tab of ["posts", "media", "reposts"]) {
    assert.equal((await request("GET", `/posts/user/${owner}?tab=${tab}&page=2`)).status, 200);
    // Se conserva el filtro histórico de la pestaña y se añade el
    // filtro de moderación del visitante (ocultas/bloqueos/silencios).
    for (const [key, value] of Object.entries(profilePostFilter(owner, tab))) {
      assert.deepEqual(find.mock.calls.at(-1).arguments[0][key], value);
      assert.deepEqual(count.mock.calls.at(-1).arguments[0][key], value);
    }
    assert.deepEqual(find.mock.calls.at(-1).arguments[0]["moderation.hidden"], { $ne: true });
  }
  assert.equal((await request("GET", `/posts/user/${owner}?tab=saved`)).status, 400);
});

test("guardados siempre usan identidad de sesión e ignoran un userId ajeno", async t => {
  mockModeration(t);
  const find = t.mock.method(Post, "find", () => query([]));
  t.mock.method(Post, "countDocuments", async () => 0);
  assert.equal((await request("GET", `/posts/saved?userId=${owner}`, visitor)).status, 200);
  assert.equal(String(find.mock.calls[0].arguments[0].savedBy), visitor);
});

test("ni publicaciones ni reposts exponen identidades de savedBy", () => {
  const post = { _id: "1", content: "Public", likes: [], savedBy: [owner], repostOf: { _id: "2", content: "Original", savedBy: [visitor] } };
  const result = normalizePost(post, visitor);
  assert.equal(result.savedBy, undefined); assert.equal(result.repostOf.savedBy, undefined);
  assert.equal(result.saved, false); assert.equal(result.repostOf.saved, true);
  assert.equal(post.savedBy.length, 1); // serializer must not mutate DB data
});

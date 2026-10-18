const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const mongoose = require("mongoose");

/**
 * V03 — certificación extremo a extremo de la capa social contra MongoDB real.
 *
 * NO usa dobles, ni persistencia simulada, ni base en memoria: exige
 * `KRONOS_E2E_MONGODB_URI` y trabaja en una base temporal propia que se
 * elimina al terminar. Las pruebas se omiten con motivo explícito si falta
 * la URI; nunca se dan por aprobadas sin ejecutarse.
 *
 * Cubre, con el contrato real de las rutas:
 * - registro, login, sesión, logout y usuario no autenticado.
 * - creación y lectura de usuario, perfil propio y ajeno.
 * - creación, lectura de feed, edición y eliminación de publicaciones.
 * - likes y reacciones (alternancia y tipo inválido).
 * - comentarios: creación, validación, borrado por autor y por dueño del post.
 * - follow/unfollow y efecto en el feed.
 * - permisos de recursos (privado, solo seguidores, ajeno) y errores HTTP.
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
  quiet: true
});

process.env.JWT_SECRET =
  process.env.JWT_SECRET || "kronos-v03-social-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");
const { assertE2ETarget } = require("./helpers/e2e-target-guard");
const { connectE2E, cleanupE2E, clearNewDocuments } = require("./helpers/e2e-database");

let mongoConfigured = Boolean(process.env.KRONOS_E2E_MONGODB_URI);

// Mismo nombre de base temporal que el resto de suites E2E: la guarda
// `assertE2ETarget` demuestra el destino antes de conectar.
const tempDatabaseName = "test";

if (mongoConfigured) {
  mongoConfigured = assertE2ETarget({
    uri: process.env.KRONOS_E2E_MONGODB_URI,
    dbName: tempDatabaseName
  });
}

const PASSWORD = "KronosV03Secure!";
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

async function request(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, data };
}

async function registerUser(label = "u") {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `v03.${label}.${suffix}@example.com`;
  const { status, data } = await request("/api/auth/register", {
    method: "POST",
    body: {
      username: `v03_${label}_${suffix}`.slice(0, 30),
      email,
      password: PASSWORD,
      displayName: `V03 ${label}`
    }
  });

  assert.strictEqual(status, 201, JSON.stringify(data));

  return {
    id: data.user.id,
    email,
    username: data.user.username,
    token: data.token,
    refreshToken: data.refreshToken
  };
}

async function login(email) {
  const { status, data } = await request("/api/auth/login", {
    method: "POST",
    body: { email, password: PASSWORD }
  });

  assert.strictEqual(status, 200, JSON.stringify(data));

  return data;
}

async function createPost(token, content, audience) {
  const body = audience ? { content, audience } : { content };
  const { status, data } = await request("/api/posts", {
    method: "POST",
    token,
    body
  });

  assert.strictEqual(status, 201, JSON.stringify(data));

  return data.post;
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
// Registro, login, sesión y no autenticado
// ---------------------------------------------------------------

mongoTest("V03 registro: crea usuario real y devuelve token de acceso", async () => {
  const user = await registerUser("reg");

  assert.ok(user.id, "id de usuario");
  assert.ok(user.token, "access token");
  assert.ok(user.refreshToken, "refresh token");
});

mongoTest("V03 registro: rechaza datos inválidos con 400 y sin token", async () => {
  const { status, data } = await request("/api/auth/register", {
    method: "POST",
    body: { username: "x", email: "no-es-correo", password: "corta", displayName: "" }
  });

  assert.strictEqual(status, 400, JSON.stringify(data));
  assert.strictEqual(data?.token, undefined);
});

mongoTest("V03 login: credenciales válidas entregan sesión y usuario", async () => {
  const user = await registerUser("log");
  const session = await login(user.email);

  assert.ok(session.token, "access token");
  assert.strictEqual(session.user.username, user.username);
});

mongoTest("V03 login: contraseña incorrecta responde 401 sin revelar el correo", async () => {
  const user = await registerUser("bad");
  const { status, data } = await request("/api/auth/login", {
    method: "POST",
    body: { email: user.email, password: "ContraseñaIncorrecta1!" }
  });

  assert.strictEqual(status, 401, JSON.stringify(data));
  assert.strictEqual(data?.token, undefined);
});

mongoTest("V03 sesión: el token válido se hidrata y el logout la revoca", async () => {
  const user = await registerUser("ses");
  const session = await login(user.email);

  const hydrated = await request("/api/auth/session", { token: session.token });
  assert.strictEqual(hydrated.status, 200, JSON.stringify(hydrated.data));
  assert.strictEqual(hydrated.data.valid, true);
  assert.strictEqual(hydrated.data.user.email, user.email);

  const logout = await request("/api/auth/logout", {
    method: "POST",
    token: session.token,
    body: { refreshToken: session.refreshToken }
  });
  assert.strictEqual(logout.status, 200, JSON.stringify(logout.data));

  const afterLogout = await request("/api/auth/session", { token: session.token });
  assert.strictEqual(afterLogout.status, 401);
});

mongoTest("V03 no autenticado: rutas sociales responden 401 sin tocar datos", async () => {
  const user = await registerUser("anon");
  const post = await createPost(user.token, "publicación para usuario anónimo");
  const anonymous = [
    ["GET", "/api/posts/feed"],
    ["POST", "/api/posts"],
    ["PATCH", `/api/posts/${post._id}`],
    ["DELETE", `/api/posts/${post._id}`],
    ["POST", `/api/posts/${post._id}/like`],
    ["POST", `/api/posts/${post._id}/reaction`],
    ["POST", `/api/posts/${post._id}/comments`],
    ["POST", `/api/users/${user.id}/follow`],
    ["GET", "/api/users/me"]
  ];

  for (const [method, path] of anonymous) {
    const response = await request(path, { method, body: method === "GET" ? undefined : {} });
    assert.strictEqual(response.status, 401, `${method} ${path} -> ${response.status}`);
  }

  const invalid = await request("/api/posts/feed", { token: "token.no.valido" });
  assert.strictEqual(invalid.status, 401);
});

// ---------------------------------------------------------------
// Perfil y usuario
// ---------------------------------------------------------------

mongoTest("V03 perfil: /users/me devuelve el propio perfil y PATCH lo persiste", async () => {
  const user = await registerUser("perfil");

  const me = await request("/api/users/me", { token: user.token });
  assert.strictEqual(me.status, 200, JSON.stringify(me.data));
  assert.strictEqual(me.data.username, user.username);

  const updated = await request("/api/users/me", {
    method: "PATCH",
    token: user.token,
    body: { bio: "Bio de certificación V03" }
  });
  assert.strictEqual(updated.status, 200, JSON.stringify(updated.data));
  assert.strictEqual(updated.data.bio, "Bio de certificación V03");

  const reread = await request(`/api/users/${user.id}`, { token: user.token });
  assert.strictEqual(reread.status, 200);
  assert.strictEqual(reread.data.bio, "Bio de certificación V03");
});

mongoTest("V03 perfil: errores HTTP esperados (400 ID inválido, 404 inexistente)", async () => {
  const user = await registerUser("errs");

  const badId = await request("/api/users/no-es-un-id", { token: user.token });
  assert.strictEqual(badId.status, 400);

  const missing = await request(`/api/users/${new mongoose.Types.ObjectId()}`, { token: user.token });
  assert.strictEqual(missing.status, 404);

  const badBio = await request("/api/users/me", {
    method: "PATCH",
    token: user.token,
    body: { bio: "x".repeat(501) }
  });
  assert.strictEqual(badBio.status, 400, JSON.stringify(badBio.data));
});

// ---------------------------------------------------------------
// Publicaciones: crear, leer feed, editar, eliminar
// ---------------------------------------------------------------

mongoTest("V03 post: crear, leer por id y aparecer en el feed del autor", async () => {
  const author = await registerUser("post");
  const post = await createPost(author.token, "V03 publicación de prueba");

  const single = await request(`/api/posts/${post._id}`, { token: author.token });
  assert.strictEqual(single.status, 200, JSON.stringify(single.data));
  assert.strictEqual(single.data.post.content, "V03 publicación de prueba");

  const feed = await request("/api/posts/feed", { token: author.token });
  assert.strictEqual(feed.status, 200, JSON.stringify(feed.data));
  assert.ok(
    feed.data.posts.some((item) => String(item._id) === String(post._id)),
    "la publicación propia aparece en el feed"
  );
});

mongoTest("V03 post: publicación vacía responde 400 y sin autenticar responde 401", async () => {
  const author = await registerUser("vacia");

  const empty = await request("/api/posts", {
    method: "POST",
    token: author.token,
    body: { content: "   " }
  });
  assert.strictEqual(empty.status, 400, JSON.stringify(empty.data));

  const anonymous = await request("/api/posts", { method: "POST", body: { content: "hola" } });
  assert.strictEqual(anonymous.status, 401);
});

mongoTest("V03 editar: el autor cambia el contenido y el cambio persiste", async () => {
  const author = await registerUser("edit");
  const post = await createPost(author.token, "texto original");

  const edited = await request(`/api/posts/${post._id}`, {
    method: "PATCH",
    token: author.token,
    body: { content: "texto editado V03" }
  });
  assert.strictEqual(edited.status, 200, JSON.stringify(edited.data));

  const reread = await request(`/api/posts/${post._id}`, { token: author.token });
  assert.strictEqual(reread.data.post.content, "texto editado V03");
});

mongoTest("V03 editar: un tercero recibe 403 y el contenido no cambia", async () => {
  const author = await registerUser("editA");
  const intruder = await registerUser("editB");
  const post = await createPost(author.token, "intacto");

  const attempt = await request(`/api/posts/${post._id}`, {
    method: "PATCH",
    token: intruder.token,
    body: { content: "modificado por tercero" }
  });
  assert.strictEqual(attempt.status, 403, JSON.stringify(attempt.data));

  const reread = await request(`/api/posts/${post._id}`, { token: author.token });
  assert.strictEqual(reread.data.post.content, "intacto");
});

mongoTest("V03 eliminar: un tercero recibe 403 y la publicación sigue existiendo", async () => {
  const author = await registerUser("delA");
  const intruder = await registerUser("delB");
  const post = await createPost(author.token, "no borrar");

  const attempt = await request(`/api/posts/${post._id}`, {
    method: "DELETE",
    token: intruder.token
  });
  assert.strictEqual(attempt.status, 403, JSON.stringify(attempt.data));

  const still = await request(`/api/posts/${post._id}`, { token: author.token });
  assert.strictEqual(still.status, 200);
});

mongoTest("V03 eliminar: el autor borra y la publicación deja de existir (404)", async () => {
  const author = await registerUser("delOwn");
  const post = await createPost(author.token, "temporal");

  const removed = await request(`/api/posts/${post._id}`, { method: "DELETE", token: author.token });
  assert.strictEqual(removed.status, 200, JSON.stringify(removed.data));

  const gone = await request(`/api/posts/${post._id}`, { token: author.token });
  assert.strictEqual(gone.status, 404);
});

// ---------------------------------------------------------------
// Likes y reacciones
// ---------------------------------------------------------------

mongoTest("V03 like: alterna me gusta y actualiza el contador real", async () => {
  const author = await registerUser("likeA");
  const fan = await registerUser("likeB");
  const post = await createPost(author.token, "me gusta");

  const first = await request(`/api/posts/${post._id}/like`, { method: "POST", token: fan.token });
  assert.strictEqual(first.status, 200, JSON.stringify(first.data));
  assert.strictEqual(first.data.liked, true);
  assert.strictEqual(first.data.likesCount, 1);

  const second = await request(`/api/posts/${post._id}/like`, { method: "POST", token: fan.token });
  assert.strictEqual(second.status, 200);
  assert.strictEqual(second.data.liked, false);
  assert.strictEqual(second.data.likesCount, 0);
});

mongoTest("V03 reacción: fija el tipo, repetirlo lo quita y un tipo inválido da 400", async () => {
  const author = await registerUser("reactA");
  const fan = await registerUser("reactB");
  const post = await createPost(author.token, "reacciones");

  const set = await request(`/api/posts/${post._id}/reaction`, {
    method: "POST",
    token: fan.token,
    body: { type: "love" }
  });
  assert.strictEqual(set.status, 200, JSON.stringify(set.data));
  assert.strictEqual(set.data.reaction, "love");
  assert.strictEqual(set.data.reactionsCount, 1);

  const cleared = await request(`/api/posts/${post._id}/reaction`, {
    method: "POST",
    token: fan.token,
    body: { type: "love" }
  });
  assert.strictEqual(cleared.status, 200);
  assert.strictEqual(cleared.data.reaction, null);
  assert.strictEqual(cleared.data.reactionsCount, 0);

  const invalid = await request(`/api/posts/${post._id}/reaction`, {
    method: "POST",
    token: fan.token,
    body: { type: "tipo-inexistente" }
  });
  assert.strictEqual(invalid.status, 400, JSON.stringify(invalid.data));
});

// ---------------------------------------------------------------
// Comentarios
// ---------------------------------------------------------------

mongoTest("V03 comentario: crear persiste y aparece en la publicación", async () => {
  const author = await registerUser("cmA");
  const reader = await registerUser("cmB");
  const post = await createPost(author.token, "comentarios");

  const created = await request(`/api/posts/${post._id}/comments`, {
    method: "POST",
    token: reader.token,
    body: { content: "comentario V03" }
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  assert.ok(
    created.data.post.comments.some((c) => c.content === "comentario V03"),
    "el comentario viaja en la respuesta"
  );

  const reread = await request(`/api/posts/${post._id}`, { token: author.token });
  assert.ok(reread.data.post.comments.some((c) => c.content === "comentario V03"), "y persiste");
});

mongoTest("V03 comentario: vacío responde 400 y sin autenticar responde 401", async () => {
  const author = await registerUser("cmEmpty");
  const post = await createPost(author.token, "validación de comentarios");

  const empty = await request(`/api/posts/${post._id}/comments`, {
    method: "POST",
    token: author.token,
    body: { content: "" }
  });
  assert.strictEqual(empty.status, 400, JSON.stringify(empty.data));

  const anonymous = await request(`/api/posts/${post._id}/comments`, {
    method: "POST",
    body: { content: "anónimo" }
  });
  assert.strictEqual(anonymous.status, 401);
});

mongoTest("V03 comentario: solo su autor o el dueño del post pueden borrarlo", async () => {
  const author = await registerUser("cmOwner");
  const commenter = await registerUser("cmWriter");
  const stranger = await registerUser("cmStranger");
  const post = await createPost(author.token, "borrado de comentarios");

  const created = await request(`/api/posts/${post._id}/comments`, {
    method: "POST",
    token: commenter.token,
    body: { content: "borrable" }
  });
  assert.strictEqual(created.status, 201);
  const commentId = created.data.post.comments.find((c) => c.content === "borrable")._id;

  const denied = await request(`/api/posts/${post._id}/comments/${commentId}`, {
    method: "DELETE",
    token: stranger.token
  });
  assert.strictEqual(denied.status, 403, JSON.stringify(denied.data));

  const byOwner = await request(`/api/posts/${post._id}/comments/${commentId}`, {
    method: "DELETE",
    token: author.token
  });
  assert.strictEqual(byOwner.status, 200, JSON.stringify(byOwner.data));

  const reread = await request(`/api/posts/${post._id}`, { token: author.token });
  assert.ok(!reread.data.post.comments.some((c) => c.content === "borrable"), "el comentario se eliminó");
});

// ---------------------------------------------------------------
// Follow / unfollow y efecto en el feed
// ---------------------------------------------------------------

mongoTest("V03 follow: alterna el seguimiento y valida autoseguimiento e ID", async () => {
  const alice = await registerUser("fA");
  const bob = await registerUser("fB");

  const follow = await request(`/api/users/${bob.id}/follow`, { method: "POST", token: alice.token });
  assert.strictEqual(follow.status, 200, JSON.stringify(follow.data));
  assert.strictEqual(follow.data.following, true);

  const unfollow = await request(`/api/users/${bob.id}/follow`, { method: "POST", token: alice.token });
  assert.strictEqual(unfollow.status, 200);
  assert.strictEqual(unfollow.data.following, false);

  const self = await request(`/api/users/${alice.id}/follow`, { method: "POST", token: alice.token });
  assert.strictEqual(self.status, 400);

  const invalid = await request("/api/users/no-es-id/follow", { method: "POST", token: alice.token });
  assert.strictEqual(invalid.status, 400);

  const missing = await request(`/api/users/${new mongoose.Types.ObjectId()}/follow`, {
    method: "POST",
    token: alice.token
  });
  assert.strictEqual(missing.status, 404);
});

mongoTest("V03 follow: seguir muestra publicaciones solo para seguidores en el feed", async () => {
  const author = await registerUser("fdAuthor");
  const reader = await registerUser("fdReader");
  const followersPost = await createPost(author.token, "solo seguidores V03", "followers");

  const before = await request("/api/posts/feed", { token: reader.token });
  assert.strictEqual(before.status, 200);
  assert.ok(
    !before.data.posts.some((item) => String(item._id) === String(followersPost._id)),
    "antes de seguir no aparece"
  );

  const follow = await request(`/api/users/${author.id}/follow`, { method: "POST", token: reader.token });
  assert.strictEqual(follow.status, 200);

  const after = await request("/api/posts/feed", { token: reader.token });
  assert.ok(
    after.data.posts.some((item) => String(item._id) === String(followersPost._id)),
    "tras seguir aparece"
  );

  const unfollow = await request(`/api/users/${author.id}/follow`, { method: "POST", token: reader.token });
  assert.strictEqual(unfollow.data.following, false);

  const afterUnfollow = await request("/api/posts/feed", { token: reader.token });
  assert.ok(
    !afterUnfollow.data.posts.some((item) => String(item._id) === String(followersPost._id)),
    "tras dejar de seguir ya no aparece"
  );
});

// ---------------------------------------------------------------
// Permisos de recursos
// ---------------------------------------------------------------

mongoTest("V03 permisos: publicación privada es 404 para terceros, legible para el autor", async () => {
  const author = await registerUser("privA");
  const stranger = await registerUser("privB");
  const privatePost = await createPost(author.token, "solo para mí", "private");

  const asAuthor = await request(`/api/posts/${privatePost._id}`, { token: author.token });
  assert.strictEqual(asAuthor.status, 200);

  const asStranger = await request(`/api/posts/${privatePost._id}`, { token: stranger.token });
  assert.strictEqual(asStranger.status, 404, JSON.stringify(asStranger.data));
});

mongoTest("V03 permisos: publicación de seguidores no se lee sin seguir (404)", async () => {
  const author = await registerUser("fwA");
  const stranger = await registerUser("fwB");
  const followersPost = await createPost(author.token, "seguidores", "followers");

  const denied = await request(`/api/posts/${followersPost._id}`, { token: stranger.token });
  assert.strictEqual(denied.status, 404, JSON.stringify(denied.data));
});

mongoTest("V03 permisos: like y comentario en publicación privada ajena responden 404", async () => {
  const author = await registerUser("ixA");
  const stranger = await registerUser("ixB");
  const privatePost = await createPost(author.token, "privada", "private");

  const like = await request(`/api/posts/${privatePost._id}/like`, { method: "POST", token: stranger.token });
  assert.strictEqual(like.status, 404, JSON.stringify(like.data));

  const comment = await request(`/api/posts/${privatePost._id}/comments`, {
    method: "POST",
    token: stranger.token,
    body: { content: "no debería entrar" }
  });
  assert.strictEqual(comment.status, 404, JSON.stringify(comment.data));
});

mongoTest("V03 errores: ID de publicación inválido da 400 y ausente da 404", async () => {
  const user = await registerUser("ids");

  const invalid = await request("/api/posts/no-es-id", { token: user.token });
  assert.strictEqual(invalid.status, 400);

  const missing = await request(`/api/posts/${new mongoose.Types.ObjectId()}`, { token: user.token });
  assert.strictEqual(missing.status, 404);
});

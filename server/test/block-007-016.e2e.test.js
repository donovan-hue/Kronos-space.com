const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

/**
 * BLOQUE 007-016 — verificación real sobre MongoDB.
 *
 * NO usa dobles, ni persistencia simulada, ni base en memoria: exige
 * `MONGODB_URI` y trabaja en una base temporal propia
 * (`kronos_e2e_<aleatorio>`) que se elimina al terminar. Nunca escribe
 * en la base configurada por el despliegue.
 *
 * Cubre:
 * - 007 refresh con rotación, detección de reutilización y revocación.
 * - 011 bloqueo, silencio, ocultamiento, reportes y moderación global.
 * - 014 borradores (crear, listar, editar, borrar, aislamiento por autor).
 * - 016 portada (cover) por upload real.
 * - 018 privacidad de perfil sobre datos reales.
 *
 * Uso:
 *   cd server && MONGODB_URI="mongodb+srv://.../cualquier_base" npm test
 */
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "kronos-block-007-016-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");
const User = require("../src/modules/users/User");
const Post = require("../src/modules/posts/Post");
const Draft = require("../src/modules/drafts/Draft");
const Block = require("../src/modules/moderation/Block");
const Mute = require("../src/modules/moderation/Mute");
const HiddenPost = require("../src/modules/moderation/HiddenPost");
const { Report } = require("../src/modules/moderation/Report");
const {
  RefreshToken,
  SessionRevocation
} = require("../src/modules/auth/session.service");

const mongoConfigured = Boolean(process.env.MONGODB_URI);

/** Base temporal aislada: nunca la base del despliegue. */
const tempDatabaseName = `kronos_e2e_${crypto
  .randomBytes(6)
  .toString("hex")}`;

const PASSWORD = "KronosBlock123!";
const createdUserIds = [];

let baseUrl;
let dbConnected = false;

/**
 * Sin `MONGODB_URI` no se inventan datos: la prueba se reporta por
 * omitida indicando exactamente qué falta.
 */
function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) {
      t.skip(
        "Requiere MONGODB_URI real (base temporal kronos_e2e_*). Sin URI no se simula persistencia."
      );

      return;
    }

    await fn(t);
  });
}

async function request(path, { method = "GET", token, body, form } = {}) {
  const headers = {};

  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: form || (body ? JSON.stringify(body) : undefined)
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, data };
}

async function registerUser() {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `kronos.e2e.${suffix}@example.com`;
  const { status, data } = await request("/api/auth/register", {
    method: "POST",
    body: {
      username: `e2e_${suffix}`,
      email,
      password: PASSWORD,
      displayName: "E2E Kronos"
    }
  });

  assert.strictEqual(status, 201, JSON.stringify(data));

  createdUserIds.push(data.user.id);

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

async function createPost(token, content) {
  const { status, data } = await request("/api/posts", {
    method: "POST",
    token,
    body: { content }
  });

  assert.strictEqual(status, 201, JSON.stringify(data));

  return data.post;
}

/** PNG 1x1 válido (firma real verificada por el middleware de upload). */
const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);

function pngForm(field) {
  const form = new FormData();
  form.append(field, new Blob([PNG_BUFFER], { type: "image/png" }), "cover.png");

  return form;
}

test.before(async () => {
  if (mongoConfigured) {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: tempDatabaseName,
      serverSelectionTimeoutMS: 15000
    });

    dbConnected = true;

    await Promise.all([
      User.deleteMany({}),
      Post.deleteMany({}),
      Draft.deleteMany({}),
      Block.deleteMany({}),
      Mute.deleteMany({}),
      HiddenPost.deleteMany({}),
      Report.deleteMany({}),
      RefreshToken.deleteMany({}),
      SessionRevocation.deleteMany({})
    ]);
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
    // Solo se elimina la base temporal creada por esta suite.
    if (tempDatabaseName.startsWith("kronos_e2e_")) {
      await mongoose.connection.dropDatabase();
    }

    await mongoose.disconnect();
  }
});

// ---------------------------------------------------------------
// 006/007 — sesión, refresh y revocación
// ---------------------------------------------------------------

mongoTest("login real entrega access + refresh y la sesión se hidrata", async () => {
  const user = await registerUser();
  const session = await login(user.email);

  assert.ok(session.token, "access token");
  assert.ok(session.refreshToken, "refresh token");
  assert.match(session.refreshToken, /^krt_/);
  assert.ok(session.expiresAt, "expiración del access");
  assert.ok(session.refreshExpiresAt, "expiración del refresh");
  assert.strictEqual(session.user.username, user.username);

  const hydrated = await request("/api/auth/session", { token: session.token });
  assert.strictEqual(hydrated.status, 200);
  assert.strictEqual(hydrated.data.valid, true);
  assert.strictEqual(hydrated.data.user.email, user.email);
});

mongoTest("refresh rota de verdad y un refresh reutilizado revoca la familia", async () => {
  const user = await registerUser();
  const session = await login(user.email);

  const rotated = await request("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken: session.refreshToken }
  });

  assert.strictEqual(rotated.status, 200, JSON.stringify(rotated.data));
  assert.ok(rotated.data.token);
  assert.notStrictEqual(rotated.data.refreshToken, session.refreshToken);

  // El access nuevo sirve en rutas protegidas reales.
  const protectedCall = await request("/api/users/me", {
    token: rotated.data.token
  });
  assert.strictEqual(protectedCall.status, 200);

  // El access anterior sigue siendo válido hasta expirar (no se inventa
  // revocación), pero el refresh viejo ya no se puede usar.
  const reuse = await request("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken: session.refreshToken }
  });

  assert.strictEqual(reuse.status, 401);
  assert.strictEqual(reuse.data.code, "REFRESH_REUSED");

  // Detección de robo: toda la familia queda revocada, incluido el
  // refresh legítimo más reciente.
  const afterReuse = await request("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken: rotated.data.refreshToken }
  });

  assert.strictEqual(afterReuse.status, 401);
  assert.strictEqual(afterReuse.data.code, "REFRESH_REUSED");

  const stored = await RefreshToken.find({ userId: user.id }).lean();
  assert.ok(stored.length >= 2, "los refresh se persisten hasheados");
  assert.ok(
    stored.every((doc) => doc.tokenHash && doc.tokenHash.length === 64),
    "nunca se guarda el token en claro"
  );
  assert.ok(
    stored.every((doc) => doc.revokedAt),
    "la familia completa quedó revocada"
  );
});

mongoTest("logout revoca el access y cierra la familia del refresh", async () => {
  const user = await registerUser();
  const session = await login(user.email);

  const logout = await request("/api/auth/logout", {
    method: "POST",
    token: session.token,
    body: { refreshToken: session.refreshToken }
  });

  assert.strictEqual(logout.status, 200);
  assert.strictEqual(logout.data.revoked, true);
  assert.ok(logout.data.refreshRevoked >= 1);

  const reuse = await request("/api/auth/session", { token: session.token });
  assert.strictEqual(reuse.status, 401);
  assert.strictEqual(reuse.data.code, "TOKEN_REVOKED");

  const refresh = await request("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken: session.refreshToken }
  });

  assert.strictEqual(refresh.status, 401);

  const stillThere = await User.findById(user.id).select("_id").lean();
  assert.ok(stillThere, "cerrar sesión no elimina la cuenta");
});

// ---------------------------------------------------------------
// 011 — moderación real
// ---------------------------------------------------------------

mongoTest("bloqueo: corta feed, perfiles, follows y mensajes en ambos sentidos", async () => {
  const a = await registerUser();
  const b = await registerUser();
  const postB = await createPost(b.token, `post visible antes del bloqueo ${Date.now()}`);

  const beforeBlock = await request("/api/posts?limit=50", { token: a.token });
  assert.strictEqual(beforeBlock.status, 200);
  assert.ok(
    beforeBlock.data.posts.some((post) => post._id === postB._id),
    "antes del bloqueo el post es visible"
  );

  const block = await request(`/api/moderation/blocks/${b.id}`, {
    method: "POST",
    token: a.token
  });
  assert.strictEqual(block.status, 200);
  assert.strictEqual(block.data.blocked, true);
  assert.ok(await Block.exists({ blocker: a.id, blocked: b.id }));

  const feedAfter = await request("/api/posts?limit=50", { token: a.token });
  assert.ok(
    !feedAfter.data.posts.some((post) => post._id === postB._id),
    "el feed deja de mostrar contenido del bloqueado"
  );

  const otherFeed = await request("/api/posts?limit=50", { token: b.token });
  assert.ok(
    !otherFeed.data.posts.some((post) => post.author?._id === a.id),
    "el bloqueado tampoco ve a quien lo bloqueó"
  );

  const profileFromBlocked = await request(`/api/users/${a.id}`, { token: b.token });
  assert.strictEqual(profileFromBlocked.status, 403);
  assert.strictEqual(profileFromBlocked.data.code, "BLOCKED_RELATION");

  const postFromBlocked = await request(`/api/posts/${postB._id}`, { token: a.token });
  assert.strictEqual(postFromBlocked.status, 403);

  const follow = await request(`/api/users/${a.id}/follow`, {
    method: "POST",
    token: b.token
  });
  assert.strictEqual(follow.status, 403);

  const message = await request(`/api/messages/${a.id}`, {
    method: "POST",
    token: b.token,
    body: { text: "hola" }
  });
  assert.strictEqual(message.status, 403);

  const list = await request("/api/moderation/blocks", { token: a.token });
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.data.total, 1);

  const unblock = await request(`/api/moderation/blocks/${b.id}`, {
    method: "DELETE",
    token: a.token
  });
  assert.strictEqual(unblock.status, 200);

  const feedRestored = await request("/api/posts?limit=50", { token: a.token });
  assert.ok(
    feedRestored.data.posts.some((post) => post._id === postB._id),
    "al desbloquear vuelve el contenido"
  );
});

mongoTest("silencio y ocultamiento afectan solo a quien los aplica", async () => {
  const a = await registerUser();
  const b = await registerUser();
  const postB = await createPost(b.token, `post silenciado ${Date.now()}`);

  const mute = await request(`/api/moderation/mutes/${b.id}`, {
    method: "POST",
    token: a.token
  });
  assert.strictEqual(mute.status, 200);

  const mutedFeed = await request("/api/posts?limit=50", { token: a.token });
  assert.ok(!mutedFeed.data.posts.some((post) => post._id === postB._id));

  const bFeed = await request("/api/posts?limit=50", { token: b.token });
  assert.ok(
    bFeed.data.posts.some((post) => post._id === postB._id),
    "el silenciado no pierde visibilidad de su propio contenido"
  );

  const profileStillVisible = await request(`/api/users/${b.id}`, { token: a.token });
  assert.strictEqual(profileStillVisible.status, 200);
  assert.strictEqual(profileStillVisible.data.mutedByMe, true);

  const unmute = await request(`/api/moderation/mutes/${b.id}`, {
    method: "DELETE",
    token: a.token
  });
  assert.strictEqual(unmute.status, 200);
  assert.strictEqual(await Mute.exists({ muter: a.id, muted: b.id }), null);

  const hide = await request(`/api/moderation/hidden/${postB._id}`, {
    method: "POST",
    token: a.token
  });
  assert.strictEqual(hide.status, 200);
  assert.ok(await HiddenPost.exists({ user: a.id, post: postB._id }));

  const hiddenFeed = await request("/api/posts?limit=50", { token: a.token });
  assert.ok(!hiddenFeed.data.posts.some((post) => post._id === postB._id));

  const hiddenList = await request("/api/moderation/hidden", { token: a.token });
  assert.strictEqual(hiddenList.status, 200);
  assert.strictEqual(hiddenList.data.total, 1);

  const detail = await request(`/api/posts/${postB._id}`, { token: a.token });
  assert.strictEqual(detail.status, 200, "ocultar no borra: el enlace directo sigue vivo");

  const restore = await request(`/api/moderation/hidden/${postB._id}`, {
    method: "DELETE",
    token: a.token
  });
  assert.strictEqual(restore.status, 200);
  assert.strictEqual(
    await HiddenPost.exists({ user: a.id, post: postB._id }),
    null
  );
});

mongoTest("reportes: se persisten, no se duplican y la cola es solo para moderadores", async () => {
  const a = await registerUser();
  const b = await registerUser();
  const postB = await createPost(b.token, `post reportado ${Date.now()}`);

  const created = await request("/api/moderation/reports", {
    method: "POST",
    token: a.token,
    body: {
      targetType: "post",
      targetId: postB._id,
      reason: "spam",
      details: "Contenido repetido"
    }
  });

  assert.strictEqual(created.status, 201, JSON.stringify(created.data));

  const stored = await Report.findById(created.data.report._id).lean();
  assert.strictEqual(stored.status, "pending");
  assert.strictEqual(String(stored.targetOwner), b.id);

  const duplicate = await request("/api/moderation/reports", {
    method: "POST",
    token: a.token,
    body: { targetType: "post", targetId: postB._id, reason: "spam" }
  });

  assert.strictEqual(duplicate.status, 409);
  assert.strictEqual(duplicate.data.code, "REPORT_DUPLICATE");

  const invalidReason = await request("/api/moderation/reports", {
    method: "POST",
    token: a.token,
    body: { targetType: "post", targetId: postB._id, reason: "porque" }
  });

  assert.strictEqual(invalidReason.status, 400);

  const ownReports = await request("/api/moderation/reports", { token: a.token });
  assert.strictEqual(ownReports.status, 200);
  assert.strictEqual(ownReports.data.total, 1);

  const queue = await request("/api/moderation/reports/queue", { token: a.token });
  assert.strictEqual(queue.status, 403);
  assert.strictEqual(queue.data.code, "ADMIN_ONLY");

  const hideAsModerator = await request(`/api/moderation/posts/${postB._id}/hide`, {
    method: "POST",
    token: a.token
  });
  assert.strictEqual(hideAsModerator.status, 403);

  // Se promueve a moderador sobre la base real y se verifica la cola.
  await User.updateOne({ _id: b.id }, { $set: { role: "admin" } });

  const queueAsModerator = await request("/api/moderation/reports/queue", {
    token: b.token
  });
  assert.strictEqual(queueAsModerator.status, 200, JSON.stringify(queueAsModerator.data));
  assert.strictEqual(queueAsModerator.data.total, 1);
  assert.strictEqual(queueAsModerator.data.reports[0].reason, "spam");

  const resolved = await request(
    `/api/moderation/reports/${created.data.report._id}`,
    {
      method: "PATCH",
      token: b.token,
      body: { status: "resolved", resolutionNote: "Revisado" }
    }
  );

  assert.strictEqual(resolved.status, 200);
  assert.strictEqual(resolved.data.report.status, "resolved");
  assert.strictEqual(String(resolved.data.report.resolvedBy), b.id);

  const globalHide = await request(`/api/moderation/posts/${postB._id}/hide`, {
    method: "POST",
    token: b.token,
    body: { reason: "Spam confirmado" }
  });

  assert.strictEqual(globalHide.status, 200);

  const hiddenForVisitor = await request(`/api/posts/${postB._id}`, {
    token: a.token
  });
  assert.strictEqual(hiddenForVisitor.status, 404, "oculto globalmente para terceros");

  const visibleForAuthor = await request(`/api/posts/${postB._id}`, {
    token: b.token
  });
  assert.strictEqual(visibleForAuthor.status, 200, "el autor sigue viendo su contenido");

  const restored = await request(`/api/moderation/posts/${postB._id}/hide`, {
    method: "DELETE",
    token: b.token
  });
  assert.strictEqual(restored.status, 200);

  const visibleAgain = await request(`/api/posts/${postB._id}`, { token: a.token });
  assert.strictEqual(visibleAgain.status, 200);
});

mongoTest("resumen de moderación refleja el estado real del usuario", async () => {
  const a = await registerUser();
  const b = await registerUser();
  const postB = await createPost(b.token, `resumen ${Date.now()}`);

  await request(`/api/moderation/blocks/${b.id}`, { method: "POST", token: a.token });
  await request(`/api/moderation/hidden/${postB._id}`, { method: "POST", token: a.token });
  await request("/api/moderation/reports", {
    method: "POST",
    token: a.token,
    body: { targetType: "post", targetId: postB._id, reason: "harassment" }
  });

  const overview = await request("/api/moderation/overview", { token: a.token });

  assert.strictEqual(overview.status, 200);
  assert.strictEqual(overview.data.blocks, 1);
  assert.strictEqual(overview.data.hidden, 1);
  assert.strictEqual(overview.data.reports, 1);
  assert.strictEqual(overview.data.isModerator, false);
});

// ---------------------------------------------------------------
// 014 — borradores
// ---------------------------------------------------------------

mongoTest("borradores: ciclo completo y aislamiento por autor", async () => {
  const a = await registerUser();
  const b = await registerUser();

  const empty = await request("/api/drafts", {
    method: "POST",
    token: a.token,
    body: { content: "   " }
  });
  assert.strictEqual(empty.status, 400);

  const created = await request("/api/drafts", {
    method: "POST",
    token: a.token,
    body: { content: "Borrador real", media: { url: "/uploads/media/x.png", alt: "alt" } }
  });

  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  const draftId = created.data.draft._id;
  assert.strictEqual(created.data.draft.media.alt, "alt");

  const listA = await request("/api/drafts", { token: a.token });
  assert.strictEqual(listA.data.total, 1);

  const listB = await request("/api/drafts", { token: b.token });
  assert.strictEqual(listB.data.total, 0, "nadie ve borradores ajenos");

  const updateByOther = await request(`/api/drafts/${draftId}`, {
    method: "PATCH",
    token: b.token,
    body: { content: "secuestrado" }
  });
  assert.strictEqual(updateByOther.status, 403);

  const updated = await request(`/api/drafts/${draftId}`, {
    method: "PATCH",
    token: a.token,
    body: { content: "Borrador editado" }
  });

  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.data.draft.content, "Borrador editado");

  const deleteByOther = await request(`/api/drafts/${draftId}`, {
    method: "DELETE",
    token: b.token
  });
  assert.strictEqual(deleteByOther.status, 403);

  const removed = await request(`/api/drafts/${draftId}`, {
    method: "DELETE",
    token: a.token
  });
  assert.strictEqual(removed.status, 200);
  assert.strictEqual(await Draft.exists({ _id: draftId }), null);

  // Un borrador nunca aparece como publicación.
  const feed = await request("/api/posts?limit=50", { token: a.token });
  assert.ok(!feed.data.posts.some((post) => post.content === "Borrador editado"));
});

// ---------------------------------------------------------------
// 016 — portada (cover)
// ---------------------------------------------------------------

mongoTest("portada: upload real persiste y se sirve en el perfil", async () => {
  const a = await registerUser();

  const upload = await request("/api/users/me/cover", {
    method: "POST",
    token: a.token,
    form: pngForm("cover")
  });

  assert.strictEqual(upload.status, 200, JSON.stringify(upload.data));
  assert.match(upload.data.cover, /^\/uploads\/covers\//);

  const stored = await User.findById(a.id).select("cover").lean();
  assert.strictEqual(stored.cover, upload.data.cover);

  const response = await fetch(`${baseUrl}${stored.cover}`);
  assert.strictEqual(response.status, 200, "el archivo se sirve desde /uploads");

  const profile = await request(`/api/users/${a.id}`, { token: a.token });
  assert.strictEqual(profile.data.cover, upload.data.cover);

  const invalid = await request("/api/users/me/cover", {
    method: "POST",
    token: a.token,
    form: (() => {
      const form = new FormData();

      form.append(
        "cover",
        new Blob([Buffer.from("no es una imagen")], { type: "image/png" }),
        "fake.png"
      );

      return form;
    })()
  });

  assert.strictEqual(invalid.status, 400);
});

// ---------------------------------------------------------------
// 018 — privacidad sobre datos reales
// ---------------------------------------------------------------

mongoTest("privacidad de perfil aplica a visitantes y no al propietario", async () => {
  const a = await registerUser();
  const b = await registerUser();

  await request("/api/users/me", {
    method: "PATCH",
    token: a.token,
    body: { bio: "Biografía real" }
  });

  const privacy = await request("/api/users/me/privacy", {
    method: "PATCH",
    token: a.token,
    body: { showBio: false, showFollowCounts: false, discoverable: false }
  });

  assert.strictEqual(privacy.status, 200);
  assert.strictEqual(privacy.data.privacy.showBio, false);

  const visitorView = await request(`/api/users/${a.id}`, { token: b.token });
  assert.strictEqual(visitorView.data.bio, "");
  assert.strictEqual(visitorView.data.followersCount, null);

  const ownerView = await request(`/api/users/${a.id}`, { token: a.token });
  assert.strictEqual(ownerView.data.bio, "Biografía real");
  assert.strictEqual(typeof ownerView.data.followersCount, "number");

  const search = await request(`/api/users/search?q=${a.username}`, { token: b.token });
  assert.ok(
    !search.data.users.some((user) => String(user._id) === String(a.id)),
    "no aparecer en búsqueda se respeta en base real"
  );

  // El usuario legado sin preferencias sigue siendo visible.
  const legacyHash = await bcrypt.hash(PASSWORD, 10);
  const legacy = await User.collection.insertOne({
    username: `legacy_${crypto.randomBytes(4).toString("hex")}`,
    email: `legacy_${crypto.randomBytes(4).toString("hex")}@example.com`,
    passwordHash: legacyHash,
    displayName: "Legacy",
    bio: "Bio legada",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  createdUserIds.push(legacy.insertedId);

  const legacyView = await request(`/api/users/${legacy.insertedId}`, {
    token: b.token
  });

  assert.strictEqual(legacyView.status, 200);
  assert.strictEqual(legacyView.data.bio, "Bio legada");
  assert.strictEqual(legacyView.data.followersCount, 0);
});

// ---------------------------------------------------------------
// 008 / 009 / 012 / 013 / 015 / 016 / 017 — cierre del bloque
// ---------------------------------------------------------------

mongoTest("composer real: upload de imagen, publicación con alt y edición del alt", async () => {
  const user = await registerUser();

  const upload = await request("/api/posts/media/upload", {
    method: "POST",
    token: user.token,
    form: pngForm("media")
  });

  assert.strictEqual(upload.status, 201, JSON.stringify(upload.data));
  assert.match(upload.data.url, /^\/uploads\/media\//);
  assert.strictEqual(upload.data.mimeType, "image/png");

  const served = await fetch(`${baseUrl}${upload.data.url}`);
  assert.strictEqual(served.status, 200);

  const created = await request("/api/posts", {
    method: "POST",
    token: user.token,
    body: {
      content: "Publicación con imagen",
      media: {
        url: upload.data.url,
        mimeType: upload.data.mimeType,
        size: upload.data.size,
        alt: "Texto alternativo inicial"
      }
    }
  });

  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.data.post.hasMedia, true);
  assert.strictEqual(created.data.post.media.alt, "Texto alternativo inicial");

  const edited = await request(`/api/posts/${created.data.post._id}`, {
    method: "PATCH",
    token: user.token,
    body: { content: "Publicación con imagen", mediaAlt: "Texto alternativo corregido" }
  });

  assert.strictEqual(edited.status, 200);
  assert.strictEqual(edited.data.post.media.alt, "Texto alternativo corregido");

  const stored = await Post.findById(created.data.post._id).lean();
  assert.strictEqual(stored.media.alt, "Texto alternativo corregido");
  assert.strictEqual(stored.media.type, "image");
});

mongoTest("guardar y republicar persisten en MongoDB y respetan el contrato", async () => {
  const a = await registerUser();
  const b = await registerUser();
  const original = await createPost(b.token, `original ${Date.now()}`);

  const saved = await request(`/api/posts/${original._id}/save`, {
    method: "POST",
    token: a.token
  });

  assert.strictEqual(saved.status, 200);
  assert.strictEqual(saved.data.saved, true);
  assert.strictEqual(saved.data.savedCount, 1);

  const savedList = await request("/api/posts/saved", { token: a.token });
  assert.strictEqual(savedList.status, 200);
  assert.ok(savedList.data.posts.some((post) => post._id === original._id));
  assert.ok(
    savedList.data.posts.every((post) => post.savedBy === undefined),
    "nunca se exponen las identidades que guardaron"
  );

  const otherSaved = await request("/api/posts/saved", { token: b.token });
  assert.ok(!otherSaved.data.posts.some((post) => post._id === original._id));

  const repost = await request(`/api/posts/${original._id}/repost`, {
    method: "POST",
    token: a.token,
    body: { content: "Mi repost" }
  });

  assert.strictEqual(repost.status, 201);
  assert.strictEqual(String(repost.data.post.repostOf._id), String(original._id));

  const duplicate = await request(`/api/posts/${original._id}/repost`, {
    method: "POST",
    token: a.token
  });
  assert.strictEqual(duplicate.status, 409);

  const stored = await Post.findById(repost.data.post._id).lean();
  assert.strictEqual(String(stored.repostOf), String(original._id));

  const unsave = await request(`/api/posts/${original._id}/save`, {
    method: "POST",
    token: a.token
  });

  assert.strictEqual(unsave.data.saved, false);
  assert.strictEqual(unsave.data.savedCount, 0);
});

mongoTest("paginación real: page, limit y hasMore son coherentes", async () => {
  const user = await registerUser();

  for (let index = 0; index < 7; index += 1) {
    await createPost(user.token, `paginado ${index} ${Date.now()}`);
  }

  const first = await request("/api/posts?page=1&limit=3", { token: user.token });
  assert.strictEqual(first.data.posts.length, 3);
  assert.strictEqual(first.data.hasMore, true);

  const second = await request("/api/posts?page=2&limit=3", { token: user.token });
  assert.strictEqual(second.data.posts.length, 3);
  assert.ok(
    !second.data.posts.some((post) =>
      first.data.posts.some((previous) => previous._id === post._id)
    ),
    "las páginas no repiten publicaciones"
  );

  const last = await request("/api/posts?page=3&limit=3", { token: user.token });
  assert.ok(last.data.posts.length >= 1);
  assert.strictEqual(last.data.hasMore, false);
});

mongoTest("pestañas de perfil filtran con datos reales", async () => {
  const user = await registerUser();
  const other = await registerUser();
  const plain = await createPost(user.token, `texto puro ${Date.now()}`);

  const upload = await request("/api/posts/media/upload", {
    method: "POST",
    token: user.token,
    form: pngForm("media")
  });

  const withImage = await request("/api/posts", {
    method: "POST",
    token: user.token,
    body: {
      content: "con imagen",
      media: { url: upload.data.url, mimeType: upload.data.mimeType, size: upload.data.size, alt: "" }
    }
  });

  await request(`/api/posts/${plain._id}/repost`, {
    method: "POST",
    token: user.token
  });

  const posts = await request(`/api/posts/user/${user.id}?tab=posts`, { token: user.token });
  assert.ok(posts.data.posts.every((post) => post.repostOf === null || post.repostOf === undefined));
  assert.ok(posts.data.posts.some((post) => post._id === plain._id));

  const media = await request(`/api/posts/user/${user.id}?tab=media`, { token: user.token });
  assert.ok(media.data.posts.length >= 1);
  assert.ok(media.data.posts.every((post) => post.media?.url));

  const reposts = await request(`/api/posts/user/${user.id}?tab=reposts`, { token: user.token });
  assert.ok(reposts.data.posts.length >= 1);
  assert.ok(reposts.data.posts.every((post) => post.repostOf));

  const invalid = await request(`/api/posts/user/${user.id}?tab=saved`, { token: user.token });
  assert.strictEqual(invalid.status, 400);

  const visitorSavedAttempt = await request(`/api/posts/user/${other.id}?tab=saved`, {
    token: user.token
  });
  assert.strictEqual(visitorSavedAttempt.status, 400);
});

mongoTest("avatar real: upload persiste y se sirve", async () => {
  const user = await registerUser();

  const upload = await request("/api/users/me/avatar", {
    method: "POST",
    token: user.token,
    form: pngForm("avatar")
  });

  assert.strictEqual(upload.status, 200, JSON.stringify(upload.data));
  assert.match(upload.data.avatar, /^\/uploads\/avatars\//);

  const response = await fetch(`${baseUrl}${upload.data.avatar}`);
  assert.strictEqual(response.status, 200);

  const sync = await request("/api/users/me", {
    method: "PATCH",
    token: user.token,
    body: { cover: upload.data.avatar }
  });

  assert.strictEqual(sync.status, 200);
  assert.strictEqual(sync.data.cover, upload.data.avatar);
});

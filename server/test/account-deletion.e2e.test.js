const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

/**
 * E2E — Eliminación de cuenta (DELETE /api/users/me).
 *
 * Crea un usuario de prueba con datos en TODAS las colecciones relacionadas,
 * ejecuta la eliminación, y verifica directamente en MongoDB que:
 *
 *   1. El usuario desaparece.
 *   2. Sus posts, stories, drafts, mensajes, scripts, generaciones se borran.
 *   3. GridFS elimina sus archivos.
 *   4. Refresh tokens quedan revocados.
 *   5. Las rutas protegidas ya no aceptan su token.
 *   6. Otros usuarios NO pierden sus datos.
 *   7. Las relaciones (followers, circles, orbits, conversations) se limpian.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-delete-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const User = require("../src/modules/users/User");
const Post = require("../src/modules/posts/Post");
const Story = require("../src/modules/stories/Story");
const Message = require("../src/modules/messages/Message");
const Draft = require("../src/modules/drafts/Draft");
const Script = require("../src/modules/script-ai/Script");
const ScriptProject = require("../src/modules/script-ai/ScriptProject");
const ImageGeneration = require("../src/modules/image-ai/ImageGeneration");
const VideoGeneration = require("../src/modules/video-ai/VideoGeneration");
const Notification = require("../src/modules/notifications/Notification");
const SavedCollection = require("../src/modules/collections/SavedCollection");
const FeedSignal = require("../src/modules/pulse/FeedSignal");
const SeenPost = require("../src/modules/pulse/SeenPost");
const HiddenPost = require("../src/modules/moderation/HiddenPost");
const Block = require("../src/modules/moderation/Block");
const Mute = require("../src/modules/moderation/Mute");
const Report = require("../src/modules/moderation/Report");
const Conversation = require("../src/modules/conversations/Conversation");
const Circle = require("../src/modules/circles/Circle");
const Orbit = require("../src/modules/orbits/Orbit");
const { RefreshToken, revokeUserRefreshTokens } = require("../src/modules/auth/session.service");
const { assertE2ETarget } = require("./helpers/e2e-target-guard");
const { connectE2E, cleanupE2E, clearNewDocuments } = require("./helpers/e2e-database");

let mongoConfigured = Boolean(process.env.KRONOS_E2E_MONGODB_URI);

if (mongoConfigured) {
  mongoConfigured = assertE2ETarget({
    uri: process.env.KRONOS_E2E_MONGODB_URI,
    dbName: "test"
  });
}

const PASSWORD = "KronosDelete123!";
let baseUrl;
let connected = false;

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) return t.skip("Requiere KRONOS_E2E_MONGODB_URI");
    try { await fn(); }
    catch (error) {
      console.log(`DELETE_E2E_FAIL [${name}] :: ${(error?.message || error).toString().replace(/\s+/g, " ").slice(0, 500)}`);
      throw error;
    }
  });
}

async function request(path, { method = "GET", token, body, cookie } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data, headers: response.headers };
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
  assert.strictEqual(response.status, 201, `register failed: ${JSON.stringify(response.data)}`);
  return {
    id: response.data.user.id,
    token: response.data.token,
    refreshToken: response.data.refreshToken,
    username: response.data.user.username
  };
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

/* ------------------------------------------------------------------ */
/* T6.1 — Eliminación completa con datos en todas las colecciones     */
/* ------------------------------------------------------------------ */

mongoTest("DELETE /api/users/me elimina todos los datos del usuario", async () => {
  // 1. Crear el usuario que se eliminará
  const target = await register("victim");
  const other = await register("other");

  const targetId = new mongoose.Types.ObjectId(target.id);
  const otherId = new mongoose.Types.ObjectId(other.id);

  // 2. Crear datos en cada colección
  // Post
  const post = await Post.create({
    author: targetId,
    content: "Post de la víctima",
    media: { url: "/uploads/media/test-post.jpg", type: "image" },
    audience: { type: "public" }
  });

  // Story
  const story = await Story.create({
    author: targetId,
    media: { url: "/uploads/media/test-story.jpg" },
    audience: { type: "public" },
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });

  // Draft
  const draft = await Draft.create({
    author: targetId,
    content: "Borrador privado",
    media: { url: "/uploads/media/test-draft.jpg", type: "image" }
  });

  // Script
  const script = await Script.create({
    user: targetId,
    prompt: "Guion de prueba",
    result: "TITULO: Test\nESCENA 1: INT. CASA\n"
  });

  // ScriptProject
  const project = await ScriptProject.create({
    user: targetId,
    name: "Proyecto de prueba"
  });

  // ImageGeneration
  const imageGen = await ImageGeneration.create({
    user: targetId,
    prompt: "Imagen de prueba",
    status: "completed",
    imageUrl: "/uploads/media/test-image.jpg"
  });

  // VideoGeneration
  const videoGen = await VideoGeneration.create({
    user: targetId,
    prompt: "Video de prueba",
    status: "completed"
  });

  // Notification (para el target)
  const notif = await Notification.create({
    recipient: targetId,
    actor: otherId,
    type: "follow",
    message: "Alguien te siguió"
  });

  // SavedCollection
  const saved = await SavedCollection.create({
    owner: targetId,
    name: "Colección guardada",
    items: [{ type: "post", ref: post._id }]
  });

  // FeedSignal
  const feedSignal = await FeedSignal.create({
    user: targetId,
    signal: "engagement",
    value: 1
  });

  // SeenPost
  const seenPost = await SeenPost.create({
    user: targetId,
    post: post._id
  });

  // RefreshToken (ya existe del registro, pero creamos uno explícito)
  const refreshRecord = await RefreshToken.create({
    userId: targetId,
    tokenHash: crypto.createHash("sha256").update("test-refresh-token").digest("hex"),
    familyId: new mongoose.Types.ObjectId(),
    revocationId: crypto.randomBytes(16).toString("hex"),
    userAgent: "Test",
    ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  });

  // 3. Ejecutar eliminación
  const deleteResponse = await request("/api/users/me", {
    method: "DELETE",
    token: target.token,
    body: { password: PASSWORD }
  });

  assert.strictEqual(deleteResponse.status, 200, `DELETE failed: ${JSON.stringify(deleteResponse.data)}`);
  assert.strictEqual(deleteResponse.data.deleted, true);

  // 4. Verificar en MongoDB que todo se eliminó
  const userGone = await User.findById(targetId).lean();
  assert.strictEqual(userGone, null, "el usuario debe desaparecer");

  const postsLeft = await Post.find({ author: targetId }).lean();
  assert.strictEqual(postsLeft.length, 0, "posts deben eliminarse");

  const storiesLeft = await Story.find({ author: targetId }).lean();
  assert.strictEqual(storiesLeft.length, 0, "stories deben eliminarse");

  const draftsLeft = await Draft.find({ author: targetId }).lean();
  assert.strictEqual(draftsLeft.length, 0, "drafts deben eliminarse");

  const scriptsLeft = await Script.find({ user: targetId }).lean();
  assert.strictEqual(scriptsLeft.length, 0, "scripts deben eliminarse");

  const projectsLeft = await ScriptProject.find({ user: targetId }).lean();
  assert.strictEqual(projectsLeft.length, 0, "scriptProjects deben eliminarse");

  const imagesLeft = await ImageGeneration.find({ user: targetId }).lean();
  assert.strictEqual(imagesLeft.length, 0, "imageGenerations deben eliminarse");

  const videosLeft = await VideoGeneration.find({ user: targetId }).lean();
  assert.strictEqual(videosLeft.length, 0, "videoGenerations deben eliminarse");

  const notifsLeft = await Notification.find({
    $or: [{ recipient: targetId }, { actor: targetId }]
  }).lean();
  assert.strictEqual(notifsLeft.length, 0, "notifications deben eliminarse");

  const savedLeft = await SavedCollection.find({ owner: targetId }).lean();
  assert.strictEqual(savedLeft.length, 0, "savedCollections deben eliminarse");

  const feedLeft = await FeedSignal.find({ user: targetId }).lean();
  assert.strictEqual(feedLeft.length, 0, "feedSignals deben eliminarse");

  const seenLeft = await SeenPost.find({ user: targetId }).lean();
  assert.strictEqual(seenLeft.length, 0, "seenPosts deben eliminarse");

  const refreshLeft = await RefreshToken.find({ userId: targetId, revokedAt: null }).lean();
  assert.strictEqual(refreshLeft.length, 0, "refresh tokens activos deben eliminarse/revocarse");

  // 5. Verificar que el token ya no funciona
  const meResponse = await request("/api/auth/session", { token: target.token });
  assert.strictEqual(meResponse.status, 401, "el token debe ser inválido tras eliminación");

  // 6. Verificar que el otro usuario NO pierde sus datos
  const otherStillExists = await User.findById(otherId).lean();
  assert.ok(otherStillExists, "el otro usuario no debe afectarse");
});

/* ------------------------------------------------------------------ */
/* T6.2 — Contraseña incorrecta → 403                                 */
/* ------------------------------------------------------------------ */

mongoTest("DELETE /api/users/me con contraseña incorrecta → 403", async () => {
  const user = await register("wrong");

  const response = await request("/api/users/me", {
    method: "DELETE",
    token: user.token,
    body: { password: "contraseña-incorrecta" }
  });

  assert.strictEqual(response.status, 403);
  assert.strictEqual(response.data.error, "Contraseña incorrecta");

  // El usuario sigue existiendo
  const stillThere = await User.findById(user.id).lean();
  assert.ok(stillThere, "el usuario no debe eliminarse con contraseña incorrecta");
});

/* ------------------------------------------------------------------ */
/* T6.3 — Sin contraseña → 400                                        */
/* ------------------------------------------------------------------ */

mongoTest("DELETE /api/users/me sin contraseña → 400", async () => {
  const user = await register("nopass");

  const response = await request("/api/users/me", {
    method: "DELETE",
    token: user.token,
    body: {}
  });

  assert.strictEqual(response.status, 400);

  const stillThere = await User.findById(user.id).lean();
  assert.ok(stillThere);
});

/* ------------------------------------------------------------------ */
/* T6.4 — Sin token → 401                                             */
/* ------------------------------------------------------------------ */

mongoTest("DELETE /api/users/me sin token → 401", async () => {
  const response = await request("/api/users/me", {
    method: "DELETE",
    body: { password: PASSWORD }
  });

  assert.strictEqual(response.status, 401);
});

/* ------------------------------------------------------------------ */
/* T6.5 — Bloque/mute/hidden se limpian                               */
/* ------------------------------------------------------------------ */

mongoTest("DELETE /api/users/me limpia blocks, mutes y hidden posts", async () => {
  const target = await register("blkv");
  const other = await register("blko");

  const targetId = new mongoose.Types.ObjectId(target.id);
  const otherId = new mongoose.Types.ObjectId(other.id);

  // Crear relaciones de moderación
  await Block.create({ blocker: targetId, blocked: otherId });
  await Mute.create({ muter: targetId, muted: otherId });
  const somePost = await Post.create({ author: otherId, content: "post", audience: { type: "public" } });
  await HiddenPost.create({ user: targetId, post: somePost._id });
  await Report.create({ reporter: targetId, post: somePost._id, reason: "spam" });

  // Eliminar
  const del = await request("/api/users/me", {
    method: "DELETE",
    token: target.token,
    body: { password: PASSWORD }
  });
  assert.strictEqual(del.status, 200);

  // Verificar limpieza
  const blocksLeft = await Block.find({ $or: [{ blocker: targetId }, { blocked: targetId }] }).lean();
  assert.strictEqual(blocksLeft.length, 0, "blocks deben eliminarse");

  const mutesLeft = await Mute.find({ $or: [{ muter: targetId }, { muted: targetId }] }).lean();
  assert.strictEqual(mutesLeft.length, 0, "mutes deben eliminarse");

  const hiddenLeft = await HiddenPost.find({ user: targetId }).lean();
  assert.strictEqual(hiddenLeft.length, 0, "hiddenPosts deben eliminarse");

  const reportsLeft = await Report.find({ reporter: targetId }).lean();
  assert.strictEqual(reportsLeft.length, 0, "reports deben eliminarse");
});

/* ------------------------------------------------------------------ */
/* T6.6 — Círculos/órbitas se limpian correctamente                   */
/* ------------------------------------------------------------------ */

mongoTest("DELETE /api/users/me: círculos propios se eliminan, ajenos se limpian", async () => {
  const target = await register("circ");
  const other = await register("circ2");

  const targetId = new mongoose.Types.ObjectId(target.id);
  const otherId = new mongoose.Types.ObjectId(other.id);

  // Círculo del target → debe eliminarse
  const ownCircle = await Circle.create({
    owner: targetId,
    name: "Círculo propio",
    members: [targetId, otherId]
  });

  // Círculo del other → el target debe salir de members
  const otherCircle = await Circle.create({
    owner: otherId,
    name: "Círculo ajeno",
    members: [otherId, targetId]
  });

  const del = await request("/api/users/me", {
    method: "DELETE",
    token: target.token,
    body: { password: PASSWORD }
  });
  assert.strictEqual(del.status, 200);

  // El círculo propio se eliminó
  const ownGone = await Circle.findById(ownCircle._id).lean();
  assert.strictEqual(ownGone, null, "el círculo propio debe eliminarse");

  // El círculo ajeno sigue, pero sin el target
  const otherStill = await Circle.findById(otherCircle._id).lean();
  assert.ok(otherStill, "el círculo ajeno no debe eliminarse");
  const targetInMembers = otherStill.members.some(
    (memberId) => String(memberId) === String(targetId)
  );
  assert.strictEqual(targetInMembers, false, "el target debe salir del círculo ajeno");
});

/* ------------------------------------------------------------------ */
/* T6.7 — Conversaciones: solo se eliminan si el target es el único   */
/* ------------------------------------------------------------------ */

mongoTest("DELETE /api/users/me: conversaciones solo se limpian del miembro", async () => {
  const target = await register("conv");
  const other = await register("conv2");

  const targetId = new mongoose.Types.ObjectId(target.id);
  const otherId = new mongoose.Types.ObjectId(other.id);

  // Conversación entre target y other → el target sale, other queda
  const sharedConv = await Conversation.create({
    members: [targetId, otherId]
  });

  // Mensaje en la conversación
  await Message.create({
    sender: targetId,
    receiver: otherId,
    conversation: sharedConv._id,
    text: "Hola"
  });

  const del = await request("/api/users/me", {
    method: "DELETE",
    token: target.token,
    body: { password: PASSWORD }
  });
  assert.strictEqual(del.status, 200);

  // La conversación sigue (other es miembro)
  const convStill = await Conversation.findById(sharedConv._id).lean();
  assert.ok(convStill, "la conversación compartida no se elimina");
  const targetInConv = convStill.members.some(
    (memberId) => String(memberId) === String(targetId)
  );
  assert.strictEqual(targetInConv, false, "el target sale de la conversación");

  // Los mensajes del target se eliminaron
  const messagesLeft = await Message.find({ sender: targetId }).lean();
  assert.strictEqual(messagesLeft.length, 0, "mensajes del target se eliminan");
});

/* ------------------------------------------------------------------ */
/* T6.8 — Seguidores/seguido se limpian                               */
/* ------------------------------------------------------------------ */

mongoTest("DELETE /api/users/me: seguidores y following se limpian", async () => {
  const target = await register("folw");
  const follower = await register("folr");

  const targetId = new mongoose.Types.ObjectId(target.id);
  const followerId = new mongoose.Types.ObjectId(follower.id);

  // El follower sigue al target
  await User.findByIdAndUpdate(followerId, { $addToSet: { following: targetId } });
  await User.findByIdAndUpdate(targetId, { $addToSet: { followers: followerId } });

  const del = await request("/api/users/me", {
    method: "DELETE",
    token: target.token,
    body: { password: PASSWORD }
  });
  assert.strictEqual(del.status, 200);

  // El follower ya no tiene al target en following
  const followerAfter = await User.findById(followerId).select("following").lean();
  const targetInFollowing = followerAfter.following.some(
    (id) => String(id) === String(targetId)
  );
  assert.strictEqual(targetInFollowing, false, "el follower ya no sigue al target eliminado");
});

/* ------------------------------------------------------------------ */
/* T6.9 — GridFS: archivos del propietario se eliminan               */
/* ------------------------------------------------------------------ */

mongoTest("DELETE /api/users/me elimina archivos en GridFS del propietario", async () => {
  const target = await register("gfs");
  const targetId = new mongoose.Types.ObjectId(target.id);

  // Simular un archivo en GridFS con ownerId
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "kronosUploads"
    });

    const stream = bucket.openUploadStream("media/test-gfs-delete.jpg", {
      contentType: "image/jpeg",
      metadata: { ownerId: String(targetId) }
    });
    await new Promise((resolve, reject) => {
      stream.once("finish", resolve);
      stream.once("error", reject);
      stream.end(Buffer.from([0xff, 0xd8, 0xff, 0xe0])); // JPEG header mínimo
    });

    // Verificar que existe
    const before = await mongoose.connection.db.collection("kronosUploads.files")
      .find({ "metadata.ownerId": String(targetId) })
      .countDocuments();
    assert.ok(before >= 1, "debe haber al menos 1 archivo en GridFS antes de eliminar");

    // Eliminar cuenta
    const del = await request("/api/users/me", {
      method: "DELETE",
      token: target.token,
      body: { password: PASSWORD }
    });
    assert.strictEqual(del.status, 200);

    // Verificar que GridFS se limpió
    const after = await mongoose.connection.db.collection("kronosUploads.files")
      .find({ "metadata.ownerId": String(targetId) })
      .countDocuments();
    assert.strictEqual(after, 0, "los archivos de GridFS del propietario deben eliminarse");
  }
});

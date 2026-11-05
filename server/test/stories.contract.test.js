const test = require("node:test");
const assert = require("node:assert/strict");

const Story = require("../src/modules/stories/Story");
const storiesRouter = require("../src/modules/stories/stories.routes");
const { normalizeStory, parseStoryPayload } = storiesRouter;

const authorId = "65f000000000000000000021";
const viewerId = "65f000000000000000000022";
const outsiderId = "65f000000000000000000023";
const circleId = "65f000000000000000000031";

function routePaths() {
  return (storiesRouter.stack || []).map((layer) => layer.route?.path).filter(Boolean);
}

test("historias persisten media propia, audiencia acotada y expiración obligatoria", () => {
  assert.equal(Story.schema.path("author").options.ref, "User");
  assert.equal(Story.schema.path("media").instance, "Embedded");
  assert.equal(Story.schema.path("media.url").options.required, true);
  assert.deepEqual(Story.schema.path("media.type").enumValues, ["image", "video"]);
  assert.equal(Story.schema.path("media.alt").options.maxlength, 500);
  assert.equal(Story.schema.path("caption").options.maxlength, 500);
  assert.deepEqual(Story.schema.path("audience.type").enumValues, ["public", "followers", "circle"]);
  assert.equal(Story.schema.path("audience.circleId").options.ref, "Circle");
  assert.equal(Story.schema.path("expiresAt").options.required, true);
  assert.equal(Story.schema.path("views").instance, "Array");
  assert.equal(Story.schema.path("replies").instance, "Array");
  assert.equal(Story.schema.path("replies.text").options.maxlength, 1000);
});

test("parser de historias exige media de Kronos, tipo válido y audiencia conocida", () => {
  assert.match(parseStoryPayload({ media: { url: "" } }).error, /imagen o un video/);
  assert.match(parseStoryPayload({ media: { url: "https://cdn.terceros/x.mp4", type: "video" } }).error, /debe estar en Kronos/);
  assert.match(parseStoryPayload({ media: { url: "/uploads/media/a.jpg", mimeType: "application/pdf" } }).error, /Tipo de media/);

  const parsed = parseStoryPayload({
    media: { url: "/uploads/media/a.webp", mimeType: "image/webp", size: 1200, alt: "Un amanecer" },
    caption: "Buenos días",
    audience: { type: "circle", circleId }
  });
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.media, { url: "/uploads/media/a.webp", type: "image", mimeType: "image/webp", size: 1200, alt: "Un amanecer" });
  assert.equal(parsed.caption, "Buenos días");
  assert.deepEqual(parsed.audience, { type: "circle", circleId });

  assert.equal(parseStoryPayload({ media: { url: "/uploads/media/a.jpg", type: "image" }, caption: "x".repeat(501) }).error, "El texto no puede superar 500 caracteres");
  assert.equal(parseStoryPayload({ media: { url: "/uploads/media/a.jpg", type: "image", alt: "y".repeat(501) } }).error, "El texto alternativo no puede superar 500 caracteres");
  assert.equal(parseStoryPayload({ media: { url: "/uploads/media/a.jpg", type: "image" }, audience: { type: "desconocida" } }).error, "Audiencia no válida");
  assert.equal(parseStoryPayload({ media: { url: "/uploads/media/a.jpg", type: "image" }, audience: { type: "circle", circleId: "no-id" } }).error, "Audiencia no válida");
});

test("historia normalizada nunca expone quiénes la vieron ni respondieron", () => {
  const story = {
    _id: "story-1",
    author: { _id: authorId, username: "ana", displayName: "Ana", avatar: "/uploads/media/ana.jpg" },
    media: { url: "/uploads/media/h.jpg", type: "image", mimeType: "image/jpeg", alt: "Playa" },
    caption: "Verano",
    audience: { type: "circle", circleId },
    createdAt: new Date("2026-09-21T10:00:00Z"),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    views: [
      { user: viewerId, viewedAt: new Date() },
      { user: viewerId, viewedAt: new Date() }
    ],
    replies: [{ user: viewerId, text: "¡Qué bonito!", createdAt: new Date() }]
  };

  const normalized = normalizeStory(story, viewerId);
  assert.equal(normalized.viewsCount, 1);
  assert.equal(normalized.repliesCount, 1);
  assert.equal(normalized.viewed, true);
  assert.equal(normalized.mine, false);
  assert.equal(normalized.isActive, true);
  assert.equal("views" in normalized, false);
  assert.equal("replies" in normalized, false);
  // El círculo exacto solo lo conoce el autor.
  assert.equal("circleId" in normalized.audience, false);

  const asAuthor = normalizeStory(story, authorId);
  assert.equal(asAuthor.mine, true);
  assert.equal(asAuthor.audience.circleId, circleId);
  assert.equal(asAuthor.viewed, false);

  const expired = normalizeStory(
    { ...story, expiresAt: new Date(Date.now() - 1000) },
    viewerId
  );
  assert.equal(expired.isActive, false);

  const outsider = normalizeStory(story, outsiderId);
  assert.equal(outsider.viewed, false);
  assert.equal(outsider.mine, false);
});

test("rutas de historias cubren bandeja, creación, archivo, vistas, respuestas y borrado", () => {
  assert.deepEqual(routePaths(), [
    "/",
    "/",
    "/me/archive",
    // Destacados (bloque 1.3): colección permanente que sobrevive a la
    // caducidad de la historia. Se sirven desde `User`, no desde `Story`.
    "/highlights",
    "/highlights",
    "/highlights/:highlightId",
    "/:storyId",
    "/:storyId",
    "/:storyId/view",
    // Votar en la encuesta de un sticker (bloque 1.3).
    "/:storyId/stickers/:index/vote",
    "/:storyId/views",
    "/:storyId/reply",
    "/:storyId/replies"
  ]);
  for (const layer of storiesRouter.stack.filter((item) => item.route)) {
    assert.ok(layer.route.stack.length >= 3, `la ruta ${layer.route.path} debe exigir auth y usuario`);
  }
});

/* ============================================================
   1.3 — el archivo se pagina en vez de cortar en silencio
   ============================================================ */

test("el archivo personal acepta page/limit y declara el total", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.join(__dirname, "..", "..");
  const fuente = fs.readFileSync(path.join(raiz, "server/src/modules/stories/stories.routes.js"), "utf8");

  const bloque = fuente.slice(
    fuente.indexOf('router.get("/me/archive"'),
    fuente.indexOf("// ---------- Una historia ----------")
  );

  // Antes devolvía ARCHIVE_LIMIT y ahí se acababa: no se sabía si faltaban.
  assert.match(bloque, /parsePagination\(req\.query/);
  assert.match(bloque, /\.skip\(skip\)/);
  assert.match(bloque, /total/);
  assert.match(bloque, /hayMas/);
  // Contar todo en cada desplazamiento es un recorrido completo innecesario.
  assert.match(bloque, /page === 1 \? Story\.countDocuments\(filtro\) : Promise\.resolve\(null\)/);
  // El archivo sigue gobernado por el flag `archive`.
  assert.match(bloque, /requireFeatureFlag\("archive"\)/);
});

/* ============================================================
   1.3 — retención del archivo y destacados (26-11-05)
   ============================================================ */

test("la retención no usa TTL y avisa antes de borrar", () => {
  const Story = require("../src/modules/stories/Story");
  assert.equal(Story.ARCHIVE_RETENTION_DAYS, 60);
  assert.equal(Story.ARCHIVE_WARNING_DAYS, 30);
  assert.ok(Story.ARCHIVE_RETENTION_DAYS > Story.ARCHIVE_WARNING_DAYS, "el margen de aviso debe caber en la retención");
});

test("el barrido marca primero y borra después, y nunca toca lo destacado", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.join(__dirname, "..", "..");
  const fuente = fs.readFileSync(path.join(raiz, "scripts/db/stories-retention.js"), "utf8");

  // Dos pasos explícitos.
  assert.match(fuente, /retentionFlaggedAt: \{ \$ne: null \}/, "el borrado debe exigir marca previa");
  assert.match(fuente, /async function marcar/);
  assert.match(fuente, /async function borrar/);
  // Protección de destacados.
  assert.match(fuente, /historiasDestacadas/);
  assert.match(fuente, /\$nin: \[\.\.\.destacadas\]/);
  // Sin base configurada no se toca nada.
  assert.match(fuente, /Falta MONGODB_URI/);
  // Las herramientas de base no crean índices al conectar.
  assert.match(fuente, /autoIndex: false/);
});

test("los destacados viven en el usuario y no aceptan historias ajenas", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.join(__dirname, "..", "..");
  const usuario = fs.readFileSync(path.join(raiz, "server/src/modules/users/User.js"), "utf8");
  assert.match(usuario, /storyHighlights/);

  const rutas = fs.readFileSync(path.join(raiz, "server/src/modules/stories/stories.routes.js"), "utf8");
  assert.match(rutas, /Solo puedes destacar tus propias historias/);
  assert.match(rutas, /code: "NOT_STORY_AUTHOR"/);
  // El autor ve cuándo se borra; el resto no.
  assert.match(rutas, /daysUntilDelete/);
  assert.match(rutas, /\.\.\.\(mine \? \{/);
});

/* ============================================================
   1.4 — búsqueda en mensajes y roles de grupo (26-11-05)
   ============================================================ */

test("la búsqueda en mensajes escapa el patrón y exige sesión de miembro", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.join(__dirname, "..", "..");

  const dm = fs.readFileSync(path.join(raiz, "server/src/modules/messages/messages.routes.js"), "utf8");
  assert.match(dm, /router\.get\("\/:userId\/search"/);
  // Sin escape, un `.*` del usuario se vuelve comodín.
  assert.match(dm, /function escaparRegexBusqueda/);
  assert.match(dm, /\$regex: escaparRegexBusqueda\(q\)/);
  // Un bloqueo corta la búsqueda igual que la lectura.
  assert.match(dm, /BLOCKED_RELATION/);

  const grupo = fs.readFileSync(path.join(raiz, "server/src/modules/conversations/conversations.routes.js"), "utf8");
  assert.match(grupo, /router\.get\("\/:conversationId\/messages\/search"/);
  assert.match(grupo, /getConversationAsMember\(conversationId, req\.user\.id\)/);
  // La lápida no es un resultado vacío.
  assert.match(grupo, /deletedAt: null/);
});

test("roles de grupo: dueño, administradores y transferencia", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.join(__dirname, "..", "..");

  const modelo = fs.readFileSync(path.join(raiz, "server/src/modules/conversations/Conversation.js"), "utf8");
  assert.match(modelo, /admins: \{/);

  const rutas = fs.readFileSync(path.join(raiz, "server/src/modules/conversations/conversations.routes.js"), "utf8");
  assert.match(rutas, /function esAdministrador/);
  assert.match(rutas, /function rolEnGrupo/);
  assert.match(rutas, /router\.patch\("\/:conversationId\/admins"/);
  assert.match(rutas, /router\.patch\("\/:conversationId\/owner"/);
  // Solo el dueño nombra admin / transfiere: si un admin pudiera, el dueño
  // perdería el control sin enterarse.
  assert.match(rutas, /code: "NOT_OWNER"/);
  assert.match(rutas, /code: "ADMIN_NOT_MEMBER"/);
  // Al irse un admin, deja de administrar.
  assert.match(rutas, /conversation\.admins = \(conversation\.admins \|\| \[\]\)\.filter/);
});

/* ============================================================
   1.5 — directos: latido, chat, expulsión y barrido (26-11-05)
   ============================================================ */

test("la sala abandonada se cierra por barrido, no por TTL", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.join(__dirname, "..", "..");

  const modelo = fs.readFileSync(path.join(raiz, "server/src/modules/live/LiveRoom.js"), "utf8");
  assert.match(modelo, /hostHeartbeatAt/);
  assert.match(modelo, /LIVE_STALE_MS = 3 \* 60 \* 1000/);

  const barrido = fs.readFileSync(path.join(raiz, "scripts/db/live-sweep.js"), "utf8");
  assert.match(barrido, /status: "ended"/);
  assert.match(barrido, /autoIndex: false/);
  // No borra: cierra. Un directo terminado debe poder consultarse.
  assert.ok(!/deleteOne|deleteMany/.test(barrido), "el barrido no debe borrar salas");

  const rutas = fs.readFileSync(path.join(raiz, "server/src/modules/live/live.routes.js"), "utf8");
  assert.match(rutas, /router\.patch\("\/rooms\/:id\/heartbeat"/);
  assert.match(rutas, /Solo el anfitrión mantiene viva la sala/);
});

test("el chat de la sala y la expulsión cortan por HTTP y por socket", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.join(__dirname, "..", "..");

  const rutas = fs.readFileSync(path.join(raiz, "server/src/modules/live/live.routes.js"), "utf8");
  assert.match(rutas, /router\.get\("\/rooms\/:id\/chat"/);
  assert.match(rutas, /router\.post\("\/rooms\/:id\/chat"/);
  assert.match(rutas, /router\.post\("\/rooms\/:id\/ban"/);
  assert.match(rutas, /router\.delete\("\/rooms\/:id\/ban\/:userId"/);
  assert.match(rutas, /Solo el anfitrión puede expulsar/);
  // El chat avisa por socket a la sala, no solo responde al que escribe.
  assert.match(rutas, /emit\("live:chat"/);

  const acceso = fs.readFileSync(path.join(raiz, "server/src/modules/live/live.access.js"), "utf8");
  assert.match(acceso, /function estaExpulsado/);
  assert.match(acceso, /code: "LIVE_BANNED"/);

  const socket = fs.readFileSync(path.join(raiz, "server/src/realtime/registerSocketHandlers.js"), "utf8");
  // Sin traer `bans.user`, la decisión no puede saber que está expulsado.
  assert.match(socket, /bans\.user/);
});

/* ============================================================
   1.3 — stickers y música (26-11-05)
   ============================================================ */

test("la historia guarda stickers de datos, no imágenes, y tres posiciones", () => {
  const Story = require("../src/modules/stories/Story");

  assert.strictEqual(Story.MAX_STICKERS, 12);
  assert.deepStrictEqual(Story.STICKER_TYPES, ["location", "mention", "hashtag", "poll", "question", "music"]);
  assert.deepStrictEqual(Story.STICKER_POSICIONES, ["abajo", "centro", "arriba"]);
  // Una encuesta vacía no se puede guardar: mínimo dos opciones.
  assert.strictEqual(Story.MAX_STICKER_OPCIONES, 4);

  const esquema = Story.schema;
  assert.ok(esquema.path("stickers"));
  assert.ok(esquema.path("music.trackId"));
  // El título y el autor se copian de la pista: si se retira del catálogo, la
  // historia sigue diciendo qué sonaba.
  assert.ok(esquema.path("music.titulo"));
  assert.ok(esquema.path("music.inicio"));
});

test("la música se resuelve contra el catálogo, no se acepta del cliente", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.join(__dirname, "..", "..");
  const rutas = fs.readFileSync(path.join(raiz, "server/src/modules/stories/stories.routes.js"), "utf8");

  // El título, el autor y la URL salen de la base: el cuerpo solo aporta id.
  assert.match(rutas, /async function resolveStoryMusic/);
  assert.match(rutas, /MusicTrack\.findById\(trackId\)/);
  assert.match(rutas, /if \(!pista \|\| !pista\.publicada\)/);
  assert.ok(!/music:\s*\{\s*titulo:\s*req\.body/.test(rutas), "el título no puede venir del cliente");

  // Votar dos veces cambia el voto, no lo suma.
  assert.match(rutas, /router\.post\("\/:storyId\/stickers\/:index\/vote"/);
  assert.match(rutas, /code: "OWN_POLL"/);
  assert.match(rutas, /\$pull: \{ \[`stickers\.\$\{posicion\}\.votes`\]/);
});

test("las historias se pintan con stickers y la encuesta no se destripa antes de votar", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.join(__dirname, "..", "..");
  const capa = fs.readFileSync(path.join(raiz, "client/src/features/social/stories/StoryOverlays.jsx"), "utf8");

  assert.match(capa, /const POSICIONES = \{/);
  assert.match(capa, /is-top/);
  assert.match(capa, /is-middle/);
  assert.match(capa, /is-bottom/);
  // Mención y etiqueta son enlaces de verdad, no texto muerto.
  assert.match(capa, /to=\{`\/profile\/\$\{sticker\.text\}`\}/);
  assert.match(capa, /to=\{`\/hashtag\/\$\{sticker\.text\}`\}/);
  // Antes de votar se ven las opciones; después, el resultado.
  assert.match(capa, /const mostrarResultado = story\.mine \|\| estado\.myVote !== null;/);
  // La música no suena sola y se reinicia al cambiar de historia.
  assert.match(capa, /audio\.play\(\)/);
  assert.match(capa, /currentTime = Number\(story\.music\?\.inicio\) \|\| 0/);
});

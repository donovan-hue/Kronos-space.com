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
  assert.equal(parseStoryPayload({ media: { url: "/uploads/media/a.jpg", type: "image" }, audience: { type: "orbit" } }).error, "Audiencia no válida");
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
    "/:storyId",
    "/:storyId",
    "/:storyId/view",
    "/:storyId/views",
    "/:storyId/reply",
    "/:storyId/replies"
  ]);
  for (const layer of storiesRouter.stack.filter((item) => item.route)) {
    assert.ok(layer.route.stack.length >= 3, `la ruta ${layer.route.path} debe exigir auth y usuario`);
  }
});

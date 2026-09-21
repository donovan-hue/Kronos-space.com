const test = require("node:test");
const assert = require("node:assert/strict");

const Post = require("../src/modules/posts/Post");
const Draft = require("../src/modules/drafts/Draft");
const { normalizeEvent } = require("../src/modules/posts/normalizePost");

const userA = "65f000000000000000000011";
const userB = "65f000000000000000000012";

function routeFor(path) {
  const routes = require("../src/modules/posts/posts.routes").stack || [];
  return routes.find((layer) => layer.route?.path === path)?.route;
}

test("evento normalizado expone agenda, respuesta actual y agregados sin usuarios", () => {
  const normalized = normalizeEvent({
    title: "Sesión de comunidad",
    description: "Conversación mensual",
    startsAt: "2099-05-01T18:00:00.000Z",
    endsAt: "2099-05-01T19:00:00.000Z",
    timezone: "America/Mexico_City",
    locationType: "online",
    location: "https://meet.example.test",
    rsvps: [
      { user: userA, status: "going" },
      { user: userB, status: "interested" },
      { user: userA, status: "interested" }
    ]
  }, userA);

  assert.equal(normalized.goingCount, 1);
  assert.equal(normalized.interestedCount, 1);
  assert.equal(normalized.response, "going");
  assert.equal(normalized.status, "upcoming");
  assert.equal(normalized.locationType, "online");
  assert.equal("rsvps" in normalized, false);
});

test("modelo de publicación persiste evento y respuestas con límites públicos", () => {
  assert.ok(Post.schema.path("event"));
  assert.equal(Post.schema.path("event.title").options.maxlength, 160);
  assert.equal(Post.schema.path("event.description").options.maxlength, 1000);
  assert.equal(Post.schema.path("event.location").options.maxlength, 300);
  assert.deepEqual(Post.schema.path("event.locationType").enumValues, ["online", "in_person"]);
  assert.equal(Post.schema.path("event.rsvps").instance, "Array");
  assert.deepEqual(Post.schema.path("event.rsvps.status").enumValues, ["interested", "going"]);
  assert.ok(Draft.schema.path("event"));
  assert.equal(Draft.schema.path("event.rsvps"), undefined);
});

test("contrato de creación y RSVP de eventos exige autenticación", () => {
  const createRoute = routeFor("/");
  const rsvpRoute = routeFor("/:postId/event/rsvp");
  assert.ok(createRoute?.stack?.length >= 3);
  assert.ok(rsvpRoute?.stack?.length >= 3);
  assert.equal(rsvpRoute.methods.post, true);
});

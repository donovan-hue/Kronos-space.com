const test = require("node:test");
const assert = require("node:assert");

/**
 * Aviso por correo de las notificaciones (bloque 1.1).
 *
 * Sin base de datos ni red: `sendNotificationEmail` recibe el destinatario ya
 * consultado y la función de envío se inyecta, así que aquí se comprueba la
 * política (a quién sí y a quién no) y el contenido del correo.
 */

process.env.CLIENT_URL = "https://www.kronos-space.com";

const {
  EMAIL_TYPES,
  appBaseUrl,
  destinationPath,
  buildNotificationEmail,
  sendNotificationEmail
} = require("../src/modules/notifications/notificationEmail.service");

const ACTOR = { username: "nova", displayName: "Nova <b>" };

function notif(type, extra = {}) {
  return { type, actor: ACTOR, ...extra };
}

test("cubre los tipos sociales y deja fuera moderación, reporte, sala y cápsula", () => {
  for (const type of ["follow", "like", "comment", "repost", "save", "event", "story"]) {
    assert.ok(EMAIL_TYPES.has(type), `${type} debería tener correo`);
  }
  for (const type of ["moderation", "report", "live", "capsule"]) {
    assert.ok(!EMAIL_TYPES.has(type), `${type} no debe mandarse por correo`);
  }
});

test("el enlace apunta al recurso real, no siempre al perfil", () => {
  assert.equal(destinationPath(notif("like", { post: { _id: "abc123" } })), "/post/abc123");
  assert.equal(destinationPath(notif("story", { ref: { kind: "story", id: "s1" } })), "/stories/archive");
  assert.equal(destinationPath(notif("live", { ref: { kind: "live", id: "l1" } })), "/live");
  assert.equal(destinationPath(notif("capsule", { ref: { kind: "capsule", id: "c1" } })), "/capsules");
  assert.equal(destinationPath(notif("report", { ref: { kind: "report", id: "r1" } })), "/notifications");
  assert.equal(destinationPath(notif("follow")), "/u/nova");
  assert.equal(destinationPath({ type: "follow" }), "/notifications");
});

test("el asunto nombra al actor y la acción", () => {
  const { subject } = buildNotificationEmail(notif("comment"));
  assert.match(subject, /Nova/);
  assert.match(subject, /comentó tu publicación/);
  assert.match(subject, /Kronos Space/);
});

test("el HTML escapa el nombre del actor y la URL", () => {
  const { html } = buildNotificationEmail(notif("follow"));
  assert.ok(html.includes("Nova &lt;b&gt;"));
  assert.ok(!html.includes("<b>")); // el `<b>` del nombre no se cuela como etiqueta
  assert.ok(html.includes("https://www.kronos-space.com/u/nova"));
});

test("la URL base toma el primer origen de CLIENT_URL y quita la barra final", () => {
  const previous = process.env.CLIENT_URL;
  process.env.CLIENT_URL = "https://a.example/, https://b.example/";
  assert.equal(appBaseUrl(), "https://a.example");
  process.env.CLIENT_URL = previous;
});

test("no envía si el usuario no activó el correo", async () => {
  let calls = 0;
  const sent = await sendNotificationEmail({
    notification: notif("like"),
    recipientUser: { email: "a@b.c", preferences: { notifications: { email: false } } },
    send: async () => { calls += 1; }
  });
  assert.equal(sent, false);
  assert.equal(calls, 0);
});

test("no envía tipos que no son sociales aunque el correo esté activo", async () => {
  let calls = 0;
  const sent = await sendNotificationEmail({
    notification: notif("moderation"),
    recipientUser: { email: "a@b.c", preferences: { notifications: { email: true } } },
    send: async () => { calls += 1; }
  });
  assert.equal(sent, false);
  assert.equal(calls, 0);
});

test("no envía si la cuenta no tiene correo", async () => {
  const sent = await sendNotificationEmail({
    notification: notif("follow"),
    recipientUser: { preferences: { notifications: { email: true } } },
    send: async () => { throw new Error("no debería llamarse"); }
  });
  assert.equal(sent, false);
});

test("envía cuando está activo y devuelve true", async () => {
  const calls = [];
  const sent = await sendNotificationEmail({
    notification: notif("save", { post: { _id: "p1" } }),
    recipientUser: { email: "a@b.c", preferences: { notifications: { email: true } } },
    send: async (payload) => { calls.push(payload); }
  });
  assert.equal(sent, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].email, "a@b.c");
  assert.match(calls[0].html, /https:\/\/www\.kronos-space\.com\/post\/p1/);
});

test("un fallo del proveedor no se propaga", async () => {
  const sent = await sendNotificationEmail({
    notification: notif("like"),
    recipientUser: { email: "a@b.c", preferences: { notifications: { email: true } } },
    send: async () => { throw Object.assign(new Error("boom"), { code: "EMAIL_SEND_FAILED" }); }
  });
  assert.equal(sent, false);
});

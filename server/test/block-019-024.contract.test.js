const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");

/**
 * BLOQUE 008 (KRONOS-UI-019…024) — comprobaciones SIN base de datos.
 *
 * La verificación real (MongoDB) vive en block-019-024.e2e.test.js.
 * Aquí se cubre lo que no necesita persistencia: validadores de
 * contenido de mensajes, catálogo de notificaciones, presencia en
 * memoria y montaje de las nuevas rutas (exigen token).
 */
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "kronos-block-019-024-contract-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");
const {
  parseMessageMedia,
  parseClientMessageId,
  MEDIA_URL_PATTERN
} = require("../src/modules/messages/messageMedia");
const presence = require("../src/modules/messages/presence");
const Notification = require("../src/modules/notifications/Notification");

let baseUrl;

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

test.before(async () => {
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

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

// ---------------------------------------------------------------
// 019 — validador de adjuntos
// ---------------------------------------------------------------

test("media ausente o sin valor se acepta como 'sin adjunto'", () => {
  assert.strictEqual(parseMessageMedia({}).value, null);
  assert.strictEqual(parseMessageMedia({}).error, null);
  assert.strictEqual(parseMessageMedia({ media: null }).value, null);
});

test("media válida se normaliza", () => {
  const { value, error } = parseMessageMedia({
    media: {
      url: "/uploads/media/1720000000000-ab12cd34ef56.png",
      mimeType: "image/png",
      size: 68,
      alt: "  alt real  "
    }
  });

  assert.strictEqual(error, null);
  assert.strictEqual(value.url, "/uploads/media/1720000000000-ab12cd34ef56.png");
  assert.strictEqual(value.mimeType, "image/png");
  assert.strictEqual(value.size, 68);
  assert.strictEqual(value.alt, "alt real");
});

test("media de otro subdirectorio o URL ajena se rechaza", () => {
  const foreign = parseMessageMedia({
    media: { url: "/uploads/avatars/x.png", mimeType: "image/png", size: 10 }
  });

  assert.ok(foreign.error, "subdirectorio ajeno");
  assert.strictEqual(foreign.value, null);

  const outside = parseMessageMedia({
    media: { url: "https://externo.com/x.png", mimeType: "image/png", size: 10 }
  });

  assert.ok(outside.error, "URL externa");

  const traversal = parseMessageMedia({
    media: {
      url: "/uploads/media/..%2f..%2fetc%2fpasswd",
      mimeType: "image/png",
      size: 10
    }
  });

  assert.ok(traversal.error, "trampas de ruta");
  assert.ok(!MEDIA_URL_PATTERN.test("/uploads/media/../x.png"));
});

test("media con tipo o tamaño inválido se rechaza", () => {
  const badType = parseMessageMedia({
    media: { url: "/uploads/media/x.png", mimeType: "application/pdf", size: 10 }
  });

  assert.ok(badType.error);

  const badSize = parseMessageMedia({
    media: {
      url: "/uploads/media/x.png",
      mimeType: "image/png",
      size: 11 * 1024 * 1024
    }
  });

  assert.ok(badSize.error);

  const noUrl = parseMessageMedia({
    media: { mimeType: "image/png", size: 10 }
  });

  assert.ok(noUrl.error);

  const notObject = parseMessageMedia({ media: "algo" });
  assert.ok(notObject.error);
});

// ---------------------------------------------------------------
// 021 — validador del id de reenvío
// ---------------------------------------------------------------

test("clientMessageId opcional, texto o error", () => {
  assert.strictEqual(parseClientMessageId({}).value, undefined);
  assert.strictEqual(parseClientMessageId({}).error, null);

  const valid = parseClientMessageId({ clientMessageId: "  abc-123 " });
  assert.strictEqual(valid.value, "abc-123");
  assert.strictEqual(valid.error, null);

  const empty = parseClientMessageId({ clientMessageId: "   " });
  assert.ok(empty.error);

  const wrongType = parseClientMessageId({ clientMessageId: 42 });
  assert.ok(wrongType.error);
});

// ---------------------------------------------------------------
// 023 — catálogo de notificaciones
// ---------------------------------------------------------------

test("el catálogo incluye los tipos que el backend puede crear", () => {
  // Fase 5 (cápsulas): extensión aditiva del catálogo — declarada como
  // dependencia en docs/KRONOS-CAPSULES.md. El bloque 008 sigue cerrado.
  assert.deepStrictEqual(
    [...Notification.NOTIFICATION_TYPES].sort(),
    ["capsule", "comment", "follow", "like", "moderation", "repost", "save"].sort()
  );
});

// ---------------------------------------------------------------
// 020 — presencia en memoria
// ---------------------------------------------------------------

test("presencia: entradas/salidas de usuarios con varios sockets", () => {
  presence.resetPresence();

  assert.strictEqual(presence.isOnline("user-1"), false);
  assert.strictEqual(presence.socketConnected("user-1", "s1"), true, "primera conexión");
  assert.strictEqual(presence.socketConnected("user-1", "s2"), false, "segundo socket del mismo usuario");
  assert.strictEqual(presence.isOnline("user-1"), true);

  assert.strictEqual(
    presence.socketDisconnected("user-1", "s1"),
    false,
    "queda un socket vivo"
  );
  assert.strictEqual(presence.isOnline("user-1"), true);

  assert.strictEqual(
    presence.socketDisconnected("user-1", "s2"),
    true,
    "sin sockets, sale de línea"
  );
  assert.strictEqual(presence.isOnline("user-1"), false);

  // Desconectar de nuevo no rompe nada.
  assert.strictEqual(presence.socketDisconnected("user-1", "s2"), false);

  presence.resetPresence();
});

// ---------------------------------------------------------------
// Montaje de rutas nuevas: exigen token (sin tocar base)
// ---------------------------------------------------------------

test("las rutas nuevas están montadas y exigen autenticación", async () => {
  const paths = [
    ["GET", "/api/messages"],
    ["POST", "/api/messages/media/upload"],
    ["GET", "/api/messages/64b5f5f0f0f0f0f0f0f0f0f0"],
    ["PATCH", "/api/messages/64b5f5f0f0f0f0f0f0f0f0f0/delivered"],
    ["GET", "/api/conversations"],
    ["POST", "/api/conversations"],
    ["GET", "/api/conversations/64b5f5f0f0f0f0f0f0f0f0f0/messages"],
    ["GET", "/api/notifications"]
  ];

  for (const [method, path] of paths) {
    const response = await request(path, { method });
    assert.strictEqual(response.status, 401, `${method} ${path} debe exigir token`);
  }
});

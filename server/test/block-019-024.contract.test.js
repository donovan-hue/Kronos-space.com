const fs = require("node:fs");
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
  mediaKindOf,
  MEDIA_URL_PATTERN,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  MAX_AUDIO_SIZE
} = require("../src/modules/messages/messageMedia");
const { deleteMessageByAuthor } = require("../src/modules/messages/deleteMessage");
const presence = require("../src/modules/messages/presence");
const Notification = require("../src/modules/notifications/Notification");
const Message = require("../src/modules/messages/Message");

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

test("el índice de idempotencia está acotado al destino del mensaje", () => {
  const indexes = Message.schema.indexes();
  const names = indexes.map(([keys, options]) => options?.name || Object.keys(keys).join("_"));
  assert.ok(names.includes("message_sender_receiver_clientMessageId_unique"));
  assert.ok(names.includes("message_sender_conversation_clientMessageId_unique"));
  assert.equal(
    indexes.some(([keys]) => Object.keys(keys).join(",") === "sender,clientMessageId"),
    false,
    "no queda el índice global por remitente"
  );
});

// ---------------------------------------------------------------
// 023 — catálogo de notificaciones
// ---------------------------------------------------------------

test("el catálogo incluye los tipos que el backend puede crear", () => {
  // Extensiones aditivas y verificadas contra sus emisores reales:
  //   capsule (cápsulas: apertura e invitación), event (RSVP del autor),
  //   story (respuesta a una historia), live (invitación a sala) y
  //   report (resolución de un reporte para el denunciante).
  assert.deepStrictEqual(
    [...Notification.NOTIFICATION_TYPES].sort(),
    [
      "capsule",
      "comment",
      "event",
      "follow",
      "like",
      "live",
      "moderation",
      "report",
      "repost",
      "save",
      "story"
    ].sort()
  );
});

test("023: cada tipo del catálogo tiene emisor en el código", () => {
  // Un tipo declarado sin emisor es un filtro que nunca devuelve nada: así
  // estaba `save` (la ruta /save no avisaba). Este test recorre los módulos y
  // exige que el tipo aparezca en un `notifySafely`/`createNotification`.
  const { execFileSync } = require("node:child_process");
  const root = require("node:path").join(__dirname, "..", "src", "modules");
  const sinEmisor = [];

  for (const type of Notification.NOTIFICATION_TYPES) {
    let found = "";
    try {
      found = execFileSync(
        "grep",
        ["-rl", `type: "${type}"`, root],
        { encoding: "utf8" }
      );
    } catch {
      found = "";
    }
    // Los tipos que la propia UI/registro consume sin emisor de aviso (porque
    // el aviso lo emite otra ruta con este mismo nombre) se listan aquí.
    if (!found.trim()) sinEmisor.push(type);
  }

  assert.deepStrictEqual(sinEmisor, []);
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


// ---------------------------------------------------------------
// 027 — mensajería del bloque 1.4: adjuntos de video/audio, borrado con
// lápida, renombrar y salir de un grupo.
// ---------------------------------------------------------------

test("027: los adjuntos admiten video y audio con su propio límite", () => {
  const video = parseMessageMedia({
    media: { url: "/uploads/media/clip.mp4", mimeType: "video/mp4", size: 30 * 1024 * 1024 }
  });
  assert.strictEqual(video.error, null);
  assert.strictEqual(video.value.kind, "video");

  const audio = parseMessageMedia({
    media: { url: "/uploads/media/nota.m4a", mimeType: "audio/x-m4a", size: 2 * 1024 * 1024 }
  });
  assert.strictEqual(audio.error, null);
  assert.strictEqual(audio.value.kind, "audio");

  // Antes solo entraban imágenes: un video válido de 30 MB se rechazaba.
  assert.strictEqual(mediaKindOf("image/webp"), "image");
  assert.strictEqual(mediaKindOf("application/pdf"), "");

  // Cada tipo tiene su tope: el de imagen no se hereda al video.
  assert.strictEqual(MAX_IMAGE_SIZE, 10 * 1024 * 1024);
  assert.strictEqual(MAX_VIDEO_SIZE, 50 * 1024 * 1024);
  assert.strictEqual(MAX_AUDIO_SIZE, 15 * 1024 * 1024);

  assert.ok(
    parseMessageMedia({
      media: { url: "/uploads/media/x.png", mimeType: "image/png", size: 11 * 1024 * 1024 }
    }).error,
    "una imagen de 11 MB sigue sin caber"
  );
  assert.ok(
    parseMessageMedia({
      media: { url: "/uploads/media/x.mp4", mimeType: "video/mp4", size: 51 * 1024 * 1024 }
    }).error,
    "un video de 51 MB no cabe"
  );
});

test("027: el mensaje guarda el tipo de adjunto que decidió el servidor", () => {
  const kind = Message.schema.path("media.kind");
  assert.deepStrictEqual(kind.enumValues, ["", "image", "video", "audio"]);
  assert.strictEqual(kind.options.default, "");

  // La lápida de borrado existe y por defecto es null (mensaje vivo).
  const deletedAt = Message.schema.path("deletedAt");
  assert.ok(deletedAt);
  assert.strictEqual(deletedAt.options.default, null);
});

test("027: solo el autor borra, la lápida es idempotente y rechaza ids inválidos", async () => {
  const invalid = await deleteMessageByAuthor({ messageId: "no-es-id", userId: "u1" });
  assert.strictEqual(invalid.status, 400);

  // Sin base de datos no se puede montar un documento real: se comprueba el
  // contrato de autorización con un stub sobre el modelo.
  const originalFind = Message.findById;
  const originalUpdate = Message.updateOne;
  const message = {
    _id: "64b5f5f0f0f0f0f0f0f0f0f1",
    sender: "64b5f5f0f0f0f0f0f0f0f0f2",
    receiver: "64b5f5f0f0f0f0f0f0f0f0f3",
    media: { url: "/uploads/media/x.png" }
  };
  let updates = 0;

  Message.findById = () => ({ lean: async () => message });
  Message.updateOne = async () => {
    updates += 1;
    return { modifiedCount: 1 };
  };

  try {
    const foreign = await deleteMessageByAuthor({ messageId: message._id, userId: "64b5f5f0f0f0f0f0f0f0f0f9" });
    assert.strictEqual(foreign.status, 403);
    assert.strictEqual(updates, 0, "un tercero no debe escribir nada");

    const own = await deleteMessageByAuthor({ messageId: message._id, userId: message.sender });
    assert.strictEqual(own.status, 200);
    assert.strictEqual(own.body.deleted, true);
    assert.strictEqual(updates, 1);

    // Ya borrado: responder 200 otra vez no es un error ni reescribe.
    message.deletedAt = new Date();
    const again = await deleteMessageByAuthor({ messageId: message._id, userId: message.sender });
    assert.strictEqual(again.status, 200);
    assert.strictEqual(updates, 1, "el segundo borrado no vuelve a escribir");
  } finally {
    Message.findById = originalFind;
    Message.updateOne = originalUpdate;
  }
});

test("027: el historial de un hilo pide los 200 últimos, no los 200 primeros", () => {
  const source = fs.readFileSync(
    require.resolve("../src/modules/messages/messages.routes.js"),
    "utf8"
  );
  const block = source.slice(source.indexOf("const recent = await Message.find"));
  const snippet = block.slice(0, block.indexOf(".lean();"));

  assert.match(snippet, /sort\(\{ createdAt: -1 \}\)/, "orden descendente al consultar");
  assert.match(snippet, /limit\(200\)/);
  assert.match(block.slice(0, block.indexOf("return res.json")), /recent\.reverse\(\)/);
});

test("027: grupos — renombrar y salir existen y respetan al creador", () => {
  const source = fs.readFileSync(
    require.resolve("../src/modules/conversations/conversations.routes.js"),
    "utf8"
  );

  assert.match(source, /router\.patch\("\/:conversationId", auth, requireUser/);
  assert.match(source, /Solo el creador puede cambiar el nombre del grupo/);
  assert.match(source, /router\.delete\("\/:conversationId\/members\/me"/);
  assert.match(source, /El creador no puede salir de su propio grupo/);
  assert.match(source, /router\.delete\("\/:conversationId\/messages\/:messageId"/);

  // La respuesta de cambios de miembros devuelve `createdBy`: sin él la UI
  // perdía el rol del creador tras el primer cambio.
  assert.match(source, /createdBy: conversation\.createdBy/);
});

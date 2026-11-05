const test = require("node:test");
const assert = require("node:assert/strict");

const {
  joinDecision,
  leaveDecision,
  socketJoinDecision,
  canViewLiveRoom
} = require("../src/modules/live/live.access");

const host = "64b000000000000000000001";
const guest = "64b000000000000000000002";
const stranger = "64b000000000000000000003";

function room(overrides = {}) {
  return {
    status: "active",
    isPublic: true,
    host,
    maxParticipants: 2,
    participants: [{ user: host, role: "host" }],
    ...overrides
  };
}

test("una sala pública admite a un extraño mientras haya cupo", () => {
  const decision = joinDecision(room(), stranger);

  assert.equal(decision.ok, true);
  assert.equal(decision.isParticipant, false);
});

test("una sala llena rechaza a quien todavía no es participante", () => {
  const decision = joinDecision(room({
    participants: [{ user: host }, { user: guest }]
  }), stranger);

  assert.equal(decision.ok, false);
  assert.equal(decision.status, 409);
  assert.equal(decision.code, "LIVE_FULL");
});

test("conocer el id de una sala privada no autoriza a unirse", () => {
  const privateRoom = room({ isPublic: false });

  const http = joinDecision(privateRoom, stranger);
  const socket = socketJoinDecision(privateRoom, stranger);

  assert.equal(http.ok, false);
  assert.equal(http.status, 403);
  assert.equal(http.code, "LIVE_FORBIDDEN");
  assert.equal(socket.code, "LIVE_FORBIDDEN");
  assert.equal(canViewLiveRoom(privateRoom, stranger), false);
  assert.equal(canViewLiveRoom(privateRoom, guest), false);
});

test("un invitado ya participante sí puede entrar a la sala privada", () => {
  const privateRoom = room({
    isPublic: false,
    participants: [{ user: host }, { user: guest }]
  });

  assert.equal(joinDecision(privateRoom, guest).ok, true);
  assert.equal(socketJoinDecision(privateRoom, guest).ok, true);
  assert.equal(canViewLiveRoom(privateRoom, guest), true);
});

test("el anfitrión no abandona una sala activa: tiene que finalizarla", () => {
  const decision = leaveDecision(room(), host);

  assert.equal(decision.ok, false);
  assert.equal(decision.status, 400);
  assert.equal(decision.code, "LIVE_HOST_MUST_END");
  assert.equal(leaveDecision(room(), guest).ok, true);
});

test("una sala terminada no se vuelve a abrir", () => {
  const ended = room({ status: "ended" });

  assert.equal(joinDecision(ended, stranger).code, "LIVE_ENDED");
  assert.equal(socketJoinDecision(ended, stranger).code, "LIVE_ENDED");
});

// ---------------------------------------------------------------
// 028 — bloque 1.5: TURN configurable, salas visibles solo con sesión y
// tope de participantes expuesto.
// ---------------------------------------------------------------

const fs = require("node:fs");
const { resolveIceServers, isValidIceUrl } = require("../src/config/iceServers");

test("028: sin configuración solo hay STUN, y no se inventa un TURN", () => {
  const bare = resolveIceServers({});
  assert.strictEqual(bare.hasTurn, false);
  assert.deepStrictEqual(bare.servers, [{ urls: ["stun:stun.l.google.com:19302"] }]);
});

test("028: con TURN configurado el cliente recibe las credenciales", () => {
  const ice = resolveIceServers({
    LIVE_STUN_URLS: "stun:stun.example.com:3478, stuns:stun.example.com:5349",
    LIVE_TURN_URLS: "turn:turn.example.com:3478?transport=udp",
    LIVE_TURN_USERNAME: "kronos",
    LIVE_TURN_CREDENTIAL: "secreto"
  });

  assert.strictEqual(ice.hasTurn, true);
  assert.deepStrictEqual(ice.servers[0], {
    urls: ["stun:stun.example.com:3478", "stuns:stun.example.com:5349"]
  });
  assert.deepStrictEqual(ice.servers[1], {
    urls: ["turn:turn.example.com:3478?transport=udp"],
    username: "kronos",
    credential: "secreto"
  });
});

test("028: una URL que WebRTC no entiende no entra en la lista ICE", () => {
  assert.strictEqual(isValidIceUrl("turn:host:3478"), true);
  assert.strictEqual(isValidIceUrl("https://evil.example/turn"), false);
  assert.strictEqual(isValidIceUrl("javascript:alert(1)"), false);

  const ice = resolveIceServers({
    LIVE_TURN_URLS: "https://evil.example/turn, turn:ok.example:3478",
    LIVE_STUN_URLS: "file:///etc/passwd"
  });

  // El STUN inválido cae al público por defecto; el TURN malo se descarta.
  assert.deepStrictEqual(ice.servers[0], { urls: ["stun:stun.l.google.com:19302"] });
  assert.deepStrictEqual(ice.servers[1].urls, ["turn:ok.example:3478"]);
});

test("028: la lista de salas exige sesión y excluye a quien te bloqueó", () => {
  const source = fs.readFileSync(
    require.resolve("../src/modules/live/live.routes.js"),
    "utf8"
  );

  // Antes: `router.get("/rooms", async ...)` — sin `auth`.
  assert.match(source, /router\.get\("\/rooms", auth, requireUser/);
  assert.match(source, /getExcludedUserIds\(req\.user\.id\)/);
  assert.match(source, /filter\.host = \{ \$nin: excluded \}/);

  // Y una sala pública de alguien bloqueado tampoco se abre por su id.
  assert.match(source, /isBlockedBetween\(req\.user\.id, room\.host/);

  // Las credenciales ICE son de sesión, no públicas.
  assert.match(source, /router\.get\("\/ice", auth, requireUser/);
});

test("028: el tope de participantes viaja en la sala normalizada", () => {
  const source = fs.readFileSync(
    require.resolve("../src/modules/live/live.routes.js"),
    "utf8"
  );

  assert.match(source, /maxParticipants: roomCapacity\(room\)/);
  // El servidor ya topaba en 500 al crear; ahora el cliente puede enviarlo.
  assert.match(source, /Math\.min\(maxParticipants, 500\)/);
});

/* ============================================================
   1.5 — denuncia desde la sala (26-11-05)
   ============================================================ */

test("una sala de directo se puede denunciar, y solo si se puede ver", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raiz = path.join(__dirname, "..", "..");

  const reporte = fs.readFileSync(path.join(raiz, "server/src/modules/moderation/Report.js"), "utf8");
  assert.match(reporte, /const REPORT_TARGET_TYPES = \["user", "post", "comment", "live"\]/);

  const rutas = fs.readFileSync(path.join(raiz, "server/src/modules/moderation/moderation.routes.js"), "utf8");
  assert.match(rutas, /targetType === "live"/);
  assert.match(rutas, /const LiveRoom = require\("\.\.\/live\/LiveRoom"\)/);
  // Una sala privada que no es tuya responde 404, igual que si no existiera:
  // así el reporte no sirve para descubrir salas ajenas.
  assert.match(rutas, /if \(!puedeVerla\) \{\s*return res\.status\(404\)/);

  const dialogo = fs.readFileSync(path.join(raiz, "client/src/features/live/Live.jsx"), "utf8");
  assert.match(dialogo, /targetType="live"/);
  assert.match(dialogo, /Denunciar/);
});

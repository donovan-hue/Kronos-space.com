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

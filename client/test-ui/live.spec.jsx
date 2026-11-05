import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Live from "../src/features/live/Live";
import { captureLiveMedia } from "../src/features/live/liveMedia";
import * as service from "../src/services/liveService";
import * as sockets from "../src/services/socket";

vi.mock("../src/services/liveService", () => ({
  getLiveRooms: vi.fn(), getMyLiveRooms: vi.fn(), getLiveRoomById: vi.fn(),
  createLiveRoom: vi.fn(), joinLiveRoom: vi.fn(), leaveLiveRoom: vi.fn(),
  endLiveRoom: vi.fn(), inviteToLiveRoom: vi.fn(), getLiveIceServers: vi.fn(),
  // Bloque 1.5: latido del anfitrión, chat de sala y expulsión. Van en el mock
  // porque `Live.jsx` los importa: sin ellos el módulo simulado no existe y la
  // pantalla ni monta.
  heartbeatLiveRoom: vi.fn(() => Promise.resolve({})), getLiveChat: vi.fn(() => Promise.resolve([])),
  sendLiveChat: vi.fn(), banFromLiveRoom: vi.fn(), unbanFromLiveRoom: vi.fn()
}));
vi.mock("../src/services/authStorage", () => ({ getUser: () => ({ _id: "owner" }), getToken: () => "test-token" }));
vi.mock("../src/services/socket", () => ({ connectSocket: vi.fn(), getSocket: vi.fn() }));

function track(kind) {
  const value = { kind, enabled: true, readyState: "live", onended: null };
  value.stop = vi.fn(() => { value.readyState = "ended"; });
  return value;
}
function stream(tracks) {
  return { getTracks: () => [...tracks], getAudioTracks: () => tracks.filter(t => t.kind === "audio"),
    getVideoTracks: () => tracks.filter(t => t.kind === "video"), addTrack: t => tracks.push(t) };
}
const room = (type = "video", host = "owner") => ({ _id: "room-real", title: "Sesión de prueba", type, host, isPublic: true });
let devices;
let microphone;
let camera;
let display;
let previousDevices;

beforeEach(() => {
  vi.resetAllMocks();
  microphone = track("audio"); camera = track("video"); display = track("video");
  devices = {
    getUserMedia: vi.fn(async constraints => stream(constraints.video ? [microphone, camera] : [microphone])),
    getDisplayMedia: vi.fn(async () => stream([display]))
  };
  previousDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: devices });
  const listeners = new Map();
  const socket = {
    on: vi.fn((name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); }),
    off: vi.fn((name, fn) => listeners.get(name)?.delete(fn)),
    emit: vi.fn((name, payload) => {
      if (name === "live:join") queueMicrotask(() => {
        for (const fn of [...(listeners.get("live:joined") || [])]) fn({ roomId: payload.roomId });
      });
    })
  };
  sockets.getSocket.mockReturnValue(socket);
  sockets.connectSocket.mockReturnValue(socket);
  service.getLiveIceServers.mockResolvedValue({
    servers: [{ urls: ["stun:stun.test:3478"] }],
    hasTurn: false
  });
  service.getLiveRooms.mockResolvedValue({ rooms: [] });
  service.getMyLiveRooms.mockResolvedValue({ rooms: [] });
  service.createLiveRoom.mockImplementation(async data => ({ room: room(data.type) }));
  service.joinLiveRoom.mockResolvedValue({ ok: true });
  service.endLiveRoom.mockResolvedValue({ ok: true });
  service.leaveLiveRoom.mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  if (previousDevices) Object.defineProperty(navigator, "mediaDevices", previousDevices);
  else delete navigator.mediaDevices;
});

async function create(type) {
  render(<MemoryRouter><Live /></MemoryRouter>);
  await screen.findByText("No hay salas públicas.");
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Sesión de prueba" } });
  fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: type } });
  fireEvent.click(screen.getByRole("button", { name: "Empezar", exact: true }));
}

test("micrófono y cámara cambian las pistas reales, no solo el texto del botón", async () => {
  await create("video");
  fireEvent.click(await screen.findByRole("button", { name: "Silenciar micrófono" }));
  expect(microphone.enabled).toBe(false);
  expect(screen.getByRole("button", { name: "Activar micrófono" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Apagar cámara" }));
  expect(camera.enabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Activar micrófono" }));
  expect(microphone.enabled).toBe(true);
  expect(devices.getUserMedia).toHaveBeenCalledTimes(1);
});

test("pantalla pide permiso antes del POST de creación e incorpora el micrófono", async () => {
  await create("screen");
  const player = await screen.findByLabelText("Tu pantalla compartida");
  await waitFor(() => expect(player.srcObject).toBeTruthy());
  expect(devices.getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
  expect(devices.getDisplayMedia.mock.invocationCallOrder[0]).toBeLessThan(service.createLiveRoom.mock.invocationCallOrder[0]);
  expect(service.createLiveRoom).toHaveBeenCalledWith(expect.objectContaining({ type: "screen" }));
  expect(player.srcObject.getTracks()).toEqual([display, microphone]);
  expect(screen.queryByRole("button", { name: "Apagar cámara" })).toBeNull();
  expect(camera.enabled).toBe(true);
});

test("cancelar el selector de pantalla no crea una sala ni abre el micrófono", async () => {
  devices.getDisplayMedia.mockRejectedValue(new Error("Selección cancelada"));
  await create("screen");
  expect((await screen.findByRole("alert")).textContent).toContain("Selección cancelada");
  expect(service.createLiveRoom).not.toHaveBeenCalled();
  expect(devices.getUserMedia).not.toHaveBeenCalled();
});

test("si el micrófono falla se detiene la captura de pantalla ya autorizada", async () => {
  devices.getUserMedia.mockRejectedValue(new Error("Micrófono denegado"));
  await expect(captureLiveMedia("screen", devices)).rejects.toThrow("Micrófono denegado");
  expect(display.stop).toHaveBeenCalled();
});

test("un invitado en una sala de pantalla solo autoriza su micrófono, nunca su escritorio", async () => {
  service.getLiveRooms.mockResolvedValue({ rooms: [room("screen", "another-owner")] });
  render(<MemoryRouter><Live /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Entrar", exact: true }));
  await screen.findByRole("button", { name: "Salir", exact: true });
  expect(devices.getDisplayMedia).not.toHaveBeenCalled();
  expect(devices.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
});

test("Dejar de compartir del navegador también detiene el audio y finaliza la sala", async () => {
  await create("screen");
  await screen.findByLabelText("Tu pantalla compartida");
  await act(async () => { display.readyState = "ended"; display.onended(); });
  expect(microphone.stop).toHaveBeenCalled();
  await waitFor(() => expect(service.endLiveRoom).toHaveBeenCalledWith("room-real"));
  expect(screen.queryByLabelText("Tu pantalla compartida")).toBeNull();
});

test("un fallo de cierre no deja una sala muerta en pantalla: detiene pistas y permite reintentar", async () => {
  service.endLiveRoom.mockRejectedValueOnce(new Error("sin conexión"));
  await create("video");
  fireEvent.click(await screen.findByRole("button", { name: "Finalizar", exact: true }));
  const retry = await screen.findByRole("button", { name: "Reintentar cierre de la sala" });
  expect(microphone.stop).toHaveBeenCalled();
  expect(camera.stop).toHaveBeenCalled();
  expect(screen.queryByRole("region", { name: "Sala actual" })).toBeNull();
  fireEvent.click(retry);
  await waitFor(() => expect(service.endLiveRoom).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Reintentar cierre de la sala" })).toBeNull());
});

test("fallo del POST de sala libera pantalla y micrófono, sin fingir entrada", async () => {
  service.createLiveRoom.mockRejectedValueOnce(new Error("servidor no disponible"));
  await create("screen");
  await screen.findByRole("alert");
  expect(display.stop).toHaveBeenCalled();
  expect(microphone.stop).toHaveBeenCalled();
  expect(service.joinLiveRoom).not.toHaveBeenCalled();
});

test("un navegador sin captura de pantalla lo indica sin prometer una acción disponible", async () => {
  delete devices.getDisplayMedia;
  render(<MemoryRouter><Live /></MemoryRouter>);
  expect(screen.getByRole("option", { name: "Compartir pantalla y micrófono" }).disabled).toBe(true);
  expect(screen.getByText(/Este navegador no admite compartir pantalla/)).toBeTruthy();
  await expect(captureLiveMedia("screen", devices)).rejects.toThrow(/no permite compartir pantalla/);
});


test("micrófono o cámara denegados no dejan una sala recién creada sin transmisión", async () => {
  devices.getUserMedia.mockRejectedValue(new Error("Permiso denegado"));
  await create("video");
  await screen.findByRole("alert");
  expect(service.createLiveRoom).not.toHaveBeenCalled();
});

test("error de carga de salas no se confunde con una lista vacía", async () => {
  service.getLiveRooms.mockRejectedValueOnce(new Error("Red no disponible"));
  render(<MemoryRouter><Live /></MemoryRouter>);
  const retry = await screen.findByRole("button", { name: "Reintentar carga de salas" });
  expect(screen.queryByText("No hay salas públicas.")).toBeNull();
  fireEvent.click(retry);
  expect(await screen.findByText("No hay salas públicas.")).toBeTruthy();
});

test("si la captura termina de autorizarse después de desmontar, se detienen las pistas sin crear una sala", async () => {
  let authorize;
  devices.getUserMedia.mockReturnValue(new Promise(resolve => { authorize = resolve; }));
  const view = render(<MemoryRouter><Live /></MemoryRouter>);
  await screen.findByText("No hay salas públicas.");
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Prueba cancelada" } });
  fireEvent.click(screen.getByRole("button", { name: "Empezar", exact: true }));
  view.unmount();
  await act(async () => { authorize(stream([microphone])); });
  expect(microphone.stop).toHaveBeenCalled();
  expect(service.createLiveRoom).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------
// Bloque 1.5 — TURN, tope de participantes, salas nuevas y ?room=
// ---------------------------------------------------------------

test("las conexiones usan los servidores ICE del despliegue, no un STUN fijo", async () => {
  const created = [];
  class FakeRTCPeerConnection {
    constructor(config) {
      created.push(config);
      this.signalingState = "stable";
    }
    addTrack() {}
    close() {}
  }
  const previous = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = FakeRTCPeerConnection;
  service.getLiveIceServers.mockResolvedValue({
    servers: [{ urls: ["turn:turn.test:3478"], username: "u", credential: "c" }],
    hasTurn: true
  });

  try {
    await create("video");
    await waitFor(() => expect(service.getLiveIceServers).toHaveBeenCalled());
    // Sin pares no hay conexión: el aviso de la cabecera dice que hay TURN.
    expect(await screen.findByText(/servidor de retransmisión \(TURN\)/)).toBeTruthy();
  } finally {
    globalThis.RTCPeerConnection = previous;
  }
});

test("sin TURN configurado la interfaz lo dice en lugar de prometer cobertura", async () => {
  render(<MemoryRouter><Live /></MemoryRouter>);
  await screen.findByText("No hay salas públicas.");

  expect(screen.getByText(/no tiene servidor de retransmisión \(TURN\)/)).toBeTruthy();
});

test("el tope de participantes viaja al crear la sala", async () => {
  render(<MemoryRouter><Live /></MemoryRouter>);
  await screen.findByText("No hay salas públicas.");

  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Sala con tope" } });
  fireEvent.change(screen.getByLabelText("Máximo de participantes"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "Empezar", exact: true }));

  await waitFor(() =>
    expect(service.createLiveRoom).toHaveBeenCalledWith(
      expect.objectContaining({ maxParticipants: 12 })
    )
  );
});

test("una sala pública nueva aparece sin recargar la página", async () => {
  render(<MemoryRouter><Live /></MemoryRouter>);
  await screen.findByText("No hay salas públicas.");

  const socket = sockets.getSocket();
  const handler = socket.on.mock.calls.find(([name]) => name === "live:room-started")?.[1];
  expect(handler).toBeTruthy();

  act(() => {
    handler({ _id: "room-nueva", title: "Recién abierta", host: { _id: "otro" }, type: "audio", isPublic: true });
  });

  expect(await screen.findByText("Recién abierta")).toBeTruthy();
});

test("un enlace /live?room=<id> ofrece entrar a esa sala, no a la lista", async () => {
  service.getLiveRoomById.mockResolvedValue({
    room: { _id: "room-link", title: "Sala del enlace", host: { _id: "otro" }, type: "video", isPublic: true }
  });

  render(
    <MemoryRouter initialEntries={["/live?room=room-link"]}>
      <Live />
    </MemoryRouter>
  );

  expect(await screen.findByText("Sala del enlace")).toBeTruthy();
  expect(service.getLiveRoomById).toHaveBeenCalledWith("room-link");
  // No entra sola: pide permiso antes de encender cámara o micrófono.
  expect(devices.getUserMedia).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
});

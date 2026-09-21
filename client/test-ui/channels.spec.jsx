import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Channels from "../src/features/social/Channels";
import * as channels from "../src/services/channelsService";
import * as orbits from "../src/services/orbitsService";

vi.mock("../src/services/channelsService", () => ({
  createChannel: vi.fn(),
  getChannelMessages: vi.fn(),
  getChannels: vi.fn(),
  sendChannelMessage: vi.fn(),
  subscribeChannel: vi.fn(),
  unsubscribeChannel: vi.fn()
}));

vi.mock("../src/services/orbitsService", () => ({ getOrbits: vi.fn() }));

const CHANNEL = {
  _id: "channel-1",
  orbit: { _id: "orbit-1", name: "Comunidad", slug: "comunidad" },
  name: "Anuncios",
  description: "Novedades del espacio",
  type: "discussion",
  subscribersCount: 1,
  subscribed: false,
  manageable: false,
  lastMessageAt: null
};

const ORBIT = { _id: "orbit-1", name: "Comunidad", role: "owner", joined: true };

beforeEach(() => {
  vi.resetAllMocks();
  channels.getChannels.mockResolvedValue([CHANNEL]);
  channels.getChannelMessages.mockResolvedValue({ messages: [], total: 0 });
  channels.subscribeChannel.mockResolvedValue({ ...CHANNEL, subscribed: true, subscribersCount: 2 });
  channels.unsubscribeChannel.mockResolvedValue({ ...CHANNEL, subscribed: false, subscribersCount: 1 });
  channels.sendChannelMessage.mockResolvedValue({ _id: "message-1", text: "Hola canal", author: { username: "yo" }, createdAt: "2026-09-21T12:00:00.000Z" });
  channels.createChannel.mockResolvedValue({ ...CHANNEL, _id: "channel-2", name: "Debate", manageable: true, subscribed: true });
  orbits.getOrbits.mockResolvedValue([ORBIT]);
});

afterEach(() => cleanup());

function mount() {
  return render(<MemoryRouter><Channels /></MemoryRouter>);
}

test("suscribe a un canal de discusión y publica mediante el contrato real", async () => {
  mount();

  expect(await screen.findByRole("heading", { name: "# Anuncios" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Suscribirme" }));
  await waitFor(() => expect(channels.subscribeChannel).toHaveBeenCalledWith("channel-1"));

  fireEvent.change(screen.getByRole("textbox", { name: "Mensaje del canal" }), { target: { value: "Hola canal" } });
  fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
  await waitFor(() => expect(channels.sendChannelMessage).toHaveBeenCalledWith("channel-1", "Hola canal"));
});

test("responsable crea un canal dentro de su órbita", async () => {
  mount();

  fireEvent.change(await screen.findByRole("textbox", { name: "Nombre" }), { target: { value: "Debate" } });
  fireEvent.click(screen.getByRole("button", { name: "Crear canal" }));
  await waitFor(() => expect(channels.createChannel).toHaveBeenCalledWith(expect.objectContaining({ orbitId: "orbit-1", name: "Debate" })));
});

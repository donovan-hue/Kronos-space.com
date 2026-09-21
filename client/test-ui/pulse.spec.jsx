import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Pulse from "../src/features/pulse/Pulse";
import * as pulseService from "../src/services/pulseService";
import * as authStorage from "../src/services/authStorage";

vi.mock("../src/services/pulseService", () => ({
  getPulseSession: vi.fn(),
  markPostSeen: vi.fn(),
  signalPost: vi.fn(),
  getMySignals: vi.fn()
}));

vi.mock("../src/services/authStorage", () => ({
  getUser: vi.fn()
}));

function post(overrides = {}) {
  return {
    _id: "post-1",
    author: { _id: "u1", username: "ana", displayName: "Ana", avatar: "" },
    content: "Publicación del pulso",
    media: { url: "", type: "" },
    mediaItems: [],
    commentsCount: 0,
    recommendationReason: "Reciente en tu red",
    ...overrides
  };
}

function session(posts) {
  return { posts, sessionSize: posts.length, limit: 8, completed: posts.length === 0, moreTags: [], lessTags: [] };
}

beforeEach(() => {
  vi.resetAllMocks();
  authStorage.getUser.mockReturnValue({ _id: "user-me", username: "donovan" });
  pulseService.getPulseSession.mockResolvedValue(session([post()]));
  pulseService.markPostSeen.mockResolvedValue({ seen: true });
  pulseService.signalPost.mockResolvedValue({ signaled: true, tags: ["arte"], direction: "more" });
});

afterEach(() => cleanup());

test("la sesión muestra una publicación a la vez con su explicación", async () => {
  render(
    <MemoryRouter>
      <Pulse />
    </MemoryRouter>
  );

  expect(await screen.findByText("Publicación del pulso")).toBeTruthy();
  expect(screen.getByText("Por qué aparece: Reciente en tu red")).toBeTruthy();
  expect(screen.getByText("1 de 1")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Visto · siguiente/ })).toBeTruthy();
});

test("marcar visto avanza y termina la sesión con fin explícito", async () => {
  pulseService.getPulseSession.mockResolvedValue(session([
    post(),
    post({ _id: "post-2", content: "Segunda del pulso" })
  ]));

  render(
    <MemoryRouter>
      <Pulse />
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByRole("button", { name: /Visto · siguiente/ }));
  await waitFor(() => expect(pulseService.markPostSeen).toHaveBeenCalledWith("post-1"));
  expect(await screen.findByText("Segunda del pulso")).toBeTruthy();
  expect(screen.getByText("2 de 2")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /Visto · siguiente/ }));
  await waitFor(() => expect(pulseService.markPostSeen).toHaveBeenCalledWith("post-2"));
  expect(await screen.findByRole("heading", { name: "Sesión completa" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Empezar otra sesión" })).toBeTruthy();
});

test("las señales más/menos usan los endpoints reales y avanzan", async () => {
  render(
    <MemoryRouter>
      <Pulse />
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByRole("button", { name: /Más como esto/ }));
  await waitFor(() => expect(pulseService.signalPost).toHaveBeenCalledWith("post-1", "more"));
  await waitFor(() => expect(pulseService.markPostSeen).not.toHaveBeenCalled());
  expect(await screen.findByRole("heading", { name: "Sesión completa" })).toBeTruthy();

  // La señal no marca como visto: el flujo avanza sin consumir la sesión.
});

test("la sesión vacía termina de inmediato con estado honesto", async () => {
  pulseService.getPulseSession.mockResolvedValue(session([]));

  render(
    <MemoryRouter>
      <Pulse />
    </MemoryRouter>
  );

  expect(await screen.findByRole("heading", { name: "Sesión completa" })).toBeTruthy();
  expect(pulseService.markPostSeen).not.toHaveBeenCalled();
});

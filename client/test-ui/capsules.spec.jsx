import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Capsules from "../src/features/capsules/Capsules";
import * as capsulesService from "../src/services/capsulesService";

vi.mock("../src/services/capsulesService", () => ({
  addCapsuleMessage: vi.fn(),
  cancelCapsule: vi.fn(),
  createCapsule: vi.fn(),
  deleteCapsule: vi.fn(),
  getCapsules: vi.fn(),
  inviteCapsuleContributor: vi.fn(),
  sealCapsule: vi.fn()
}));

beforeEach(() => {
  vi.resetAllMocks();
  capsulesService.getCapsules.mockResolvedValue([]);
  capsulesService.createCapsule.mockResolvedValue(capsule({ title: "Carta al 2030", messages: [message("Secreto del futuro")] }));
  capsulesService.sealCapsule.mockResolvedValue(capsule({ state: "scheduled", messages: [] }));
  capsulesService.cancelCapsule.mockResolvedValue(capsule({ state: "cancelled", messages: [] }));
  capsulesService.addCapsuleMessage.mockResolvedValue(capsule({ messages: [message("primer"), message("segundo")] }));
  capsulesService.inviteCapsuleContributor.mockResolvedValue(capsule({ contributorsCount: 1 }));
  capsulesService.deleteCapsule.mockResolvedValue({ deleted: true });
});

afterEach(() => cleanup());

function message(text) {
  return { author: { _id: "u1", username: "ana", displayName: "Ana", avatar: "" }, text, createdAt: new Date().toISOString() };
}

function capsule(overrides = {}) {
  return {
    _id: "cap-1",
    owner: { _id: "u1", username: "ana", displayName: "Ana", avatar: "" },
    mine: true,
    title: "Carta 2030",
    opensAt: new Date(Date.now() + 3600_000).toISOString(),
    timezone: "UTC",
    state: "draft",
    contributorsCount: 0,
    messagesCount: 1,
    messages: [message("Hola futuro")],
    openedAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    canSeal: true,
    canCancel: false,
    canMessage: true,
    canInvite: true,
    ...overrides
  };
}

test("crear una cápsula envía título, fecha y primer mensaje con zona horaria local", async () => {
  render(
    <MemoryRouter>
      <Capsules />
    </MemoryRouter>
  );

  fireEvent.change(screen.getByLabelText(/Título/), { target: { value: "Carta al 2030" } });
  fireEvent.change(screen.getByLabelText(/Fecha de apertura de la cápsula/), { target: { value: "2030-01-01T10:00" } });
  fireEvent.change(screen.getByLabelText(/Primer mensaje/), { target: { value: "Secreto del futuro" } });
  fireEvent.click(screen.getByRole("button", { name: "Crear cápsula" }));

  await waitFor(() => expect(capsulesService.createCapsule).toHaveBeenCalledTimes(1));
  const payload = capsulesService.createCapsule.mock.calls[0][0];
  expect(payload.title).toBe("Carta al 2030");
  expect(payload.message).toBe("Secreto del futuro");
  expect(payload.opensAt).toBe(new Date("2030-01-01T10:00").toISOString());
  expect(typeof payload.timezone).toBe("string");
  expect(payload.timezone.length).toBeGreaterThan(0);

  expect(await screen.findByText("Secreto del futuro")).toBeTruthy();
});

test("una cápsula sellada no muestra mensajes y ofrece cancelar con confirmación", async () => {
  capsulesService.getCapsules.mockResolvedValue([
    capsule({ state: "scheduled", messages: [], msUntilOpen: 3540_000, canSeal: false, canCancel: true, canMessage: false, canInvite: false })
  ]);

  render(
    <MemoryRouter>
      <Capsules />
    </MemoryRouter>
  );

  const card = await screen.findByRole("button", { name: /Carta 2030/ });
  expect(card.textContent).toContain("Sellada");
  fireEvent.click(card);

  expect(await screen.findByText(/Sellada y cifrada/)).toBeTruthy();
  expect(screen.getAllByText(/se abre en 59 min/).length).toBeGreaterThanOrEqual(1);
  expect(screen.queryByText("Hola futuro")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  fireEvent.click(await screen.findByRole("button", { name: "Sí, cancelar" }));
  await waitFor(() => expect(capsulesService.cancelCapsule).toHaveBeenCalledWith("cap-1"));
  expect(await screen.findByText(/Cancelada: el contenido/)).toBeTruthy();
});

test("en draft se pueden añadir mensajes, invitar colaborador y sellar", async () => {
  capsulesService.getCapsules.mockResolvedValue([capsule()]);

  render(
    <MemoryRouter>
      <Capsules />
    </MemoryRouter>
  );

  const card = await screen.findByRole("button", { name: /Carta 2030/ });
  fireEvent.click(card);
  expect(await screen.findByText("Hola futuro")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Nuevo mensaje para la cápsula"), { target: { value: "segundo mensaje" } });
  fireEvent.click(screen.getByRole("button", { name: "Añadir mensaje" }));
  await waitFor(() => expect(capsulesService.addCapsuleMessage).toHaveBeenCalledWith("cap-1", "segundo mensaje"));

  fireEvent.change(screen.getByLabelText("Invitar colaborador por usuario"), { target: { value: "ana" } });
  fireEvent.click(screen.getByRole("button", { name: "Invitar" }));
  await waitFor(() => expect(capsulesService.inviteCapsuleContributor).toHaveBeenCalledWith("cap-1", "ana"));

  fireEvent.click(screen.getByRole("button", { name: "Sellar cápsula" }));
  await waitFor(() => expect(capsulesService.sealCapsule).toHaveBeenCalledWith("cap-1"));
  expect(await screen.findByText(/Sellada y cifrada/)).toBeTruthy();
});

test("una cápsula abierta revela los mensajes con animación de apertura", async () => {
  capsulesService.getCapsules.mockResolvedValue([
    capsule({
      state: "opened",
      openedAt: new Date().toISOString(),
      canSeal: false,
      canCancel: false,
      canMessage: false,
      canInvite: false,
      messages: [message("Mensaje uno"), message("Mensaje dos")]
    })
  ]);

  render(
    <MemoryRouter>
      <Capsules />
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByRole("button", { name: /Carta 2030/ }));
  const revealed = await screen.findByText("Mensaje uno");
  expect(revealed.closest(".k-capsule-messages").className).toContain("is-revealed");
  expect(screen.getByText("Mensaje dos")).toBeTruthy();
});

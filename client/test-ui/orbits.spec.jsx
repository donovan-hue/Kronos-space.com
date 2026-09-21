import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Orbits from "../src/features/social/Orbits";
import * as orbitService from "../src/services/orbitsService";
import * as usersService from "../src/services/usersService";

vi.mock("../src/services/orbitsService", () => ({
  addOrbitMember: vi.fn(),
  createOrbit: vi.fn(),
  deleteOrbit: vi.fn(),
  getArchivedOrbits: vi.fn(),
  getOrbitMembers: vi.fn(),
  getOrbits: vi.fn(),
  joinOrbit: vi.fn(),
  leaveOrbit: vi.fn(),
  removeOrbitMember: vi.fn(),
  updateOrbit: vi.fn(),
  updateOrbitMember: vi.fn()
}));

vi.mock("../src/services/usersService", () => ({
  getUserByUsername: vi.fn()
}));

beforeEach(() => {
  vi.resetAllMocks();
  orbitService.getOrbits.mockResolvedValue([]);
  orbitService.getArchivedOrbits.mockResolvedValue([]);
  orbitService.createOrbit.mockResolvedValue({ _id: "orbit-1", name: "Equipo", description: "Trabajo", visibility: "public", membersCount: 1, joined: true, role: "owner", rules: [] });
  orbitService.joinOrbit.mockResolvedValue({ _id: "orbit-2", name: "Foto", visibility: "public", membersCount: 2, joined: true, role: "member", rules: [] });
});

afterEach(() => cleanup());

test("Órbitas crea una comunidad con reglas y duración", async () => {
  render(<MemoryRouter><Orbits /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Equipo" } });
  fireEvent.change(screen.getByLabelText(/Descripción/), { target: { value: "Trabajo" } });
  fireEvent.change(screen.getByLabelText(/Reglas/), { target: { value: "Comparte contexto\nCuida las fuentes" } });
  fireEvent.click(screen.getByRole("button", { name: "Crear órbita" }));

  await waitFor(() => expect(orbitService.createOrbit).toHaveBeenCalledWith(expect.objectContaining({
    name: "Equipo",
    description: "Trabajo",
    rules: ["Comparte contexto", "Cuida las fuentes"],
    visibility: "public",
    expiresAt: null
  })));
  expect(await screen.findByRole("heading", { name: "Equipo" })).toBeTruthy();
  expect(screen.getByText(/feed y publicar dentro/)).toBeTruthy();
});

test("Órbitas permite unirse a una comunidad pública", async () => {
  orbitService.getOrbits.mockResolvedValue([{ _id: "orbit-2", name: "Foto", description: "", visibility: "public", membersCount: 1, joined: false, role: null, rules: [] }]);
  render(<MemoryRouter><Orbits /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Unirme" }));

  await waitFor(() => expect(orbitService.joinOrbit).toHaveBeenCalledWith("orbit-2"));
  expect(screen.getByRole("link", { name: "Abrir feed" }).getAttribute("href")).toBe("/orbits/orbit-2");
});

test("Órbitas muestra el paquete de bienvenida al unirse", async () => {
  orbitService.getOrbits.mockResolvedValue([{ _id: "orbit-w", name: "Cielo", description: "", visibility: "public", membersCount: 1, joined: false, role: null, rules: [] }]);
  orbitService.joinOrbit.mockResolvedValue({ _id: "orbit-w", name: "Cielo", visibility: "public", membersCount: 2, joined: true, role: "member", rules: [], welcomeMessage: "Preséntate en el feed." });

  render(<MemoryRouter><Orbits /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Unirme" }));

  await waitFor(() => expect(orbitService.joinOrbit).toHaveBeenCalledWith("orbit-w"));
  expect(await screen.findByText(/Te uniste a Cielo\. Preséntate en el feed\./)).toBeTruthy();
});

test("Órbitas ofrece el archivo de órbitas vencidas", async () => {
  orbitService.getOrbits.mockResolvedValue([]);
  orbitService.getArchivedOrbits.mockResolvedValue([
    { _id: "orbit-old", name: "Semana de astrofoto", description: "Cielo profundo", visibility: "public", membersCount: 8, joined: true, role: "member", rules: [], expiresAt: "2026-09-01T00:00:00.000Z", active: false }
  ]);

  render(<MemoryRouter><Orbits /></MemoryRouter>);

  fireEvent.click(await screen.findByRole("button", { name: /Ver 1 órbitas vencidas/ }));
  const card = await screen.findByLabelText("Archivo: Semana de astrofoto");
  expect(card).toBeTruthy();
  expect(screen.getByText(/solo lectura/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Unirme" })).toBeNull();
});

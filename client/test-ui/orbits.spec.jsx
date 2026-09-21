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

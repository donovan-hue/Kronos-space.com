import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Circles from "../src/features/social/Circles";
import * as circlesService from "../src/services/circlesService";
import * as usersService from "../src/services/usersService";

vi.mock("../src/services/circlesService", () => ({
  addCircleMember: vi.fn(),
  createCircle: vi.fn(),
  deleteCircle: vi.fn(),
  getCircleMembers: vi.fn(),
  getCircles: vi.fn(),
  removeCircleMember: vi.fn(),
  updateCircle: vi.fn()
}));

vi.mock("../src/services/usersService", () => ({
  getUserByUsername: vi.fn()
}));

beforeEach(() => {
  vi.resetAllMocks();
  circlesService.getCircles.mockResolvedValue([]);
  circlesService.createCircle.mockResolvedValue({ _id: "circle-1", name: "Equipo", description: "Trabajo", membersCount: 0 });
  circlesService.getCircleMembers.mockResolvedValue({ members: [] });
  usersService.getUserByUsername.mockResolvedValue({ _id: "user-2", username: "ana", displayName: "Ana" });
  circlesService.addCircleMember.mockResolvedValue({ added: true });
});

afterEach(() => cleanup());

test("Círculos crea espacios y los ofrece como audiencia privada", async () => {
  render(<MemoryRouter><Circles /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Equipo" } });
  fireEvent.change(screen.getByLabelText(/Descripción/), { target: { value: "Trabajo" } });
  fireEvent.click(screen.getByRole("button", { name: "Crear círculo" }));

  await waitFor(() => expect(circlesService.createCircle).toHaveBeenCalledWith({ name: "Equipo", description: "Trabajo" }));
  expect(await screen.findByRole("heading", { name: "Equipo" })).toBeTruthy();
  expect(screen.getByText(/Ya puedes seleccionarlo al publicar/)).toBeTruthy();
});

test("Círculos gestiona miembros por username mediante los endpoints reales", async () => {
  circlesService.getCircles.mockResolvedValue([{ _id: "circle-1", name: "Amigos", description: "", membersCount: 0 }]);
  render(<MemoryRouter><Circles /></MemoryRouter>);

  fireEvent.click(await screen.findByRole("button", { name: "Gestionar miembros" }));
  const memberInput = await screen.findByRole("textbox", { name: "Agregar miembro a Amigos" });
  fireEvent.change(memberInput, { target: { value: "ana" } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

  await waitFor(() => expect(usersService.getUserByUsername).toHaveBeenCalledWith("ana"));
  expect(circlesService.addCircleMember).toHaveBeenCalledWith("circle-1", "user-2");
});

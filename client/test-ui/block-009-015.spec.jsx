import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UserSearch from "../src/features/users/UserSearch";
import Settings from "../src/features/settings/Settings";
import OfflineNotice from "../src/components/feedback/OfflineNotice";

vi.mock("../src/services/usersService", () => ({
  getMe: vi.fn(),
  searchGlobal: vi.fn(),
  toggleFollow: vi.fn(),
  updatePreferences: vi.fn()
}));
vi.mock("../src/services/authService", () => ({
  getSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn()
}));

const users = await import("../src/services/usersService");
const sessions = await import("../src/services/authService");

beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
  users.searchGlobal.mockResolvedValue({ users: [], posts: [], totals: {}, hasMore: {} });
  users.toggleFollow.mockResolvedValue({ following: true });
  users.getMe.mockResolvedValue({ username: "kronos", displayName: "Kronos", email: "k@kronos.test", role: "user", preferences: { notifications: { inApp: true, email: false }, content: { showSensitive: false }, appearance: "system", language: "es-MX" } });
  users.updatePreferences.mockResolvedValue({ notifications: { inApp: false, email: false }, content: { showSensitive: false }, appearance: "system", language: "es-MX" });
  sessions.getSessions.mockResolvedValue([]);
});
afterEach(() => cleanup());

test("009: búsqueda global conserva personas, resultados de post y follow", async () => {
  users.searchGlobal.mockResolvedValue({
    users: [{ _id: "u-1", username: "luna", displayName: "Luna", followersCount: null, bio: "" }],
    posts: [{ _id: "p-1", content: "Kronos social", author: { username: "luna", displayName: "Luna" } }],
    totals: { users: 1, posts: 1 }, hasMore: { users: false, posts: false }
  });
  render(<MemoryRouter><UserSearch /></MemoryRouter>);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "kronos" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  expect(await screen.findByText("Kronos social")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
  await screen.findByRole("button", { name: "Dejar de seguir" });
  expect(users.searchGlobal).toHaveBeenCalledWith("kronos", "all");
});

test("011: preferencias y sesiones se conectan a servicios de dominio", async () => {
  const logout = vi.fn();
  render(<MemoryRouter><Settings onLogout={logout} /></MemoryRouter>);
  expect(await screen.findByText("Experiencia de Kronos")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: /Notificaciones dentro/ }));
  await waitFor(() => expect(users.updatePreferences).toHaveBeenCalled());
});

test("012: aviso offline aparece y desaparece con eventos del navegador", async () => {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  render(<OfflineNotice />);
  expect(screen.queryByText(/Sin conexión/)).toBeNull();
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
  fireEvent(window, new Event("offline"));
  expect(await screen.findByText(/Sin conexión/)).toBeTruthy();
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  fireEvent(window, new Event("online"));
  await waitFor(() => expect(screen.queryByText(/Sin conexión/)).toBeNull());
});

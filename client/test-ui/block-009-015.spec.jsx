import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import UserSearch from "../src/features/users/UserSearch";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../src/app/queryClient";
import Settings from "../src/features/settings/Settings";
import ProfileSettings from "../src/features/settings/ProfileSettings";
import VerifyEmail from "../src/features/auth/VerifyEmail";
import OfflineNotice from "../src/components/feedback/OfflineNotice";
import AdminCenter from "../src/features/admin/AdminCenter";
import ModerationCenter from "../src/features/moderation/ModerationCenter";
import { ToastProvider, useToast } from "../src/components/feedback/ToastProvider";

vi.mock("../src/services/usersService", () => ({
  getMe: vi.fn(),
  searchGlobal: vi.fn(),
  toggleFollow: vi.fn(),
  updatePreferences: vi.fn(),
  updateProfile: vi.fn(),
  uploadAvatar: vi.fn(),
  updateProfilePrivacy: vi.fn()
}));
vi.mock("../src/services/authService", () => ({
  getSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
  requestEmailVerification: vi.fn(),
  verifyEmail: vi.fn()
}));
vi.mock("../src/services/adminService", () => ({
  getAdminOverview: vi.fn(),
  getAdminUsers: vi.fn(),
  updateUserRole: vi.fn()
}));
vi.mock("../src/services/moderationService", () => ({
  getBlockedUsers: vi.fn(),
  getMutedUsers: vi.fn(),
  getHiddenPosts: vi.fn(),
  getMyReports: vi.fn(),
  getReportQueue: vi.fn(),
  getModerationOverview: vi.fn(),
  unblockUser: vi.fn(),
  unmuteUser: vi.fn(),
  unhidePost: vi.fn(),
  updateReport: vi.fn()
}));
vi.mock("../src/services/apiClient", () => ({
  API_URL: "/api",
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    interceptors: { response: { use: vi.fn(), eject: vi.fn() } }
  }
}));

const users = await import("../src/services/usersService");
const auth = await import("../src/services/authService");
const admin = await import("../src/services/adminService");
const moderation = await import("../src/services/moderationService");
const { api } = await import("../src/services/apiClient");

beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
  users.searchGlobal.mockResolvedValue({ users: [], posts: [], totals: {}, hasMore: {} });
  users.toggleFollow.mockResolvedValue({ following: true });
  users.getMe.mockResolvedValue({
    _id: "u-kronos",
    username: "kronos",
    displayName: "Kronos",
    email: "k@kronos.test",
    emailVerified: false,
    role: "user",
    preferences: { notifications: { inApp: true, email: false }, content: { showSensitive: false }, appearance: "system", language: "es-MX" }
  });
  users.updatePreferences.mockResolvedValue({ notifications: { inApp: false, email: false }, content: { showSensitive: false }, appearance: "system", language: "es-MX" });
  auth.getSessions.mockResolvedValue([]);
  auth.requestEmailVerification.mockResolvedValue({ message: "Correo de verificación enviado." });
  auth.verifyEmail.mockResolvedValue({ message: "Email verificado correctamente.", emailVerified: true });
  admin.getAdminOverview.mockResolvedValue({ users: 10, posts: 25, pendingReports: 2, hiddenPosts: 1 });
  admin.getAdminUsers.mockResolvedValue({ users: [{ _id: "u-2", username: "alex", displayName: "Alex", email: "a@test.com", role: "user" }] });
  moderation.getModerationOverview.mockResolvedValue({ blocks: 1, mutes: 0, hidden: 0, reports: 0, isModerator: false });
  moderation.getBlockedUsers.mockResolvedValue({ users: [{ _id: "u-blocked", username: "blocked_user", displayName: "Blocked" }] });
  api.get.mockResolvedValue({ data: { displayName: "Kronos", bio: "Bio test", avatar: "" } });
  api.patch.mockResolvedValue({ data: { displayName: "Kronos Editado", bio: "Bio test", avatar: "" } });
});
afterEach(() => cleanup());

test("009: búsqueda global conserva personas, resultados de post y follow", async () => {
  users.searchGlobal.mockResolvedValue({
    users: [{ _id: "u-1", username: "luna", displayName: "Luna", followersCount: null, bio: "" }],
    posts: [{ _id: "p-1", content: "Kronos social", author: { username: "luna", displayName: "Luna" } }],
    totals: { users: 1, posts: 1 }, hasMore: { users: false, posts: false }
  });
  render(<QueryClientProvider client={createTestQueryClient()}><MemoryRouter><UserSearch /></MemoryRouter></QueryClientProvider>);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "kronos" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  expect(await screen.findByText("Kronos social")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
  await screen.findByRole("button", { name: "Dejar de seguir" });
  expect(users.searchGlobal).toHaveBeenCalledWith("kronos", "all");
});

test("009: la paginación de personas usa el scope y página correctos", async () => {
  users.searchGlobal
    .mockResolvedValueOnce({
      users: [{ _id: "u-1", username: "luna", displayName: "Luna", followersCount: null, bio: "" }],
      posts: [],
      totals: { users: 2, posts: 0 },
      hasMore: { users: true, posts: false },
      page: 1
    })
    .mockResolvedValueOnce({
      users: [{ _id: "u-2", username: "sol", displayName: "Sol", followersCount: null, bio: "" }],
      posts: [],
      totals: { users: 2, posts: 0 },
      hasMore: { users: false, posts: false },
      page: 2
    });

  render(<QueryClientProvider client={createTestQueryClient()}><MemoryRouter><UserSearch /></MemoryRouter></QueryClientProvider>);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "kronos" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  expect(await screen.findByText("Luna")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Ver más personas" }));
  await waitFor(() => expect(users.searchGlobal).toHaveBeenLastCalledWith("kronos", "users", { page: 2 }));
  expect(await screen.findByText("Sol")).toBeTruthy();
});

test("011: preferencias y sesiones se conectan a servicios de dominio", async () => {
  const logout = vi.fn();
  render(<MemoryRouter><Settings onLogout={logout} /></MemoryRouter>);
  expect(await screen.findByText("Experiencia")).toBeTruthy();
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

test("004: verificación de email procesa token y muestra estado de éxito", async () => {
  render(
    <MemoryRouter initialEntries={["/verify-email?token=valid-test-token-1234567890abcdef"]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmail />} />
      </Routes>
    </MemoryRouter>
  );
  expect(await screen.findByText(/¡Tu dirección de correo ha sido verificada correctamente!/)).toBeTruthy();
  expect(auth.verifyEmail).toHaveBeenCalledWith("valid-test-token-1234567890abcdef");
});

test("002: settings/profile permite actualizar la privacidad del perfil", async () => {
  users.getMe.mockResolvedValue({
    _id: "u-kronos",
    username: "kronos",
    displayName: "Kronos",
    profilePrivacy: { showBio: true, showFollowCounts: true, discoverable: true }
  });
  users.updateProfilePrivacy.mockResolvedValue({ showBio: false, showFollowCounts: true, discoverable: true });
  render(
    <MemoryRouter initialEntries={["/settings/profile"]}>
      <Routes>
        <Route path="/settings/profile" element={<ProfileSettings />} />
      </Routes>
    </MemoryRouter>
  );
  const checkbox = await screen.findByLabelText(/Mostrar mi biografía/);
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: "Guardar privacidad" }));
  expect(await screen.findByText("Privacidad del perfil guardada.")).toBeTruthy();
  expect(users.updateProfilePrivacy).toHaveBeenCalledWith(expect.objectContaining({ showBio: false }));
});

test("031: settings completo muestra estado de correo y permite solicitar verificación", async () => {
  const logout = vi.fn();
  render(<MemoryRouter><Settings onLogout={logout} /></MemoryRouter>);
  expect(await screen.findByText("Sin verificar")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reenviar correo de verificación" }));
  await waitFor(() => expect(auth.requestEmailVerification).toHaveBeenCalled());
  expect(await screen.findByText(/Correo de verificación enviado/)).toBeTruthy();
});

test("033: admin center carga resumen administrativo y lista de usuarios", async () => {
  render(<MemoryRouter><AdminCenter /></MemoryRouter>);
  expect(await screen.findByText("USUARIOS")).toBeTruthy();
  expect(await screen.findByText("@alex · a@test.com")).toBeTruthy();
  expect(admin.getAdminOverview).toHaveBeenCalled();
});

test("035: ToastProvider expone avisos con tone y auto-dismiss", async () => {
  function TestToastConsumer() {
    const { showToast } = useToast();
    return <button onClick={() => showToast("Operación completada", { tone: "success" })}>Lanzar toast</button>;
  }
  render(<ToastProvider><TestToastConsumer /></ToastProvider>);
  fireEvent.click(screen.getByText("Lanzar toast"));
  expect(await screen.findByText("Operación completada")).toBeTruthy();
});

test("038: centro de moderación lista bloqueos y ofrece desbloqueo", async () => {
  render(<MemoryRouter><ModerationCenter /></MemoryRouter>);
  expect(await screen.findByText("@blocked_user")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Desbloquear" }));
  await waitFor(() => expect(moderation.unblockUser).toHaveBeenCalledWith("u-blocked"));
  expect(await screen.findByText("Desbloqueaste a @blocked_user.")).toBeTruthy();
});


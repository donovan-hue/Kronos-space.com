import React from "react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createTestQueryClient } from "../src/app/queryClient";
import Auth from "../src/features/auth/Auth";
import ResetPassword from "../src/features/auth/ResetPassword";
import ImageGenerator from "../src/features/image-ai/ImageGenerator";
import ScriptGenerator from "../src/features/script-ai/ScriptGenerator";
import Profile from "../src/features/users/Profile";
import * as ai from "../src/services/aiService";
import * as users from "../src/services/usersService";
import { api } from "../src/services/apiClient";
import { clearSession, saveSession } from "../src/services/authStorage";

vi.mock("../src/services/apiClient", () => ({
  API_URL: "/api",
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
vi.mock("../src/services/aiService", () => ({
  getImageHistory: vi.fn(),
  getVideoHistory: vi.fn(),
  getVideoJob: vi.fn(),
  generateImage: vi.fn(),
  generateVideo: vi.fn(),
  generateScript: vi.fn(),
  getScriptHistory: vi.fn(),
  createScriptProject: vi.fn(),
  updateScript: vi.fn(),
  deleteScript: vi.fn(),
}));
vi.mock("../src/services/usersService", () => ({
  getMe: vi.fn(),
  getUserById: vi.fn(),
  getUserByUsername: vi.fn(),
  updateProfile: vi.fn(),
  uploadAvatar: vi.fn(),
  uploadCover: vi.fn(),
  toggleFollow: vi.fn(),
}));
vi.mock("../src/services/postsService", () => ({
  getFeed: vi.fn(),
  getUserPosts: vi.fn(),
  getSavedPosts: vi.fn(),
  createPost: vi.fn(),
  createComment: vi.fn(),
  likePost: vi.fn(),
  toggleSave: vi.fn(),
  repostPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
}));

const me = { _id: "owner", id: "owner", username: "example", displayName: "Example", bio: "", avatar: "" };

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  // A-1: el access vive en memoria del módulo; limpiar storages no basta.
  clearSession();
  api.get.mockResolvedValue({ data: {} });
  ai.getImageHistory.mockResolvedValue({ generations: [] });
  ai.getScriptHistory.mockResolvedValue({ scripts: [] });
  users.getMe.mockResolvedValue(me);
});
afterEach(() => cleanup());

function withProviders(ui, { initialEntries } = {}) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------
// Autenticación — registro
// ---------------------------------------------------------------

async function openRegisterForm() {
  withProviders(<Auth onLogin={vi.fn()} initialMode="register" />);
  fireEvent.click(await screen.findByRole("button", { name: "Crear cuenta" }));
  return screen.findByRole("button", { name: "Crear mi cuenta" });
}

test("registro vacío muestra errores por campo y no llama a la API", async () => {
  const submit = await openRegisterForm();

  fireEvent.click(submit);

  expect(await screen.findByText("El nombre de usuario es obligatorio.")).toBeTruthy();
  expect(screen.getByText("El correo es obligatorio.")).toBeTruthy();
  expect(screen.getByText("La contraseña debe tener mínimo 10 caracteres.")).toBeTruthy();
  expect(api.post).not.toHaveBeenCalled();
});

test("registro con contraseñas distintas no llama a la API", async () => {
  const submit = await openRegisterForm();

  fireEvent.change(screen.getByLabelText("Nombre de usuario"), { target: { value: "alex_kronos" } });
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "alex@kronos.space" } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "Segura12345!" } });
  fireEvent.change(screen.getByLabelText("Confirmar contraseña"), { target: { value: "OtraClave678!" } });
  fireEvent.click(submit);

  expect(await screen.findByText("Las contraseñas no coinciden.")).toBeTruthy();
  expect(api.post).not.toHaveBeenCalled();
});

test("registro válido envía exactamente el payload del backend", async () => {
  api.post.mockResolvedValue({
    data: { token: "t", user: me },
  });
  const onLogin = vi.fn();
  withProviders(<Auth onLogin={onLogin} initialMode="register" />);
  fireEvent.click(await screen.findByRole("button", { name: "Crear cuenta" }));

  fireEvent.change(screen.getByLabelText("Nombre de usuario"), { target: { value: " alex_kronos " } });
  fireEvent.change(screen.getByLabelText("Nombre para mostrar"), { target: { value: "Alex" } });
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "alex@kronos.space" } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "Segura12345!" } });
  fireEvent.change(screen.getByLabelText("Confirmar contraseña"), { target: { value: "Segura12345!" } });
  fireEvent.click(screen.getByRole("button", { name: "Crear mi cuenta" }));

  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith("/auth/register", {
      username: "alex_kronos",
      email: "alex@kronos.space",
      password: "Segura12345!",
      displayName: "Alex",
      remember: true,
    })
  );
  await waitFor(() => expect(onLogin).toHaveBeenCalled());
});

// ---------------------------------------------------------------
// Restablecimiento de contraseña
// ---------------------------------------------------------------

function mountReset(token = "token-suficientemente-largo-para-el-backend") {
  return withProviders(
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/login" element={<div>login</div>} />
    </Routes>,
    { initialEntries: [`/reset-password?token=${token}`] }
  );
}

test("restablecimiento valida mínimo y coincidencia sin llamar a la API", async () => {
  mountReset();

  fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: "corta" } });
  fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), { target: { value: "corta" } });
  fireEvent.click(screen.getByRole("button", { name: /Guardar contraseña/ }));

  expect(await screen.findByText("La contraseña debe tener mínimo 10 caracteres.")).toBeTruthy();
  expect(api.post).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: "Segura12345!" } });
  fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), { target: { value: "Diferente678!" } });
  fireEvent.click(screen.getByRole("button", { name: /Guardar contraseña/ }));

  expect(await screen.findByText("Las contraseñas no coinciden.")).toBeTruthy();
  expect(api.post).not.toHaveBeenCalled();
});

test("restablecimiento válido envía token y contraseña", async () => {
  api.post.mockResolvedValue({ data: { message: "ok" } });
  mountReset("token-valido-1234567890abcdef");

  fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: "NuevaClave123!" } });
  fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), { target: { value: "NuevaClave123!" } });
  fireEvent.click(screen.getByRole("button", { name: /Guardar contraseña/ }));

  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith("/auth/reset-password", {
      token: "token-valido-1234567890abcdef",
      password: "NuevaClave123!",
    })
  );
});

// ---------------------------------------------------------------
// Perfil — información y carga directa de imágenes
// ---------------------------------------------------------------

test("perfil muestra su información y ofrece los botones + sin modal de edición", async () => {
  const token = `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
  saveSession(token, me, false);
  withProviders(
    <Routes>
      <Route path="/profile" element={<Profile />} />
    </Routes>,
    { initialEntries: ["/profile"] }
  );

  expect(await screen.findByRole("heading", { name: "Example" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Subir foto al muro del perfil" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Subir foto de perfil" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Editar perfil" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
});

// ---------------------------------------------------------------
// Kairos — generadores
// ---------------------------------------------------------------

test("generador de imagen exige prompt y no genera sin él", async () => {
  withProviders(<ImageGenerator />);

  fireEvent.click(screen.getByRole("button", { name: "Generar imagen" }));

  expect(await screen.findByText("El prompt es obligatorio.")).toBeTruthy();
  expect(ai.generateImage).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Ciudad de titanio" } });
  fireEvent.click(screen.getByRole("button", { name: "Generar imagen" }));

  await waitFor(() =>
    expect(ai.generateImage).toHaveBeenCalledWith({
      prompt: "Ciudad de titanio",
      negativePrompt: "",
      style: "cinematic",
    })
  );
});

test("generador de script valida duración y envía el payload completo", async () => {
  withProviders(<ScriptGenerator />);

  const duration = screen.getByLabelText("Duración en minutos");
  fireEvent.change(duration, { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Idea central" } });
  fireEvent.click(screen.getByRole("button", { name: "Generar script" }));

  expect(await screen.findByText("La duración mínima es 1 minuto.")).toBeTruthy();
  expect(ai.generateScript).not.toHaveBeenCalled();

  fireEvent.change(duration, { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "Generar script" }));

  await waitFor(() =>
    expect(ai.generateScript).toHaveBeenCalledWith({
      prompt: "Idea central",
      type: "video",
      genre: "general",
      format: "standard",
      durationMinutes: 10,
      tone: "",
      audience: "",
    })
  );
});

test("reutilizar un script restaura todos sus parámetros profesionales", async () => {
  ai.getScriptHistory.mockResolvedValue({
    scripts: [{
      _id: "script-1",
      prompt: "Campaña de lanzamiento",
      type: "reel",
      genre: "comedy",
      format: "vertical",
      durationMinutes: 12,
      tone: "Cercano",
      audience: "Comunidad creativa"
    }]
  });

  withProviders(<ScriptGenerator />);
  fireEvent.click(await screen.findByRole("button", { name: "Reutilizar" }));

  expect(screen.getByLabelText("Tipo").value).toBe("reel");
  expect(screen.getByLabelText("Género").value).toBe("comedy");
  expect(screen.getByLabelText("Formato").value).toBe("vertical");
  expect(screen.getByLabelText("Duración en minutos").value).toBe("12");
  expect(screen.getByLabelText("Tono").value).toBe("Cercano");
  expect(screen.getByLabelText("Audiencia").value).toBe("Comunidad creativa");
  expect(screen.getByLabelText("Prompt").value).toBe("Campaña de lanzamiento");
});

test("guardar proyecto envía la estructura editada al endpoint de proyectos", async () => {
  const structure = {
    title: "Órbita de titanio",
    logline: "Una decisión cambia la misión.",
    narrative: { beginning: "Inicio", middle: "Desarrollo", ending: "Cierre" },
    closing: "Fin"
  };
  ai.generateScript.mockResolvedValue({
    script: {
      _id: "script-1",
      prompt: "Una misión espacial",
      type: "video",
      genre: "general",
      format: "standard",
      durationMinutes: 5,
      tone: "",
      audience: "",
      result: "Resultado del script",
      structure
    }
  });
  ai.createScriptProject.mockResolvedValue({ title: structure.title });

  withProviders(<ScriptGenerator />);
  fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Una misión espacial" } });
  fireEvent.click(screen.getByRole("button", { name: "Generar script" }));
  await screen.findByRole("heading", { name: "Editor de guion" });

  fireEvent.click(screen.getByRole("button", { name: "Guardar proyecto" }));
  await waitFor(() => expect(ai.createScriptProject).toHaveBeenCalledWith({
    sourceScript: "script-1",
    title: "Órbita de titanio",
    type: "video",
    genre: "general",
    format: "standard",
    durationMinutes: 5,
    tone: "",
    audience: "",
    structure
  }));
});

// ---------------------------------------------------------------
// Servicio de publicaciones — esquema compartido (módulo real)
// ---------------------------------------------------------------

test("createPost/createComment aplican el esquema compartido", async () => {
  const actual = await vi.importActual("../src/services/postsService");

  await expect(actual.createPost("", {})).rejects.toThrow("La publicación está vacía");
  await expect(actual.createPost("x".repeat(5001), {})).rejects.toThrow(
    "La publicación no puede superar 5000 caracteres"
  );
  await expect(actual.createComment("p1", "x".repeat(1001))).rejects.toThrow(
    "El comentario no puede superar 1000 caracteres"
  );
  expect(api.post).not.toHaveBeenCalled();
});

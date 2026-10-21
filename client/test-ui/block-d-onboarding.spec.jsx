import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Onboarding from "../src/features/onboarding/Onboarding";
import * as usersService from "../src/services/usersService";
import * as orbitsService from "../src/services/orbitsService";
import * as authStorage from "../src/services/authStorage";

vi.mock("../src/services/usersService");
vi.mock("../src/services/orbitsService");
vi.mock("../src/services/authStorage");

describe("Bloque D — Onboarding por intereses y Órbitas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStorage.updateUser.mockReset();
    authStorage.getUser.mockReturnValue({
      _id: "user-123",
      username: "astronomo",
      displayName: "Ana Torres",
      preferences: { onboarded: false }
    });
    orbitsService.getOrbits.mockResolvedValue([
      { _id: "orbit-1", name: "Astrofoto GDL", description: "Cielo profundo", membersCount: 42, joined: false }
    ]);
    usersService.searchUsers.mockResolvedValue({
      users: [
        { _id: "user-456", username: "carlos", displayName: "Carlos Ruiz" }
      ]
    });
    usersService.updatePreferences.mockResolvedValue({ onboarded: true });
    orbitsService.joinOrbit.mockResolvedValue({ _id: "orbit-1", joined: true });
    usersService.toggleFollow.mockResolvedValue({ userId: "user-456", following: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("renderiza el paso 1 con saludo y temas de interés", () => {
    render(
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>
    );

    expect(screen.getByText("Hola, Ana Torres")).toBeDefined();
    expect(screen.getByText("¿Qué te mueve?")).toBeDefined();
    expect(screen.getByText("✦ Cielo")).toBeDefined();
    expect(screen.getByText("🎵 Música")).toBeDefined();
  });

  it("deshabilita el botón Continuar si se seleccionan menos de 3 temas", () => {
    render(
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>
    );

    const continueBtn = screen.getByText("Continuar →");
    expect(continueBtn.hasAttribute("disabled")).toBe(true);

    // Seleccionar 2 temas
    fireEvent.click(screen.getByText("✦ Cielo"));
    fireEvent.click(screen.getByText("🎵 Música"));
    expect(continueBtn.hasAttribute("disabled")).toBe(true);

    // Seleccionar 3er tema
    fireEvent.click(screen.getByText("📸 Foto"));
    expect(continueBtn.hasAttribute("disabled")).toBe(false);
  });

  it("avanza por los 4 pasos y permite seleccionar acciones", async () => {
    render(
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>
    );

    // Paso 1 -> 3 temas
    fireEvent.click(screen.getByText("✦ Cielo"));
    fireEvent.click(screen.getByText("🎵 Música"));
    fireEvent.click(screen.getByText("📸 Foto"));
    fireEvent.click(screen.getByText("Continuar →"));

    // Paso 2: Órbitas
    await waitFor(() => {
      expect(screen.getByText("Órbitas sugeridas")).toBeDefined();
    });
    expect(screen.getByText("Paso 2 de 4")).toBeDefined();
    fireEvent.click(screen.getByText("Continuar →"));

    // Paso 3: Personas
    await waitFor(() => {
      expect(screen.getByText("Personas destacadas")).toBeDefined();
    });
    expect(screen.getByText("Paso 3 de 4")).toBeDefined();
    fireEvent.click(screen.getByText("Continuar →"));

    // Paso 4: Primera acción
    await waitFor(() => {
      expect(screen.getByText("Tu primera acción")).toBeDefined();
    });
    expect(screen.getByText("Paso 4 de 4")).toBeDefined();
    expect(screen.getByText("Publicar algo breve")).toBeDefined();
    expect(screen.getByText("Empieza por Pulso")).toBeDefined();
  });

  it("el botón Saltar guarda preferencias y finaliza el onboarding", async () => {
    render(
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>
    );

    const skipBtn = screen.getByText("Saltar");
    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(usersService.updatePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ onboarded: true })
      );
    });
  });

  it("un rechazo del servidor no marca onboarding completado ni abandona las elecciones", async () => {
    usersService.updatePreferences.mockRejectedValueOnce({ response: { data: { error: "No se guardaron las preferencias" } } });
    render(<MemoryRouter initialEntries={["/onboarding"]}><Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/home" element={<h1>Inicio confirmado</h1>} />
    </Routes></MemoryRouter>);
    fireEvent.click(screen.getByText("✦ Cielo"));
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(authStorage.updateUser).not.toHaveBeenCalled();
    expect(screen.queryByText("Inicio confirmado")).toBeNull();
    expect(screen.getByRole("button", { name: /Cielo/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }));
    expect(await screen.findByText("Inicio confirmado")).toBeTruthy();
    expect(usersService.updatePreferences).toHaveBeenLastCalledWith(expect.objectContaining({ feed: { mode: "interests", interests: ["cielo"] } }));
    expect(authStorage.updateUser).toHaveBeenCalledTimes(1);
  });

  it("si el servidor confirmó pero la caché local está bloqueada sí permite continuar", async () => {
    authStorage.updateUser.mockImplementation(() => { throw new Error("almacenamiento bloqueado"); });
    render(<MemoryRouter initialEntries={["/onboarding"]}><Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/home" element={<h1>Inicio confirmado</h1>} />
    </Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }));
    expect(await screen.findByText("Inicio confirmado")).toBeTruthy();
    expect(usersService.updatePreferences).toHaveBeenCalledTimes(1);
  });
});

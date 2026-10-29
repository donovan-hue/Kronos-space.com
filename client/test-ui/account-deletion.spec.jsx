import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import DeleteAccount from "../src/features/settings/DeleteAccount";
import { ToastProvider } from "../src/components/feedback/ToastProvider";
import { ConfirmProvider } from "../src/components/feedback/ConfirmProvider";
import { api } from "../src/services/apiClient";

/**
 * KRONOS · borrado de cuenta desde la interfaz.
 *
 * El endpoint `DELETE /api/users/me` ya estaba probado contra base real; lo que
 * no existía era el camino del usuario hacia él. Estas pruebas sellan las tres
 * cosas que importan de la barrera nueva:
 *
 *   1. Nada sale hacia el servidor sin la casilla y sin la credencial.
 *   2. El cuerpo enviado es el que la política del servidor espera
 *      (contraseña si la hay, confirmación del nombre si no).
 *   3. Un rechazo del servidor NO cierra la sesión ni finge el borrado.
 *
 * El `apiClient` se doblega en la capa HTTP para que el servicio real
 * (`usersService.deleteAccount`) sea el que construya la petición: si alguien
 * cambia el cuerpo, aquí se ve.
 */
vi.mock("../src/services/apiClient", () => ({
  API_URL: "/api",
  api: {
    delete: vi.fn(async () => ({ data: { deleted: true } })),
    get: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    patch: vi.fn(async () => ({ data: {} })),
    interceptors: { response: { use: vi.fn(), eject: vi.fn() }, request: { use: vi.fn() } }
  },
  subscribeToApiSession: vi.fn(() => () => {}),
  renewSession: vi.fn(async () => null)
}));

const conContraseña = { _id: "u1", username: "alex_kronos", displayName: "Alex", hasPassword: true };
const deGoogle = { _id: "u1", username: "alex_kronos", displayName: "Alex", hasPassword: false };

function montar(user, onDeleted = () => {}) {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <MemoryRouter>
          <DeleteAccount user={user} onDeleted={onDeleted} />
        </MemoryRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.delete.mockResolvedValue({ data: { deleted: true } });
});

afterEach(() => {
  cleanup();
});

test("expone el borrado con sus consecuencias listadas", () => {
  montar(conContraseña);

  expect(screen.getByRole("heading", { name: "Eliminar tu cuenta" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Eliminar mi cuenta" }).disabled).toBe(true);
  expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(5);
});

test("la cuenta con contraseña pide la contraseña, no el nombre de usuario", () => {
  montar(conContraseña);

  const campo = screen.getByPlaceholderText("Confirma para eliminar");
  expect(campo.getAttribute("type")).toBe("password");
  expect(screen.queryByPlaceholderText("alex_kronos")).toBeNull();
});

test("una cuenta de Google sin contraseña confirma escribiendo su usuario", () => {
  montar(deGoogle);

  expect(screen.queryByPlaceholderText("Confirma para eliminar")).toBeNull();
  const campo = screen.getByPlaceholderText("alex_kronos");
  expect(campo.getAttribute("type")).toBe("text");
  expect(screen.getByText(/se creó con Google y no tiene contraseña/)).toBeTruthy();
});

test("sin la casilla no se llama al servidor", () => {
  montar(conContraseña);

  const boton = screen.getByRole("button", { name: "Eliminar mi cuenta" });
  expect(boton.disabled).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
  expect(api.delete).not.toHaveBeenCalled();
});

test("con la casilla marcada pero sin credencial tampoco se llama al servidor", () => {
  montar(conContraseña);

  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));

  expect(api.delete).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent || "").toMatch(/contraseña/);
});

test("el nombre de usuario incorrecto se rechaza en el cliente", () => {
  montar(deGoogle);

  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByPlaceholderText("alex_kronos"), { target: { value: "otra persona" } });
  fireEvent.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));

  expect(api.delete).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent || "").toMatch(/nombre de usuario/);
});

test("el borrado pasa por el diálogo de confirmación y envía la contraseña", async () => {
  const onDeleted = vi.fn();
  montar(conContraseña, onDeleted);

  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByPlaceholderText("Confirma para eliminar"), { target: { value: "S3cret!" } });
  fireEvent.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));

  expect(api.delete).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Sí, eliminar mi cuenta" }));

  await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
  expect(api.delete).toHaveBeenCalledWith("/users/me", { data: { password: "S3cret!" } });
  await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
});

test("la cuenta sin contraseña envía la confirmación del nombre, sin contraseña", async () => {
  montar(deGoogle);

  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByPlaceholderText("alex_kronos"), { target: { value: "Alex_Kronos" } });
  fireEvent.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
  fireEvent.click(await screen.findByRole("button", { name: "Sí, eliminar mi cuenta" }));

  await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
  expect(api.delete).toHaveBeenCalledWith("/users/me", { data: { confirm: "Alex_Kronos" } });
});

test("cancelar el diálogo no borra la cuenta", async () => {
  const onDeleted = vi.fn();
  montar(conContraseña, onDeleted);

  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByPlaceholderText("Confirma para eliminar"), { target: { value: "S3cret!" } });
  fireEvent.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
  fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

  await waitFor(() => expect(screen.queryByRole("button", { name: "Sí, eliminar mi cuenta" })).toBeNull());
  expect(api.delete).not.toHaveBeenCalled();
  expect(onDeleted).not.toHaveBeenCalled();
});

test("un rechazo del servidor se muestra y no cierra la sesión", async () => {
  const onDeleted = vi.fn();
  api.delete.mockRejectedValue({
    response: { status: 403, data: { error: "Contraseña incorrecta", code: "PASSWORD_INVALID" } }
  });
  montar(conContraseña, onDeleted);

  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByPlaceholderText("Confirma para eliminar"), { target: { value: "mala" } });
  fireEvent.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
  fireEvent.click(await screen.findByRole("button", { name: "Sí, eliminar mi cuenta" }));

  expect((await screen.findByRole("alert")).textContent).toMatch(/Contraseña incorrecta/);
  expect(onDeleted).not.toHaveBeenCalled();
});

test("un 503 se reporta como reintento posible, no como éxito", async () => {
  const onDeleted = vi.fn();
  api.delete.mockRejectedValue({
    response: { status: 503, data: { error: "No se pudo completar la eliminación. Inténtalo nuevamente." } }
  });
  montar(conContraseña, onDeleted);

  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByPlaceholderText("Confirma para eliminar"), { target: { value: "S3cret!" } });
  fireEvent.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
  fireEvent.click(await screen.findByRole("button", { name: "Sí, eliminar mi cuenta" }));

  expect((await screen.findByRole("alert")).textContent).toMatch(/Inténtalo nuevamente/);
  expect(onDeleted).not.toHaveBeenCalled();
});

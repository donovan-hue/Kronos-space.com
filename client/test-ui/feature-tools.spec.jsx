import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../src/app/queryClient";
import AudioTools from "../src/features/ai/AudioTools";
import SupportPage from "../src/features/users/SupportPage";
import * as voice from "../src/services/voiceService";
import * as music from "../src/services/musicService";
import * as support from "../src/services/supportService";

vi.mock("../src/services/voiceService", () => ({ obtenerVoces: vi.fn(), generarLocucion: vi.fn() }));
vi.mock("../src/services/musicService", () => ({ obtenerCatalogoMusica: vi.fn() }));
vi.mock("../src/services/supportService", () => ({ getSupportHistory: vi.fn(), getCreatorSupport: vi.fn(), sendCreatorTip: vi.fn(), nuevoIdDeApoyo: vi.fn(() => "intento") }));
vi.mock("../src/services/authStorage", () => ({ getUser: () => ({ _id: "me" }) }));

beforeEach(() => {
  vi.resetAllMocks();
  voice.obtenerVoces.mockResolvedValue({ voces: [], servicio: { listo: false }, motivo: "" });
  music.obtenerCatalogoMusica.mockResolvedValue({ pistas: [], motivo: "" });
  support.getSupportHistory.mockResolvedValue({ transactions: [] });
  support.getCreatorSupport.mockResolvedValue({ creator: { _id: "creator", username: "artista" } });
});
afterEach(cleanup);

function mount(ui, path = "/kairos/audio") {
  return render(<QueryClientProvider client={createTestQueryClient()}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>);
}

function mountSupport(path) {
  return mount(<Routes><Route path="/support" element={<SupportPage />} /><Route path="/support/:userId" element={<SupportPage />} /></Routes>, path);
}

test("abrir locución no genera ni factura; el servicio apagado mantiene el botón desactivado", async () => {
  mount(<AudioTools />);
  await screen.findByText(/falta configurar el servicio de voz/);
  fireEvent.change(screen.getByLabelText("Texto de la locución"), { target: { value: "Un texto" } });
  expect(screen.getByRole("button", { name: "Generar locución" }).disabled).toBe(true);
  expect(voice.generarLocucion).not.toHaveBeenCalled();
  expect(music.obtenerCatalogoMusica).not.toHaveBeenCalled();
});

test("locución solo llama al servicio con una acción explícita y muestra el audio recibido", async () => {
  voice.obtenerVoces.mockResolvedValue({ voces: [{ _id: "voz1", nombre: "Voz real", idioma: "es", tipo: "catalogo", disponible: true }], servicio: { listo: true, limites: { texto: 100 } } });
  voice.generarLocucion.mockResolvedValue({ url: "/uploads/voices/toma.mp3" });
  mount(<AudioTools />);
  await screen.findByRole("option", { name: "Voz real · es" });
  expect(voice.generarLocucion).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Voz"), { target: { value: "voz1" } });
  fireEvent.change(screen.getByLabelText("Texto de la locución"), { target: { value: "Una idea en voz" } });
  fireEvent.click(screen.getByRole("button", { name: "Generar locución" }));
  await waitFor(() => expect(voice.generarLocucion).toHaveBeenCalledWith(expect.objectContaining({ texto: "Una idea en voz", voiceId: "voz1" }), expect.anything()));
  expect(await screen.findByLabelText("Locución generada")).toBeTruthy();
});

test("catálogo muestra las fuentes reales y conserva pistas cuando falla la lectura de voces", async () => {
  voice.obtenerVoces.mockResolvedValue({ voces: [], servicio: { listo: false }, motivo: "No se pudo leer voces" });
  music.obtenerCatalogoMusica.mockResolvedValue({ pistas: [{ _id: "pista1", titulo: "Tema real", autor: "Artista", url: "/uploads/music/tema.mp3" }], motivo: "" });
  mount(<AudioTools catalogo />);
  expect(await screen.findByRole("heading", { name: "Tema real" })).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("No se pudo leer voces");
  expect(screen.getByLabelText("Escuchar Tema real").getAttribute("preload")).toBe("none");
  expect(voice.generarLocucion).not.toHaveBeenCalled();
});

test("el historial de apoyos carga recibidos y cambia a enviados sin crear transacciones", async () => {
  mountSupport("/support");
  expect(await screen.findByText("Todavía no hay apoyos recibidos.")).toBeTruthy();
  expect(support.getSupportHistory).toHaveBeenCalledWith("received");
  fireEvent.click(screen.getByRole("button", { name: "Enviados" }));
  expect(await screen.findByText("Todavía no hay apoyos enviados.")).toBeTruthy();
  expect(support.getSupportHistory).toHaveBeenCalledWith("sent");
  expect(support.sendCreatorTip).not.toHaveBeenCalled();
});

test("apoyar por URL requiere elegir el apoyo y confirmar, nunca envía al cargar", async () => {
  mountSupport("/support/creator");
  fireEvent.click(await screen.findByRole("button", { name: "Elegir apoyo simbólico" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Enviar apoyo" })).toBeTruthy();
  expect(support.getCreatorSupport).toHaveBeenCalledWith("creator");
  expect(support.sendCreatorTip).not.toHaveBeenCalled();
});

test("un error del historial no aparece como un historial vacío", async () => {
  support.getSupportHistory.mockRejectedValue(new Error("falló"));
  mountSupport("/support");
  expect((await screen.findByRole("alert")).textContent).toContain("No se pudieron cargar los apoyos");
  expect(screen.queryByText("Todavía no hay apoyos recibidos.")).toBeNull();
});


test("las grabaciones propias se escuchan en catálogo, no se ofrecen como voces TTS", async () => {
  voice.obtenerVoces.mockResolvedValue({ voces: [{ _id: "grabacion", nombre: "Mi grabación", tipo: "propia", disponible: true, url: "/uploads/voices/propia.mp3" }], servicio: { listo: true } });
  mount(<AudioTools />);
  await waitFor(() => expect(voice.obtenerVoces).toHaveBeenCalled());
  expect(screen.queryByRole("option", { name: /Mi grabación/ })).toBeNull();
});

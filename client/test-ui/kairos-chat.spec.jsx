import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createTestQueryClient } from "../src/app/queryClient";
import KairosChat from "../src/features/ai/KairosChat";

vi.mock("../src/services/aiService", () => ({
  listChatConversations: vi.fn(),
  createChatConversation: vi.fn(),
  getChatConversation: vi.fn(),
  renameChatConversation: vi.fn(),
  deleteChatConversation: vi.fn(),
  sendKairosMessage: vi.fn()
}));

vi.mock("../src/components/feedback/ConfirmProvider", () => ({
  useConfirm: () => vi.fn(async () => true)
}));

import * as ai from "../src/services/aiService";

beforeEach(() => {
  vi.clearAllMocks();
  ai.listChatConversations.mockResolvedValue([]);
  ai.createChatConversation.mockResolvedValue({ _id: "conv-1", title: "" });
});

afterEach(() => cleanup());

function mount(path = "/kairos/chat") {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/kairos/chat" element={<KairosChat />} />
          <Route path="/kairos/chat/:conversationId" element={<KairosChat />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * `POST /api/ai/chat` existía pero el cliente solo lo usaba para reescribir
 * un borrador: no había pantalla de conversación ni historial guardado.
 */

test("la bandeja lista las conversaciones guardadas con su vista previa", async () => {
  ai.listChatConversations.mockResolvedValue([
    { _id: "c1", title: "Ideas para el reel", preview: "¿De qué hablamos?", messagesCount: 4, lastMessageAt: new Date().toISOString() }
  ]);

  mount();

  expect(await screen.findByText("Ideas para el reel")).toBeTruthy();
  expect(screen.getByText("¿De qué hablamos?")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Ideas para el reel/ }).getAttribute("href")).toBe("/kairos/chat/c1");
});

test("sin conversaciones lo dice sin fingir contenido", async () => {
  mount();
  expect(await screen.findByText("Todavía no has hablado con Kairos")).toBeTruthy();
});

test("el hilo carga los mensajes del servidor y distingue los papeles", async () => {
  ai.getChatConversation.mockResolvedValue({
    conversation: { _id: "c1", title: "Ideas", messagesCount: 2 },
    messages: [
      { _id: "m1", role: "user", content: "Hola Kairos", estado: "ok", createdAt: new Date().toISOString() },
      { _id: "m2", role: "assistant", content: "Hola, ¿en qué piensas?", estado: "ok", model: "gemini-2.0-flash" }
    ]
  });

  mount("/kairos/chat/c1");

  expect(await screen.findByText("Hola Kairos")).toBeTruthy();
  expect(screen.getByText("Hola, ¿en qué piensas?")).toBeTruthy();
  expect(screen.getAllByText("Tú").length).toBe(1);
  expect(screen.getAllByText("Kairos").length).toBeGreaterThan(0);
});

test("un mensaje con error del proveedor se muestra como error, no como respuesta", async () => {
  ai.getChatConversation.mockResolvedValue({
    conversation: { _id: "c1", title: "Ideas" },
    messages: [
      { _id: "m1", role: "user", content: "Hola", estado: "ok" },
      { _id: "m2", role: "assistant", content: "", estado: "error", error: "Sin cuota del proveedor" }
    ]
  });

  mount("/kairos/chat/c1");

  expect(await screen.findByText("Sin cuota del proveedor")).toBeTruthy();
});

test("enviar en un hilo manda el conversationId y no todo el historial", async () => {
  ai.getChatConversation.mockResolvedValue({
    conversation: { _id: "c1", title: "Ideas" },
    messages: [{ _id: "m1", role: "user", content: "Hola", estado: "ok" }]
  });
  ai.sendKairosMessage.mockResolvedValue({ success: true, text: "Respuesta", conversationId: "c1" });

  mount("/kairos/chat/c1");
  await screen.findByText("Hola");

  fireEvent.change(screen.getByLabelText("Mensaje para Kairos"), { target: { value: "  Sigue  " } });
  fireEvent.click(screen.getByRole("button", { name: /Enviar/ }));

  await waitFor(() =>
    expect(ai.sendKairosMessage).toHaveBeenCalledWith({ message: "Sigue", conversationId: "c1" })
  );
  // El historial ya no viaja en el cuerpo: la fuente es la base.
  expect(ai.sendKairosMessage.mock.calls[0][0].history).toBeUndefined();
});

test("el primer mensaje desde la bandeja crea la conversación y entra al hilo", async () => {
  ai.sendKairosMessage.mockResolvedValue({ success: true, text: "Vamos", conversationId: "conv-1" });

  mount();
  await screen.findByText("Todavía no has hablado con Kairos");

  // Desde la bandeja se abre una conversación vacía con el botón.
  fireEvent.click(screen.getByRole("button", { name: /Nueva conversación/ }));

  await waitFor(() => expect(ai.createChatConversation).toHaveBeenCalled());
});

test("un 409 de conversación llena se muestra tal cual", async () => {
  ai.getChatConversation.mockResolvedValue({ conversation: { _id: "c1" }, messages: [] });
  ai.sendKairosMessage.mockRejectedValue({
    response: { data: { error: "Esta conversación llegó a su límite. Abre una nueva para seguir." } }
  });

  mount("/kairos/chat/c1");
  await screen.findByText("Escribe el primer mensaje");

  fireEvent.change(screen.getByLabelText("Mensaje para Kairos"), { target: { value: "Otra" } });
  fireEvent.click(screen.getByRole("button", { name: /Enviar/ }));

  expect(await screen.findByText(/llegó a su límite/)).toBeTruthy();
});

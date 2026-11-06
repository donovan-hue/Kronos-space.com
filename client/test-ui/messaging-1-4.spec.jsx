import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createTestQueryClient } from "../src/app/queryClient";
import MessageList from "../src/features/messages/MessageList";
import MessageComposer from "../src/features/messages/MessageComposer";
import Messages from "../src/features/messages/Messages";
import {
  MESSAGE_MEDIA_LIMITS,
  messageMediaKind
} from "../src/services/messagesService";

const socket = {
  connected: true,
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn()
};

vi.mock("../src/services/socket", () => ({
  getSocket: () => socket,
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn()
}));

vi.mock("../src/services/authStorage", () => ({
  getUser: () => ({ _id: "me", username: "yo" })
}));

const apiMock = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  // `deleteMessage` y compañía se mockean por módulo más abajo; aquí solo
  // hace falta el objeto axios falso para el servicio real.
  API_URL: "/api"
}));

vi.mock("../src/services/apiClient", () => apiMock);

import * as messagesService from "../src/services/messagesService";

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  socket.connected = true;
});

// ---------------------------------------------------------------
// Adjuntos: antes solo entraban imágenes.
// ---------------------------------------------------------------

test("el servicio reconoce imagen, video y audio con sus topes", () => {
  expect(messageMediaKind("image/webp")).toBe("image");
  expect(messageMediaKind("video/quicktime")).toBe("video");
  expect(messageMediaKind("audio/ogg")).toBe("audio");
  expect(messageMediaKind("application/pdf")).toBe("");

  expect(MESSAGE_MEDIA_LIMITS).toEqual({
    image: 10 * 1024 * 1024,
    video: 50 * 1024 * 1024,
    audio: 15 * 1024 * 1024
  });
});

test("el upload rechaza un video que pasa del tope antes de salir a la red", async () => {
  const file = { type: "video/mp4", size: 60 * 1024 * 1024 };
  await expect(messagesService.uploadMessageMedia(file)).rejects.toThrow(/50 MB/);
  expect(apiMock.api.post).not.toHaveBeenCalled();
});

test("el upload manda el archivo por el mismo endpoint de siempre", async () => {
  apiMock.api.post.mockResolvedValue({
    data: { url: "/uploads/media/nota.ogg", mimeType: "audio/ogg", size: 2048 }
  });

  const result = await messagesService.uploadMessageMedia({
    type: "audio/ogg",
    size: 2048
  });

  expect(result.url).toBe("/uploads/media/nota.ogg");
  const [url, form] = apiMock.api.post.mock.calls[0];
  expect(url).toBe("/messages/media/upload");
  expect(form instanceof FormData).toBe(true);
});

// ---------------------------------------------------------------
// Lista de mensajes: tipo de adjunto, lápida y borrado.
// ---------------------------------------------------------------

const base = {
  sender: { _id: "other", username: "ana" },
  receiver: { _id: "me" },
  createdAt: new Date().toISOString()
};

test("un adjunto de video se pinta como reproductor, no como imagen rota", () => {
  render(
    <MessageList
      currentUserId="me"
      messages={[
        {
          ...base,
          _id: "m1",
          sender: { _id: "me" },
          text: "",
          media: { url: "/uploads/media/clip.mp4", mimeType: "video/mp4", kind: "video" }
        }
      ]}
    />
  );

  const player = document.querySelector("video.k-message-media");
  expect(player).toBeTruthy();
  // `resolveMediaUrl` resuelve contra el API_URL del cliente; aquí el mock es
  // "/api", así que la URL relativa se queda como está.
  expect(player.getAttribute("src")).toBe("/uploads/media/clip.mp4");
  expect(document.querySelector("img.k-message-media")).toBeNull();
});

test("un mensaje antiguo sin `kind` se resuelve por el MIME", () => {
  render(
    <MessageList
      currentUserId="me"
      messages={[
        {
          ...base,
          _id: "m2",
          sender: { _id: "me" },
          media: { url: "/uploads/media/voz.mp3", mimeType: "audio/mpeg" }
        }
      ]}
    />
  );

  expect(document.querySelector("audio.k-message-media")).toBeTruthy();
});

test("un mensaje borrado muestra la lápida y no deja borrarlo otra vez", () => {
  const onDelete = vi.fn();
  render(
    <MessageList
      currentUserId="me"
      onDelete={onDelete}
      messages={[
        {
          ...base,
          _id: "m3",
          sender: { _id: "me" },
          text: "",
          deletedAt: new Date().toISOString(),
          media: { url: "", mimeType: "", kind: "" }
        }
      ]}
    />
  );

  expect(screen.getByText("Mensaje eliminado")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Eliminar mensaje" })).toBeNull();
});

test("el botón de eliminar solo aparece en los mensajes propios", () => {
  const onDelete = vi.fn();

  const { unmount } = render(
    <MessageList currentUserId="me" onDelete={onDelete} messages={[{ ...base, _id: "m4", text: "de otro" }]} />
  );
  expect(screen.queryByRole("button", { name: "Eliminar mensaje" })).toBeNull();
  unmount();

  render(
    <MessageList
      currentUserId="me"
      onDelete={onDelete}
      messages={[{ ...base, _id: "m5", sender: { _id: "me" }, text: "mío" }]}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Eliminar mensaje" }));
  expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ _id: "m5" }));
});

// ---------------------------------------------------------------
// Composer: el tipo se propaga al enviar.
// ---------------------------------------------------------------

test("el composer envía el `kind` del adjunto al servidor", async () => {
  // Upload simulado: el servicio real se sustituye para no salir a la red.
  const uploadSpy = vi
    .spyOn(messagesService, "uploadMessageMedia")
    .mockResolvedValue({ url: "/uploads/media/clip.mp4", mimeType: "video/mp4", size: 900 });
  const onSend = vi.fn().mockResolvedValue(undefined);

  render(<MessageComposer onSend={onSend} />);

  const input = document.querySelector('input[type="file"]');
  const file = new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => expect(uploadSpy).toHaveBeenCalled());

  // La preview se pinta según el tipo mientras el adjunto sigue en el composer.
  expect(document.querySelector("video.k-composer-preview")).toBeTruthy();
  expect(document.querySelector("img.k-composer-preview")).toBeNull();

  fireEvent.change(screen.getByLabelText("Escribir mensaje"), { target: { value: "mira esto" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await waitFor(() =>
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "mira esto",
        media: expect.objectContaining({ kind: "video" })
      })
    )
  );

  uploadSpy.mockRestore();
  // Al enviarse, el adjunto se limpia. El componente limpia DESPUÉS de que
  // `onSend` resuelve (`clearAttachment()` va tras el `await`), así que
  // afirmarlo en el mismo tick veía la vista previa todavía montada: era el
  // fallo intermitente de esta prueba en CI, no un adjunto que no se limpiara.
  await waitFor(() => expect(document.querySelector("video.k-composer-preview")).toBeNull());
});

// ---------------------------------------------------------------
// Pantalla de conversación: el borrado llega por socket.
// ---------------------------------------------------------------

test("el socket avisa del borrado y el mensaje se convierte en lápida", async () => {
  apiMock.api.get.mockImplementation(async (url) => {
    if (url === "/messages/other") {
      return {
        data: {
          user: { _id: "other", username: "ana", displayName: "Ana" },
          messages: [
            { ...base, _id: "m6", sender: { _id: "me" }, text: "efímero" }
          ]
        }
      };
    }
    return { data: { conversations: [] } };
  });
  apiMock.api.patch.mockResolvedValue({ data: { ok: true } });

  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={["/messages/other"]}>
        <Routes>
          <Route path="/messages/:userId" element={<Messages />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  expect(await screen.findByText("efímero")).toBeTruthy();

  // El servidor emite `message:deleted` a las dos partes.
  const handler = socket.on.mock.calls.find(([event]) => event === "message:deleted")?.[1];
  expect(handler).toBeTruthy();

  handler({ messageId: "m6", deletedAt: new Date().toISOString() });

  await waitFor(() => expect(screen.getByText("Mensaje eliminado")).toBeTruthy());
  expect(screen.queryByText("efímero")).toBeNull();
});

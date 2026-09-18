import React from "react";
import { expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import useMessageSend from "../src/features/messages/useMessageSend";
import { newClientMessageId } from "../src/services/messagesService";

/**
 * KRONOS-UI-021 — cola de reintentos idempotentes.
 *
 * Contrato clave: cada mensaje en vuelo tiene UN clientMessageId que
 * se reutiliza en el reintento, para que el backend deduplique y no
 * haya mensajes dobles si el envío original ya llegó.
 */

test("el envío genera un clientMessageId y lo propaga al backend", async () => {
  const sendFn = vi.fn().mockResolvedValue({
    message: { _id: "server-1", clientMessageId: "capturado" },
    deduplicated: false
  });

  const { result } = renderHook(() => useMessageSend({ sendFn }));

  await act(async () => {
    await result.current.send({ text: "hola", media: null });
  });

  expect(sendFn).toHaveBeenCalledTimes(1);
  const payload = sendFn.mock.calls[0][0];
  expect(payload.text).toBe("hola");
  expect(typeof payload.clientMessageId).toBe("string");
  expect(payload.clientMessageId.length).toBeGreaterThan(0);
  expect(result.current.pending).toHaveLength(0);
});

test("un envío fallido queda en la cola y el reintento reutiliza el MISMO id", async () => {
  const sendFn = vi
    .fn()
    .mockRejectedValueOnce({
      response: { data: { error: "No se pudo enviar el mensaje." } }
    })
    .mockResolvedValueOnce({
      message: { _id: "server-2", clientMessageId: "reused-id" },
      deduplicated: false
    });

  const onSent = vi.fn();
  const { result } = renderHook(() =>
    useMessageSend({ sendFn, onSent })
  );

  let failedId;

  await act(async () => {
    await result.current.send({ text: "con red caída", media: null });
  });

  expect(result.current.pending).toHaveLength(1);
  expect(result.current.pending[0].status).toBe("failed");
  expect(result.current.pending[0].error).toBe("No se pudo enviar el mensaje.");
  failedId = result.current.pending[0].id;

  await act(async () => {
    await result.current.retry(failedId);
  });

  expect(sendFn).toHaveBeenCalledTimes(2);
  expect(sendFn.mock.calls[1][0].clientMessageId).toBe(failedId),
    "el reintento reutiliza el mismo clientMessageId";
  expect(result.current.pending).toHaveLength(0);
  expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ _id: "server-2" }));
});

test("descartar un mensaje fallido lo quita de la cola sin reenviar", async () => {
  const sendFn = vi.fn().mockRejectedValue(new Error("network down"));

  const { result } = renderHook(() => useMessageSend({ sendFn }));

  await act(async () => {
    await result.current.send({ text: "abandonado", media: null });
  });

  expect(result.current.pending).toHaveLength(1);

  await act(async () => {
    result.current.remove(result.current.pending[0].id);
  });

  expect(result.current.pending).toHaveLength(0);
  expect(sendFn).toHaveBeenCalledTimes(1);
});

test("newClientMessageId genera ids distintos", () => {
  const a = newClientMessageId();
  const b = newClientMessageId();
  expect(a).not.toBe(b);
});

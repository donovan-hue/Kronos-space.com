import { useCallback, useState } from "react";
import { newClientMessageId } from "../../services/messagesService";

/**
 * KRONOS-UI-021 — cola de envío con reintentos idempotentes.
 *
 * Cada mensaje en vuelo tiene un `clientMessageId` generado UNA sola
 * vez. Si el envío falla (red caída, timeout), el mensaje queda en la
 * cola con estado `failed` y el botón "Reintentar" reenvía el MISMO id:
 * el backend deduplica, así que ni un reenvío tardío de un envío que ya
 * llegó, ni un reintento explícito, producen mensajes dobles.
 */
export default function useMessageSend({ sendFn, onSent } = {}) {
  const [pending, setPending] = useState([]);

  const applyResult = useCallback(
    (id, { status, error = "" } = {}) => {
      setPending((items) =>
        items.map((item) =>
          item.id === id ? { ...item, status, error } : item
        )
      );
    },
    []
  );

  const send = useCallback(
    async ({ text = "", media = null } = {}) => {
      const id = newClientMessageId();
      const item = {
        id,
        text: String(text).trim(),
        media,
        status: "sending",
        error: "",
        createdAt: new Date().toISOString()
      };

      setPending((items) => [...items, item]);

      try {
        const data = await sendFn({
          text: item.text,
          media,
          clientMessageId: id
        });
        setPending((items) => items.filter((entry) => entry.id !== id));
        onSent?.(data?.message);
        return data;
      } catch (requestError) {
        const message =
          requestError?.response?.data?.error ||
          "No se pudo enviar el mensaje.";
        applyResult(id, { status: "failed", error: message });
        return null;
      }
    },
    [sendFn, onSent, applyResult]
  );

  const retry = useCallback(
    async (id) => {
      setPending((items) =>
        items.map((item) =>
          item.id === id ? { ...item, status: "sending", error: "" } : item
        )
      );

      const target = pending.find((item) => item.id === id);

      if (!target) return null;

      try {
        const data = await sendFn({
          text: target.text,
          media: target.media,
          clientMessageId: id
        });
        setPending((items) => items.filter((entry) => entry.id !== id));
        onSent?.(data?.message);
        return data;
      } catch (requestError) {
        const message =
          requestError?.response?.data?.error ||
          "No se pudo enviar el mensaje.";
        applyResult(id, { status: "failed", error: message });
        return null;
      }
    },
    [pending, sendFn, onSent, applyResult]
  );

  const remove = useCallback((id) => {
    setPending((items) => items.filter((entry) => entry.id !== id));
  }, []);

  return { pending, send, retry, remove };
}

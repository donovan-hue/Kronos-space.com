import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { resolveMediaUrl, uploadMessageMedia } from "../../services/messagesService";

/**
 * Composer de mensajes (1-a-1 y grupos) — KRONOS-UI-019.
 *
 * - Adjunto de imagen: se sube al elegir (mismo pipeline de /uploads/media
 *   que posts, AUDIT-005), con preview, texto alt opcional y quita.
 * - El envío queda en manos del prop `onSend({ text, media })` (la cola
 *   de reintentos vive en `useMessageSend`), así DM y grupos comparten
 *   exactamente el mismo comportamiento.
 */
export default function MessageComposer({ onSend, disabled = false, onTyping }) {
  const [text, setText] = useState("");
  const [alt, setAlt] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [attachError, setAttachError] = useState("");
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (attachment?.preview?.startsWith("blob:")) {
        URL.revokeObjectURL(attachment.preview);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearAttachment() {
    setAttachment((current) => {
      if (current?.preview?.startsWith("blob:")) {
        URL.revokeObjectURL(current.preview);
      }
      return null;
    });
    setAlt("");
    setAttachError("");
  }

  async function pickFile(file) {
    if (!file) return;
    let preview = "";
    try {
      preview = URL.createObjectURL(file);
    } catch {
      preview = "";
    }

    setAttachError("");
    setAttachment({ file, preview, uploading: true, media: null });

    try {
      const media = await uploadMessageMedia(file);
      setAttachment({ file, preview, uploading: false, media });
    } catch (requestError) {
      if (preview) URL.revokeObjectURL(preview);
      setAttachment(null);
      setAttachError(
        requestError?.response?.data?.error ||
          requestError?.message ||
          "No se pudo subir la imagen."
      );
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void pickFile(file);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const value = text.trim();
    const media = attachment?.uploading ? null : attachment?.media || null;
    if ((!value && !media) || sending || disabled) return;

    setSending(true);
    try {
      await onSend({ text: value, media });
      setText("");
      clearAttachment();
    } finally {
      setSending(false);
    }
  }

  function handleChange(event) {
    setText(event.target.value);
    onTyping?.();
  }

  const canSend =
    (text.trim().length > 0 || Boolean(attachment?.media)) &&
    !sending &&
    !disabled &&
    !attachment?.uploading;

  return (
    <form className="k-message-composer" onSubmit={handleSubmit}>
      {attachError && (
        <p className="k-state k-state-error" role="alert">
          {attachError}
        </p>
      )}
      {attachment && (
        <div className="k-composer-attachment">
          {attachment.preview && (
            <img
              className="k-composer-preview"
              src={attachment.preview}
              alt={alt || "Vista previa del adjunto"}
            />
          )}
          <div className="k-composer-attachment-info">
            {attachment.uploading ? (
              <span className="k-composer-uploading" role="status">
                Subiendo imagen…
              </span>
            ) : (
              <input
                className="k-input"
                type="text"
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
                maxLength={500}
                placeholder="Texto alternativo (opcional)"
                aria-label="Texto alternativo de la imagen"
              />
            )}
            <button
              type="button"
              className="k-button k-button-ghost"
              onClick={clearAttachment}
              disabled={attachment.uploading || sending}
              aria-label="Quitar imagen adjunta"
            >
              <X size={15} aria-hidden="true" /> Quitar
            </button>
          </div>
        </div>
      )}
      <div className="k-message-composer-row">
        <button
          type="button"
          className="k-icon-button k-composer-attach"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Adjuntar imagen"
          disabled={disabled || attachment?.uploading}
        >
          <ImagePlus size={19} aria-hidden="true" />
        </button>
        <textarea
          value={text}
          onChange={handleChange}
          maxLength={5000}
          placeholder="Escribe un mensaje..."
          aria-label="Escribir mensaje"
          disabled={disabled}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          hidden
        />
        <button
          className="k-button k-button-primary"
          type="submit"
          disabled={!canSend}
        >
          {sending ? "Enviando..." : "Enviar"}
        </button>
      </div>
    </form>
  );
}

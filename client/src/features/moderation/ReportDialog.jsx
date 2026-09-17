import { useEffect, useRef, useState } from "react";
import { createReport, REPORT_REASONS } from "../../services/moderationService";

/**
 * KRONOS-UI-011 — diálogo de reporte reutilizable.
 *
 * Se usa para publicaciones, comentarios y perfiles. Accesible por
 * teclado: el foco entra al diálogo, Escape lo cierra y el foco vuelve
 * al elemento que lo abrió.
 */
export default function ReportDialog({
  open,
  targetType,
  targetId,
  targetLabel = "",
  onClose,
  onReported
}) {
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    setReason("spam");
    setDetails("");
    setError("");
    setDone(false);
    setSending(false);

    const focusTarget = dialogRef.current?.querySelector("select, button, textarea");
    focusTarget?.focus();

    return () => {
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose?.();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(event) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    try {
      const report = await createReport({ targetType, targetId, reason, details });
      setDone(true);
      onReported?.(report);
    } catch (requestError) {
      const code = requestError.response?.data?.code;
      setError(
        code === "REPORT_DUPLICATE"
          ? "Ya reportaste este contenido y sigue en revisión."
          : requestError.response?.data?.error || "No se pudo enviar el reporte."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="k-modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div
        className="k-modal k-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        ref={dialogRef}
      >
        <h2 id="report-dialog-title">Reportar</h2>
        <p className="k-muted">
          {targetLabel ? `Enviarás un reporte sobre ${targetLabel}.` : "Enviarás un reporte al equipo de moderación."}
        </p>

        {done ? (
          <>
            <p className="k-state k-state-success" role="status">
              Reporte enviado. Gracias por ayudar a cuidar la comunidad.
            </p>
            <div className="k-button-group">
              <button className="k-button k-button-primary" type="button" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="k-ai-form">
            <label htmlFor="report-reason">Motivo</label>
            <select
              id="report-reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              disabled={sending}
            >
              {REPORT_REASONS.map(item => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>

            <label htmlFor="report-details">Detalles (opcional)</label>
            <textarea
              id="report-details"
              value={details}
              onChange={event => setDetails(event.target.value)}
              maxLength={1000}
              disabled={sending}
              placeholder="Cuéntanos qué ocurre. No incluyas datos personales."
            />
            <span className="k-muted">{details.length}/1000</span>

            {error && <p className="k-state k-state-error" role="alert">{error}</p>}

            <div className="k-button-group">
              <button className="k-button k-button-ghost" type="button" onClick={onClose} disabled={sending}>
                Cancelar
              </button>
              <button className="k-button k-button-primary" type="submit" disabled={sending}>
                {sending ? "Enviando..." : "Enviar reporte"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

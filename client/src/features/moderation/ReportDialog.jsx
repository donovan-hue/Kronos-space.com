import { useEffect, useState } from "react";
import { createReport, REPORT_REASONS } from "../../services/moderationService";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * KRONOS-UI-011 — diálogo de reporte reutilizable.
 *
 * Se usa para publicaciones, comentarios y perfiles. La capa de
 * accesibilidad (foco atrapado, Escape, clic en el fondo y retorno
 * del foco al elemento que abrió) la provee el Dialog del kit UI
 * (Radix), en sustitución del manejo manual anterior.
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

  useEffect(() => {
    if (!open) return;
    setReason("spam");
    setDetails("");
    setError("");
    setDone(false);
    setSending(false);
  }, [open]);

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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose?.();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reportar</DialogTitle>
          <DialogDescription>
            {targetLabel
              ? `Enviarás un reporte sobre ${targetLabel}.`
              : "Enviarás un reporte al equipo de moderación."}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <>
            <p className="k-state k-state-success" role="status">
              Reporte enviado. Gracias por ayudar a cuidar la comunidad.
            </p>
            <DialogFooter>
              <Button type="button" onClick={onClose}>
                Cerrar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="report-reason">Motivo</Label>
              <select
                id="report-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={sending}
              >
                {REPORT_REASONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="report-details">Detalles (opcional)</Label>
              <Textarea
                id="report-details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                maxLength={1000}
                disabled={sending}
                placeholder="Cuéntanos qué ocurre. No incluyas datos personales."
              />
              <span className="k-muted text-sm">{details.length}/1000</span>
            </div>

            {error && <p className="k-state k-state-error" role="alert">{error}</p>}

            <DialogFooter>
              <Button variant="ghost" type="button" onClick={onClose} disabled={sending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={sending}>
                {sending ? "Enviando..." : "Enviar reporte"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

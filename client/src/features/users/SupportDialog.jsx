import { useState } from "react";
import { sendCreatorTip } from "../../services/supportService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

// Apoyo SIMBÓLICO en créditos Kronos (★). No hay pasarela de pago en la
// plataforma: mostrar importes en dólares prometía un cobro que no existe.
const TIERS = [
  { id: "stardust", name: "Básico", amount: 10, label: "10 ★", description: "Apoyo inicial" },
  { id: "meteor", name: "Impulso", amount: 50, label: "50 ★", description: "Apoyo medio" },
  { id: "supernova", name: "Destacado", amount: 200, label: "200 ★", description: "Apoyo destacado" }
];

export default function SupportDialog({ open, creator, onClose, onSuccess }) {
  const [selectedTier, setSelectedTier] = useState("stardust");
  const [customAmount, setCustomAmount] = useState(10);
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // KRONOS-UIX-AUDIT: el diálogo usaba las clases `.k-dialog-backdrop` /
  // `.k-dialog` / `.k-dialog-header`, inexistentes en todo el sistema de
  // estilos: se renderizaba como un formulario inline, sin fondo, sin
  // bloqueo de foco y sin Escape. Se migró al Dialog del kit (Radix) que
  // aporta overlay, atrapado de foco, Escape y bloqueo de scroll.
  if (!creator) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setError("");

    try {
      const amount = selectedTier === "custom" ? Number(customAmount) : TIERS.find(t => t.id === selectedTier)?.amount || 10;
      await sendCreatorTip({
        creatorId: creator._id,
        amount,
        tier: selectedTier,
        message,
        anonymous
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "No se pudo enviar el apoyo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="w-[min(440px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>Apoyar a @{creator.username}</DialogTitle>
          <DialogDescription>
            Envía apoyo simbólico en créditos Kronos (★). Es un gesto público de
            reconocimiento: no se procesa ningún pago real.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {TIERS.map((tier) => (
              <button
                key={tier.id}
                type="button"
                className={`k-button ${selectedTier === tier.id ? "k-button-primary" : "k-button-secondary"}`}
                style={{ flexDirection: "column", padding: "10px 4px", gap: 4 }}
                onClick={() => {
                  setSelectedTier(tier.id);
                  setCustomAmount(tier.amount);
                }}
              >
                <span style={{ fontSize: "1.1rem", fontWeight: "bold" }}>{tier.label}</span>
                <span style={{ fontSize: "0.75rem", opacity: 0.85 }}>{tier.name}</span>
              </button>
            ))}
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Mensaje de agradecimiento (opcional)</span>
            <input
              type="text"
              className="k-input"
              placeholder="¡Excelente trabajo, sigue creando!"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={280}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            <span style={{ fontSize: "0.85rem" }}>Enviar como usuario anónimo</span>
          </label>

          {error && <p role="alert" className="k-state k-state-error">{error}</p>}

          <DialogFooter className="mt-1 sm:justify-end">
            <button type="button" className="k-button k-button-secondary" onClick={onClose} disabled={sending}>
              Cancelar
            </button>
            <button
              type="submit"
              className="k-button k-button-primary"
              disabled={sending}
              aria-busy={sending || undefined}
            >
              {sending ? "Enviando…" : "Enviar apoyo"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { sendCreatorTip } from "../../services/supportService";

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

  if (!open || !creator) return null;

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
    <div className="k-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="k-dialog k-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-dialog-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440 }}
      >
        <header className="k-dialog-header">
          <h3 id="support-dialog-title">Apoyar a @{creator.username}</h3>
          <button
            type="button"
            className="k-button k-button-ghost"
            onClick={onClose}
            aria-label="Cerrar diálogo de apoyo"
          >
            ✕
          </button>
        </header>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
          <p className="k-muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            Envía apoyo simbólico en créditos Kronos (★). Es un gesto público de
            reconocimiento: <strong>no se procesa ningún pago real</strong>.
          </p>

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

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <button type="button" className="k-button k-button-secondary" onClick={onClose} disabled={sending}>
              Cancelar
            </button>
            <button type="submit" className="k-button k-button-primary" disabled={sending}>
              {sending ? "Enviando..." : "Enviar apoyo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

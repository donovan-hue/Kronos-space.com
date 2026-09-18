import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/apiClient";
import KronosClockLogo from "../../components/ui/KronosClockLogo";
import WetChromeSign from "../../components/ui/WetChromeSign";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();

    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/forgot-password", {
        email: email.trim(),
      });

      setMessage(response.data.message || "Se ha enviado un enlace de recuperación a tu correo.");
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "No fue posible procesar la solicitud de recuperación."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="k-exact-landing-root">
      <div className="container">
        <KronosClockLogo />
        <WetChromeSign />
        <div className="divider" />
        <p className="subtitle">Time × Space Platform</p>
        <p className="domain">krono-space.com</p>

        <section className="k-auth-panel-card" style={{ maxWidth: 440 }}>
          <h2 className="k-auth-form-title">Recuperar contraseña</h2>
          <p className="k-auth-form-desc">
            Introduce el correo electrónico asociado a tu cuenta para recibir un enlace de restablecimiento.
          </p>

          <form onSubmit={submit} className="k-auth-form">
            <div className="k-form-field">
              <label htmlFor="recovery-email" className="k-field-label">
                Correo electrónico
              </label>
              <input
                id="recovery-email"
                type="email"
                className="k-text-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@correo.com"
                autoComplete="email"
                required
              />
            </div>

            {message && (
              <div className="k-auth-success-box" role="status">
                <span>✓ {message}</span>
              </div>
            )}

            {error && (
              <div className="k-auth-error-box" role="alert">
                <span>⚠ {error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="k-auth-submit-btn"
            >
              {loading ? "Enviando enlace..." : "Enviar instrucciones"}
            </button>
          </form>

          <footer className="k-auth-card-footer">
            <Link to="/login" className="k-link-highlight">
              ← Volver al inicio de sesión
            </Link>
          </footer>
        </section>
      </div>
    </main>
  );
}

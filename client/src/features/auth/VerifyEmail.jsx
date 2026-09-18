import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { requestEmailVerification, verifyEmail } from "../../services/authService";
import { getUser, updateUser } from "../../services/authStorage";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const currentUser = getUser();
  const [loading, setLoading] = useState(Boolean(token));
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [resendEmail, setResendEmail] = useState(currentUser?.email || "");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");

  useEffect(() => {
    if (!token) return;

    let active = true;
    setLoading(true);
    setError("");

    verifyEmail(token)
      .then((data) => {
        if (!active) return;
        setSuccess(true);
        if (currentUser) {
          updateUser({ ...currentUser, emailVerified: true });
        }
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.response?.data?.error || "El enlace de verificación no es válido o ya expiró.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function handleResend(event) {
    event.preventDefault();
    if (!resendEmail.trim() || resendLoading) return;

    setResendLoading(true);
    setResendMessage("");
    setResendError("");

    try {
      const response = await requestEmailVerification(resendEmail.trim());
      setResendMessage(response.message || "Si la cuenta existe, recibirás un enlace de verificación.");
    } catch (requestError) {
      setResendError(requestError.response?.data?.error || "No se pudo enviar el correo de verificación.");
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div className="k-auth-page" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section className="k-auth-card k-surface" style={{ maxWidth: 460, width: "100%", padding: 32, borderRadius: "var(--k-radius-lg)" }}>
        <header style={{ textAlign: "center", marginBottom: 24 }}>
          <p className="k-eyebrow">KRONOS SOCIAL AI</p>
          <h1 style={{ fontSize: "1.5rem", margin: "8px 0" }}>Verificación de Correo</h1>
        </header>

        {loading ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <span className="k-skeleton" style={{ display: "inline-block", width: 48, height: 48, borderRadius: "50%", marginBottom: 16 }} />
            <p className="k-muted">Verificando tu dirección de correo electrónico...</p>
          </div>
        ) : success ? (
          <div style={{ textAlign: "center", display: "grid", gap: 16 }}>
            <p className="k-state k-state-success" role="status">
              ¡Tu dirección de correo ha sido verificada correctamente!
            </p>
            <p className="k-muted">Ya puedes disfrutar de todas las funciones de Kronos.</p>
            <div style={{ marginTop: 12 }}>
              <Link className="k-button k-button-primary" to={currentUser ? "/home" : "/login"} style={{ display: "inline-block", width: "100%" }}>
                {currentUser ? "Ir al inicio" : "Iniciar sesión"}
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {error && (
              <p className="k-state k-state-error" role="alert">
                {error}
              </p>
            )}

            {!token && (
              <p className="k-muted">
                Para verificar tu cuenta, haz clic en el enlace que enviamos a tu correo o solicita uno nuevo a continuación.
              </p>
            )}

            <form onSubmit={handleResend} style={{ display: "grid", gap: 12, marginTop: 8 }}>
              <label htmlFor="verify-email-input" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                Correo electrónico
              </label>
              <input
                id="verify-email-input"
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                disabled={resendLoading}
                style={{
                  padding: "10px 12px",
                  border: "1px solid var(--k-border)",
                  borderRadius: 10,
                  background: "var(--k-bg)",
                  color: "var(--k-text)"
                }}
              />

              {resendMessage && <p className="k-state k-state-success" role="status">{resendMessage}</p>}
              {resendError && <p className="k-state k-state-error" role="alert">{resendError}</p>}

              <button
                type="submit"
                className="k-button k-button-primary"
                disabled={resendLoading || !resendEmail.trim()}
                style={{ marginTop: 4 }}
              >
                {resendLoading ? "Enviando..." : "Solicitar nuevo enlace"}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: 12 }}>
              <Link className="k-button k-button-ghost" to={currentUser ? "/home" : "/login"}>
                {currentUser ? "Volver al inicio" : "Volver a iniciar sesión"}
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

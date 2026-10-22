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
      .then(() => {
        if (!active) return;
        setSuccess(true);
        // Se lee aquí y no fuera del efecto: `currentUser` sale de getUser() en
        // cada render, así que ponerlo en las dependencias re-dispararía la
        // verificación del token en bucle. El efecto es de una sola vez.
        const usuario = getUser();
        if (usuario) {
          updateUser({ ...usuario, emailVerified: true });
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
    <div className="k-auth-page">
      <section className="k-auth-card k-surface">
        <header className="k-auth-status-header">
          <h1>Verificación de correo</h1>
        </header>

        {loading ? (
          <div className="k-auth-status is-centered">
            <span className="k-skeleton" />
            <p className="k-muted">Verificando tu dirección de correo electrónico...</p>
          </div>
        ) : success ? (
          <div className="k-auth-status is-centered">
            <p className="k-state k-state-success" role="status">
              ¡Tu dirección de correo ha sido verificada correctamente!
            </p>
            <p className="k-muted">Ya puedes disfrutar de todas las funciones de Kronos.</p>
            <div className="k-auth-status-actions">
              <Link className="k-button k-button-primary" to={currentUser ? "/home" : "/login"}>
                {currentUser ? "Ir al inicio" : "Iniciar sesión"}
              </Link>
            </div>
          </div>
        ) : (
          <div className="k-auth-status">
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

            <form onSubmit={handleResend} className="k-auth-resend">
              <label htmlFor="verify-email-input">
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
                className="k-input"
              />

              {resendMessage && <p className="k-state k-state-success" role="status">{resendMessage}</p>}
              {resendError && <p className="k-state k-state-error" role="alert">{resendError}</p>}

              <button
                type="submit"
                className="k-button k-button-primary"
                disabled={resendLoading || !resendEmail.trim()}
              >
                {resendLoading ? "Enviando..." : "Solicitar nuevo enlace"}
              </button>
            </form>

            <div className="k-auth-status-actions">
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

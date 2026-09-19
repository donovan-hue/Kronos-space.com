import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../services/apiClient";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!token) {
      setError("El enlace de recuperación es inválido o ha expirado.");
      return;
    }

    if (password.length < 8) {
      setError("La contraseña debe tener un mínimo de 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/auth/reset-password", {
        token,
        password,
      });

      setMessage(response.data.message || "Tu contraseña se ha actualizado exitosamente.");

      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1600);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "No fue posible actualizar la contraseña. Solicita un nuevo enlace."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="k-exact-landing-root">
      <div className="container">
        <section className="k-auth-panel-card" style={{ maxWidth: 440 }}>
          <h2 className="k-auth-form-title">Nueva contraseña</h2>
          <p className="k-auth-form-desc">
            Define una contraseña segura con al menos 8 caracteres.
          </p>

          <form onSubmit={submit} className="k-auth-form">
            <div className="k-form-field">
              <label htmlFor="reset-password" className="k-field-label">
                Nueva contraseña
              </label>
              <div className="k-input-action-wrapper">
                <input
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  className="k-text-input k-input-with-action"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="k-input-action-btn"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-pressed={showPassword}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <div className="k-form-field">
              <label htmlFor="reset-confirm-password" className="k-field-label">
                Confirmar nueva contraseña
              </label>
              <div className="k-input-action-wrapper">
                <input
                  id="reset-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  className="k-text-input k-input-with-action"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repite la nueva contraseña"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="k-input-action-btn"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-pressed={showConfirmPassword}
                >
                  {showConfirmPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
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
              {loading ? "Actualizando..." : "Guardar contraseña e iniciar"}
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

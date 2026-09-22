import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "../../services/apiClient";
import { resetPasswordSchema } from "../../schemas";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token") || "";

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  // Zod valida la política del backend (mínimo 10 + complejidad) y coincidencia;
  // el token se verifica aquí porque viene de la URL, no del formulario.
  const submit = handleSubmit(async (data) => {
    setMessage("");
    setError("");

    if (!token) {
      setError("El enlace de recuperación es inválido o ha expirado.");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/auth/reset-password", {
        token,
        password: data.password,
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
  });

  return (
    <main className="k-exact-landing-root">
      <div className="container">
        <section className="k-auth-panel-card" style={{ maxWidth: 440 }}>
          <h2 className="k-auth-form-title">Nueva contraseña</h2>
          <p className="k-auth-form-desc">
            Define una contraseña segura: mínimo 10 caracteres combinando mayúsculas, minúsculas, números o símbolos.
          </p>

          <form onSubmit={submit} className="k-auth-form" noValidate>
            <div className="k-form-field">
              <label htmlFor="reset-password" className="k-field-label">
                Nueva contraseña
              </label>
              <div className="k-input-action-wrapper">
                <input
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  className="k-text-input k-input-with-action"
                  placeholder="Mínimo 10 caracteres"
                  autoComplete="new-password"
                  {...register("password")}
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
              {errors.password && (
                <p className="k-field-error" role="alert">{errors.password.message}</p>
              )}
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
                  placeholder="Repite la nueva contraseña"
                  autoComplete="new-password"
                  {...register("confirmPassword")}
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
              {errors.confirmPassword && (
                <p className="k-field-error" role="alert">{errors.confirmPassword.message}</p>
              )}
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

import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "../../services/apiClient";
import { forgotPasswordSchema } from "../../schemas";

export default function ForgotPassword() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const submit = handleSubmit(async (data) => {
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/forgot-password", {
        email: data.email.trim(),
      });

      setMessage(response.data.message || "Se ha enviado un enlace de recuperación a tu correo.");
    } catch (err) {
      setError(
        err.response?.data?.code === "EMAIL_SERVICE_NOT_CONFIGURED"
          ? "La recuperación de contraseña no está disponible todavía. El administrador debe configurar el servicio de correo."
          : err.response?.data?.error ||
              "No fue posible procesar la solicitud de recuperación."
      );
    } finally {
      setLoading(false);
    }
  });

  return (
    <main className="k-exact-landing-root">
      <div className="container">
        <section className="k-auth-panel-card" style={{ maxWidth: 440 }}>
          <h2 className="k-auth-form-title">Recuperar contraseña</h2>
          <p className="k-auth-form-desc">
            Introduce el correo electrónico asociado a tu cuenta para recibir un enlace de restablecimiento.
          </p>

          <form onSubmit={submit} className="k-auth-form" noValidate>
            <div className="k-form-field">
              <label htmlFor="recovery-email" className="k-field-label">
                Correo electrónico
              </label>
              <input
                id="recovery-email"
                type="email"
                className="k-text-input"
                placeholder="tu@correo.com"
                autoComplete="email"
                {...register("email")}
              />
              {errors.email && (
                <p className="k-field-error" role="alert">{errors.email.message}</p>
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

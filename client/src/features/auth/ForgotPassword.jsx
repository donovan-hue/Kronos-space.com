import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/apiClient";

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
        email: email.trim()
      });

      setMessage(response.data.message);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        "No fue posible procesar la solicitud."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="ai-panel">
        <p className="k-eyebrow">
          KRONOS SOCIAL AI
        </p>

        <h2>Recuperar contraseña</h2>

        <p>
          Introduce el correo asociado a tu cuenta.
        </p>

        <form onSubmit={submit}>
          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            placeholder="Correo electrónico"
            autoComplete="email"
            required
          />

          {message && (
            <p role="status">
              {message}
            </p>
          )}

          {error && (
            <p role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Enviando..."
              : "Enviar instrucciones"}
          </button>
        </form>

        <p>
          <Link to="/login">
            Volver al inicio de sesión
          </Link>
        </p>
      </section>
    </main>
  );
}

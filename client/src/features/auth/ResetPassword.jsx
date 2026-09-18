import { useState } from "react";
import axios from "axios";
import {
  Link,
  useNavigate,
  useSearchParams
} from "react-router-dom";
import { API_URL } from "../../services/apiClient";

const API = API_URL;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!token) {
      setError(
        "El enlace de recuperación es inválido."
      );
      return;
    }

    if (password.length < 8) {
      setError(
        "La contraseña debe tener mínimo 8 caracteres."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(
        "Las contraseñas no coinciden."
      );
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(
        `${API}/auth/reset-password`,
        {
          token,
          password
        }
      );

      setMessage(response.data.message);

      setTimeout(() => {
        navigate("/login", {
          replace: true
        });
      }, 1500);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        "No fue posible actualizar la contraseña."
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

        <h2>Nueva contraseña</h2>

        <form onSubmit={submit}>
          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            placeholder="Nueva contraseña"
            autoComplete="new-password"
            minLength={8}
            required
          />

          <input
            type="password"
            value={confirmPassword}
            onChange={(event) =>
              setConfirmPassword(
                event.target.value
              )
            }
            placeholder="Confirmar contraseña"
            autoComplete="new-password"
            minLength={8}
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
              ? "Actualizando..."
              : "Cambiar contraseña"}
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

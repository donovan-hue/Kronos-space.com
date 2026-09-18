import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../services/apiClient";
import { saveSession } from "../../services/authStorage";

export default function Auth({ onLogin, initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  function switchMode(newMode) {
    setMode(newMode);
    setShowForm(true);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (mode === "register" && password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post(
        mode === "login" ? "/auth/login" : "/auth/register",
        mode === "login"
          ? { email: email.trim(), password }
          : {
              username: username.trim(),
              email: email.trim(),
              password,
              displayName: displayName.trim() || username.trim(),
            }
      );

      const { token, user, refreshToken, refreshExpiresAt } = response.data || {};

      if (!token || !user) {
        throw new Error("Respuesta de autenticación incompleta");
      }

      saveSession(
        token,
        user,
        remember || mode === "register",
        response.data?.expiresAt || "",
        refreshToken ? { token: refreshToken, refreshExpiresAt } : null
      );

      if (typeof onLogin === "function") {
        onLogin(user);
      }
      navigate("/home", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.error ||
          (err.code === "ERR_NETWORK"
            ? "No se pudo conectar con el servidor de Kronos Space."
            : err.message) ||
          "Error de autenticación"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="k-exact-landing-root">
      <div className="container">
        {/* =========================
            ÍCONO SUPERIOR EXACTO
            ========================= */}
        <div className="logo-icon">
          <div className="clock-circle">
            <div className="hands">
              <div className="hand-hour"></div>
              <div className="hand-minute"></div>
              <div className="center-dot"></div>
            </div>
          </div>
          <div className="orbit">
            <div className="sphere"></div>
          </div>
        </div>

        {/* =========================
            TÍTULO PRINCIPAL CROMADO
            ========================= */}
        <h1 className="brand-title">KRONOSPACE</h1>

        {/* =========================
            LÍNEA DIVISORIA SUTIL
            ========================= */}
        <div className="divider"></div>

        {/* =========================
            SUBTÍTULOS EXACTOS
            ========================= */}
        <p className="subtitle">Time &times; Space Platform</p>
        <p className="domain">krono-space.com</p>

        {/* =========================
            ACCIONES Y FORMULARIO INTEGRADO
            ========================= */}
        <div className="k-auth-actions-wrapper">
          {!showForm ? (
            <div className="k-auth-pill-row">
              <button
                type="button"
                className="k-auth-pill-btn is-primary"
                onClick={() => switchMode("login")}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                className="k-auth-pill-btn is-secondary"
                onClick={() => switchMode("register")}
              >
                Crear cuenta
              </button>
            </div>
          ) : (
            <div className="k-auth-panel-card">
              <div className="k-auth-panel-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "login"}
                  className={`k-auth-tab-pill ${mode === "login" ? "is-active" : ""}`}
                  onClick={() => switchMode("login")}
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "register"}
                  className={`k-auth-tab-pill ${mode === "register" ? "is-active" : ""}`}
                  onClick={() => switchMode("register")}
                >
                  Crear cuenta
                </button>
              </div>

              <form onSubmit={submit} className="k-auth-form" noValidate={false}>
                {mode === "register" && (
                  <div className="k-auth-form-grid">
                    <div className="k-form-field">
                      <label htmlFor="auth-username" className="k-field-label">
                        Nombre de usuario
                      </label>
                      <input
                        id="auth-username"
                        type="text"
                        className="k-text-input"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="ej. alex_kronos"
                        autoComplete="username"
                        required
                      />
                    </div>

                    <div className="k-form-field">
                      <label htmlFor="auth-display-name" className="k-field-label">
                        Nombre para mostrar
                      </label>
                      <input
                        id="auth-display-name"
                        type="text"
                        className="k-text-input"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="ej. Alex Rivera"
                        autoComplete="name"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="k-form-field">
                  <label htmlFor="auth-email" className="k-field-label">
                    Correo electrónico
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    className="k-text-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="k-form-field">
                  <label htmlFor="auth-password" className="k-field-label">
                    Contraseña
                  </label>
                  <div className="k-input-action-wrapper">
                    <input
                      id="auth-password"
                      type={showPassword ? "text" : "password"}
                      className="k-text-input k-input-with-action"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      className="k-input-action-btn"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                </div>

                {mode === "register" && (
                  <div className="k-form-field">
                    <label htmlFor="auth-confirm-password" className="k-field-label">
                      Confirmar contraseña
                    </label>
                    <div className="k-input-action-wrapper">
                      <input
                        id="auth-confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        className="k-text-input k-input-with-action"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repite tu contraseña"
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                      <button
                        type="button"
                        className="k-input-action-btn"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-pressed={showConfirmPassword}
                      >
                        {showConfirmPassword ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                  </div>
                )}

                {mode === "login" && (
                  <div className="k-auth-utility-row">
                    <label className="k-checkbox-label">
                      <input
                        type="checkbox"
                        className="k-checkbox-input"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                      />
                      <span>Recordar sesión</span>
                    </label>

                    <Link to="/forgot-password" className="k-link-subtle">
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>
                )}

                {error && (
                  <div className="k-auth-error-box" role="alert">
                    <span className="k-error-icon" aria-hidden="true">⚠</span>
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="k-auth-submit-btn"
                >
                  {loading ? "Procesando..." : mode === "login" ? "Iniciar sesión" : "Crear mi cuenta"}
                </button>

                <button
                  type="button"
                  className="k-auth-close-btn"
                  onClick={() => setShowForm(false)}
                >
                  Cerrar
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

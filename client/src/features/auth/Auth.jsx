import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../services/apiClient";
import { saveSession } from "../../services/authStorage";
import KronosClockLogo from "../../components/ui/KronosClockLogo";

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
    <main className="k-master-landing-root">
      <div className="k-master-composition">
        {/* =========================================================
            IMAGEN OFICIAL EXACTA DEL REPOSITORIO (IMG-20260917-WA0001)
            ========================================================= */}
        <div className="k-master-poster-wrapper">
          <img
            src="/kronos-master-design.jpg"
            alt="KRONOSPACE — TIME × SPACE PLATFORM — krono-space.com"
            className="k-master-poster-img"
          />
        </div>

        {/* =========================================================
            BOTONES DE ACCESO Y FORMULARIO DE ENTRADA
            ========================================================= */}
        <div className="k-master-auth-section">
          {!showForm ? (
            <div className="k-master-action-row">
              <button
                type="button"
                className="k-master-cta-btn is-primary"
                onClick={() => switchMode("login")}
              >
                <span>Iniciar sesión</span>
              </button>
              <button
                type="button"
                className="k-master-cta-btn is-secondary"
                onClick={() => switchMode("register")}
              >
                <span>Crear cuenta</span>
              </button>
            </div>
          ) : (
            <div className="k-master-form-card">
              <div className="k-master-tab-switch" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "login"}
                  className={`k-master-tab-btn ${mode === "login" ? "is-active" : ""}`}
                  onClick={() => switchMode("login")}
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "register"}
                  className={`k-master-tab-btn ${mode === "register" ? "is-active" : ""}`}
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
                  className="k-auth-submit-btn k-master-submit"
                >
                  {loading ? (
                    <>
                      <KronosClockLogo size="xs" animated interactive={false} loading ariaLabel="Cargando" />
                      <span>Procesando...</span>
                    </>
                  ) : mode === "login" ? (
                    "Entrar al espacio"
                  ) : (
                    "Crear mi cuenta"
                  )}
                </button>

                <button
                  type="button"
                  className="k-master-close-form"
                  onClick={() => setShowForm(false)}
                >
                  Ocultar formulario
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

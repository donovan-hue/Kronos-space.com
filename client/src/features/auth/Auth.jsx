import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../services/apiClient";
import { saveSession } from "../../services/authStorage";
import WetChromeSign from "../../components/ui/WetChromeSign";
import KronosClockLogo from "../../components/ui/KronosClockLogo";

export default function Auth({ onLogin, initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
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
        refreshToken ? { token: refreshToken, expiresAt: refreshExpiresAt } : null
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
    <main className="k-auth-page-root">
      <div className="k-auth-wrapper">
        {/* DISEÑO MAESTRO: reloj orbital + KRONOSPACE + divisor + subtítulo */}
        <header className="k-auth-header">
          <div className="k-auth-logo">
            <KronosClockLogo size="lg" animated interactive ariaLabel="Kronos, reloj orbital cromado" />
          </div>
          <h1 className="k-auth-sign-title">
            <WetChromeSign text="KRONOSPACE" size="hero" ariaLabel="KRONOSPACE" />
          </h1>
          <div className="k-auth-divider" aria-hidden="true" />
          <p className="k-auth-subtitle">TIME × SPACE PLATFORM</p>
        </header>

        {/* MAIN AUTH CARD */}
        <section className="k-auth-card">
          {/* SEGMENTED TAB SWITCHER */}
          <div className="k-auth-mode-switch" role="tablist" aria-label="Modo de autenticación">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={`k-mode-pill ${mode === "login" ? "is-active" : ""}`}
              onClick={() => switchMode("login")}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={`k-mode-pill ${mode === "register" ? "is-active" : ""}`}
              onClick={() => switchMode("register")}
            >
              Crear cuenta
            </button>
          </div>

          <form onSubmit={submit} className="k-auth-form" noValidate={false}>
            {/* REGISTER FIELDS */}
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

            {/* EMAIL FIELD */}
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

            {/* PASSWORD FIELD WITH INTEGRATED SHOW/HIDE */}
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
                  tabIndex={0}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            {/* CONFIRM PASSWORD (REGISTER) */}
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
                    tabIndex={0}
                  >
                    {showConfirmPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </div>
            )}

            {/* REMEMBER & FORGOT PASSWORD ROW (LOGIN MODE) */}
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

            {/* ERROR ALERT */}
            {error && (
              <div className="k-auth-error-box" role="alert">
                <span className="k-error-icon" aria-hidden="true">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* SUBMIT BUTTON 3D */}
            <button
              type="submit"
              disabled={loading}
              className="k-auth-submit-btn"
            >
              {loading ? (
                <>
                  <KronosClockLogo size="xs" animated interactive={false} loading ariaLabel="Cargando" />
                  <span>Procesando...</span>
                </>
              ) : mode === "login" ? (
                "Iniciar sesión"
              ) : (
                "Crear mi cuenta"
              )}
            </button>
          </form>

          {/* FOOTER SWITCHER (CLEAN & MINIMAL) */}
          <footer className="k-auth-card-footer">
            {mode === "login" ? (
              <p className="k-auth-footer-prompt">
                ¿Aún no tienes cuenta?{" "}
                <button
                  type="button"
                  className="k-link-highlight"
                  onClick={() => switchMode("register")}
                >
                  Crear una cuenta gratis
                </button>
              </p>
            ) : (
              <p className="k-auth-footer-prompt">
                ¿Ya tienes una cuenta registrada?{" "}
                <button
                  type="button"
                  className="k-link-highlight"
                  onClick={() => switchMode("login")}
                >
                  Inicia sesión aquí
                </button>
              </p>
            )}
          </footer>
        </section>

        <p className="k-auth-domain">krono-space.com</p>
        <span className="k-auth-star" aria-hidden="true" />
      </div>
    </main>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "../../services/apiClient";
import { saveSession } from "../../services/authStorage";
import { loginSchema, registerSchema } from "../../schemas";

// ---------------------------------------------------------------
// KRONOS-AUTH-GOOGLE — "Continuar con Google" (Google Identity Services)
//
// El script oficial de Google se carga bajo demanda (solo si el backend
// reporta que el acceso con Google está activo). El botón oficial se
// renderiza en dos huecos: el landing (píldoras iniciales) y el panel
// del formulario. La credencial que entrega Google viaja al backend,
// que la verifica y devuelve la misma sesión JWT + refresh de siempre.
// ---------------------------------------------------------------

const GOOGLE_GSI_SRC = "https://accounts.google.com/gsi/client";

let googleScriptPromise = null;

function loadGoogleIdentity() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Sin entorno de navegador"));
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id);
  }

  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GOOGLE_GSI_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.google?.accounts?.id) {
          resolve(window.google.accounts.id);
        } else {
          googleScriptPromise = null;
          reject(new Error("Google Identity Services no está disponible"));
        }
      };
      script.onerror = () => {
        googleScriptPromise = null;
        reject(new Error("No se pudo cargar Google Identity Services"));
      };

      document.head.appendChild(script);
    });
  }

  return googleScriptPromise;
}

export default function Auth({ onLogin, initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Formulario con React Hook Form + Zod. El esquema sigue el modo
  // (login no valida username/confirmación) y las reglas son las del
  // backend: username 3-30 [a-z0-9_], password ≥8, email válido.
  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(mode === "login" ? loginSchema : registerSchema),
    defaultValues: {
      username: "",
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
      remember: true,
    },
  });
  const [googleConfig, setGoogleConfig] = useState({ enabled: false, clientId: "" });
  const [googleReady, setGoogleReady] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();

  const googleLandingBtnRef = useRef(null);
  const googleFormBtnRef = useRef(null);
  const googleCredentialHandlerRef = useRef(() => {});

  // Consulta (una vez) si el backend tiene activo el login con Google.
  useEffect(() => {
    let cancelled = false;

    api
      .get("/auth/google/config")
      .then((response) => {
        const { enabled, clientId } = response.data || {};

        if (!cancelled && enabled && clientId) {
          setGoogleConfig({ enabled: true, clientId });
        }
      })
      .catch(() => {
        /* Sin configuración de Google (o sin backend): el botón no aparece. */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Mantiene el handler actualizado sin reinicializar el SDK de Google.
  useEffect(() => {
    googleCredentialHandlerRef.current = handleGoogleCredential;
  });

  // Inicializa Google Identity Services cuando hay Client ID disponible.
  useEffect(() => {
    if (!googleConfig.enabled) return;

    let cancelled = false;

    loadGoogleIdentity()
      .then((idApi) => {
        if (cancelled) return;

        idApi.initialize({
          client_id: googleConfig.clientId,
          callback: (response) => googleCredentialHandlerRef.current(response),
          ux_mode: "popup",
          auto_select: false,
          cancel_on_tap_outside: true
        });

        setGoogleReady(true);
      })
      .catch((loadError) => {
        console.warn("GOOGLE_GSI_LOAD_WARN:", loadError.message);
      });

    return () => {
      cancelled = true;
    };
  }, [googleConfig.enabled, googleConfig.clientId]);

  // Dibuja el botón oficial en cada hueco visible (landing o formulario).
  useEffect(() => {
    if (!googleReady) return;

    const idApi = window.google?.accounts?.id;

    if (typeof idApi?.renderButton !== "function") return;

    const slots = [googleLandingBtnRef.current, googleFormBtnRef.current].filter(Boolean);

    for (const slot of slots) {
      if (slot.childElementCount === 0) {
        idApi.renderButton(slot, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "left",
          width: 320
        });
      }
    }
  }, [googleReady, showForm, mode]);

  function switchMode(newMode) {
    setMode(newMode);
    setShowForm(true);
    setError("");
  }

  // Zod ya validó y recortó los campos; aquí solo queda la llamada.
  const submit = handleSubmit(async (data) => {
    setError("");
    setLoading(true);

    try {
      const response = await api.post(
        mode === "login" ? "/auth/login" : "/auth/register",
        mode === "login"
          ? { email: data.email.trim(), password: data.password }
          : {
              username: data.username.trim(),
              email: data.email.trim(),
              password: data.password,
              displayName: data.displayName.trim() || data.username.trim(),
            }
      );

      const { token, user, refreshToken, refreshExpiresAt } = response.data || {};

      if (!token || !user) {
        throw new Error("Respuesta de autenticación incompleta");
      }

      saveSession(
        token,
        user,
        data.remember || mode === "register",
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
  });

  async function handleGoogleCredential(response) {
    const credential = response?.credential;

    if (!credential) {
      setError("Google no devolvió una credencial válida. Intenta de nuevo.");
      return;
    }

    setError("");
    setGoogleLoading(true);

    try {
      const { data } = await api.post("/auth/google", { credential });

      const { token, user, refreshToken, refreshExpiresAt, expiresAt } = data || {};

      if (!token || !user) {
        throw new Error("Respuesta de autenticación incompleta");
      }

      saveSession(
        token,
        user,
        true,
        expiresAt || "",
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
          "No se pudo iniciar sesión con Google"
      );
    } finally {
      setGoogleLoading(false);
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
            <>
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

              {googleConfig.enabled && (
                <div className="k-auth-google-block">
                  <span className="k-auth-or-label">o</span>
                  <div
                    ref={googleLandingBtnRef}
                    className="k-google-btn-slot"
                    aria-label="Continuar con Google"
                  />
                  {googleLoading && (
                    <span className="k-auth-google-status">
                      Iniciando sesión con Google…
                    </span>
                  )}
                </div>
              )}
            </>
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

              <form onSubmit={submit} className="k-auth-form" noValidate>
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
                        placeholder="ej. alex_kronos"
                        autoComplete="username"
                        {...registerField("username")}
                      />
                      {errors.username && (
                        <p className="k-field-error" role="alert">{errors.username.message}</p>
                      )}
                    </div>

                    <div className="k-form-field">
                      <label htmlFor="auth-display-name" className="k-field-label">
                        Nombre para mostrar
                      </label>
                      <input
                        id="auth-display-name"
                        type="text"
                        className="k-text-input"
                        placeholder="ej. Alex Rivera"
                        autoComplete="name"
                        {...registerField("displayName")}
                      />
                      {errors.displayName && (
                        <p className="k-field-error" role="alert">{errors.displayName.message}</p>
                      )}
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
                    placeholder="tu@correo.com"
                    autoComplete="email"
                    {...registerField("email")}
                  />
                  {errors.email && (
                    <p className="k-field-error" role="alert">{errors.email.message}</p>
                  )}
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
                      placeholder="Mínimo 8 caracteres"
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      {...registerField("password")}
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
                        placeholder="Repite tu contraseña"
                        autoComplete="new-password"
                        {...registerField("confirmPassword")}
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
                )}

                {mode === "login" && (
                  <div className="k-auth-utility-row">
                    <label className="k-checkbox-label">
                      <input
                        type="checkbox"
                        className="k-checkbox-input"
                        {...registerField("remember")}
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

                {googleConfig.enabled && (
                  <div className="k-auth-google-block is-in-form">
                    <div className="k-auth-or-divider" aria-hidden="true">
                      <span>o</span>
                    </div>
                    <div
                      ref={googleFormBtnRef}
                      className="k-google-btn-slot"
                      aria-label="Continuar con Google"
                    />
                    {googleLoading && (
                      <span className="k-auth-google-status">
                        Iniciando sesión con Google…
                      </span>
                    )}
                  </div>
                )}

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

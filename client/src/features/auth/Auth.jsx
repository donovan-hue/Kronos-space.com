import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "../../services/apiClient";
import { saveSession } from "../../services/authStorage";
import { loginSchema, registerSchema } from "../../schemas";
import { SceneBackground } from "../../three";
import MotionToggle from "../../components/motion/MotionToggle.jsx";
import { motionEnabled } from "../../lib/motionPreference.js";

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
const GOOGLE_CLIENT_ID_FALLBACK = String(
  import.meta.env.VITE_GOOGLE_CLIENT_ID || ""
).trim();

// KRONOS-UIX-AUDIT — retorno al destino real.
// ProtectedRoute y el comodín de rutas anónimas guardan `state.from`; al
// iniciar sesión el usuario vuelve a la URL que intentaba (deep links y
// sesiones expiradas ya no devuelven siempre a /home). Se aceptan solo
// rutas internas seguras: nada de protocolos ni URLs con "//" (open
// redirect), y nunca se vuelve a las propias pantallas de autenticación.
const AUTH_ONLY_PATHS = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email"
]);

export function resolvePostAuthRedirect(from) {
  const pathname = from?.pathname;
  if (typeof pathname !== "string" || !pathname.startsWith("/") || pathname.startsWith("//")) {
    return "/home";
  }
  try {
    const url = new URL(pathname + (from?.search || ""), "https://kronos.local");
    if (url.origin !== "https://kronos.local") return "/home";
    if (AUTH_ONLY_PATHS.has(url.pathname)) return "/home";
    return url.pathname + url.search;
  } catch {
    return "/home";
  }
}


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
  const [googleConfig, setGoogleConfig] = useState(() => ({
    enabled: Boolean(GOOGLE_CLIENT_ID_FALLBACK),
    clientId: GOOGLE_CLIENT_ID_FALLBACK,
  }));
  const [googleReady, setGoogleReady] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleLoadError, setGoogleLoadError] = useState(false);
  const [googleConfigError, setGoogleConfigError] = useState(false);
  const [googleRetry, setGoogleRetry] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const postAuthRedirect = resolvePostAuthRedirect(location.state?.from);

  const landingRef = useRef(null);
  const googleLandingBtnRef = useRef(null);
  const googleFormBtnRef = useRef(null);
  const googleCredentialHandlerRef = useRef(() => {});

  // Consulta (una vez) si el backend tiene activo el login con Google.
  useEffect(() => {
    let cancelled = false;

    setGoogleConfigError(false);
    api
      .get("/auth/google/config")
      .then((response) => {
        const { enabled, clientId } = response.data || {};
        const resolvedClientId = String(
          clientId || GOOGLE_CLIENT_ID_FALLBACK
        ).trim();

        if (!cancelled) {
          setGoogleConfig({
            enabled: Boolean(enabled && resolvedClientId),
            clientId: resolvedClientId,
          });
        }
      })
      .catch(() => {
        if (cancelled) return;

        // El Client ID es público. El fallback evita ocultar el botón si un
        // proxy o una caída temporal impide consultar /google/config.
        setGoogleConfigError(true);
        setGoogleConfig({
          enabled: Boolean(GOOGLE_CLIENT_ID_FALLBACK),
          clientId: GOOGLE_CLIENT_ID_FALLBACK,
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (googleConfigError && GOOGLE_CLIENT_ID_FALLBACK) {
      setError(
        "No se pudo consultar la configuración de Google. Se intentará usar el Client ID público del frontend."
      );
    }
  }, [googleConfigError]);

  // KRONOS-FLOW — Parallax de puntero en el hero: escribe --px/--py
  // (-1..1 normalizado) en la raíz y flow.css lo consume en capas de
  // profundidad (logo, título, panel). rAF única, listener pasivo; con
  // prefers-reduced-motion o sin navegador no se monta: el hero queda
  // quieto, nunca roto.
  useEffect(() => {
    const root = landingRef.current;
    if (!root || !motionEnabled()) return undefined;

    let raf = 0;
    let px = 0;
    let py = 0;
    const flush = () => {
      raf = 0;
      root.style.setProperty("--px", px.toFixed(3));
      root.style.setProperty("--py", py.toFixed(3));
    };
    const onMove = (event) => {
      px = ((event.clientX || 0) / Math.max(1, window.innerWidth) - 0.5) * 2;
      py = ((event.clientY || 0) / Math.max(1, window.innerHeight) - 0.5) * 2;
      if (!raf) raf = window.requestAnimationFrame(flush);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) window.cancelAnimationFrame(raf);
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
    setGoogleReady(false);
    setGoogleLoadError(false);

    loadGoogleIdentity()
      .then((idApi) => {
        if (cancelled) return;

        idApi.initialize({
          client_id: googleConfig.clientId,
          callback: (response) => googleCredentialHandlerRef.current(response),
          ux_mode: "popup",
          auto_select: false,
          cancel_on_tap_outside: true,
          itp_support: true,
          locale: "es"
        });

        setGoogleReady(true);
      })
      .catch((loadError) => {
        console.warn("GOOGLE_GSI_LOAD_WARN:", loadError.message);

        if (!cancelled) {
          setGoogleLoadError(true);
          setError(
            "No se pudo cargar el acceso con Google. Revisa si el navegador o una extensión está bloqueando accounts.google.com."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [googleConfig.enabled, googleConfig.clientId, googleRetry]);

  // Dibuja el botón oficial en cada hueco visible (landing o formulario).
  useEffect(() => {
    if (!googleReady) return;

    const idApi = window.google?.accounts?.id;

    if (typeof idApi?.renderButton !== "function") return;

    const slots = [googleLandingBtnRef.current, googleFormBtnRef.current].filter(Boolean);

    for (const slot of slots) {
      if (slot.childElementCount === 0) {
        // GIS exige que el botón que abre su popup sea el oficial. Lo
        // renderizamos a todo el ancho útil para que no parezca un control
        // incrustado o desalineado, especialmente en móviles.
        const availableWidth = Math.round(slot.getBoundingClientRect().width) || 360;
        const buttonWidth = Math.max(240, Math.min(400, availableWidth));

        idApi.renderButton(slot, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "left",
          width: buttonWidth,
          locale: "es"
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
      navigate(postAuthRedirect, { replace: true });
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

    if (googleLoading) return;

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
      navigate(postAuthRedirect, { replace: true });
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
    <main className="k-exact-landing-root" ref={landingRef}>
      {/*
          Fondo 3D cinematográfico (giroscopio cromado). Viaja en un
          chunk diferido que solo se descarga si hay WebGL; sin él, o
          si el contexto falla, queda el fallback CSS plata/negro.
          Decorativo: aria-hidden y sin eventos de puntero.
      */}
      {/* KRONOS-CROMO — Fallback CSS del bucle: metal líquido que muta
          sobre el vacío. Se ve siempre que el canvas 3D no esté (sin
          WebGL, chunk en camino o escena descartada). Decorativo puro:
          aria-hidden y cero punteros; ninguna función depende de él. */}
      <div className="k-void-liquid" aria-hidden="true"><span /></div>
      <SceneBackground scene="chrome-loop" className="k-scene--auth" />
      <div className="container">

        {/* =========================
            LOGOTIPO KRONOSPACE — EL MISMO DE SIEMPRE, AHORA VIVO
            (cambia todo el diseño alrededor; el logotipo original
            permanece: reloj + esfera, con manecillas en giro real)
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
        <p className="domain">kronos-space.com</p>

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
                  <div className={`k-google-btn-frame ${googleLoading ? "is-loading" : ""}`}>
                    <div
                      ref={googleLandingBtnRef}
                      className="k-google-btn-slot"
                      aria-label="Continuar con Google"
                    />
                  </div>
                  {!googleReady && !googleLoadError && (
                    <span className="k-auth-google-status" role="status">
                      Preparando acceso seguro con Google…
                    </span>
                  )}
                  {googleLoading && (
                    <span className="k-auth-google-status" role="status">
                      Iniciando sesión con Google…
                    </span>
                  )}
                  {googleLoadError && (
                    <button
                      type="button"
                      className="k-google-retry-btn"
                      onClick={() => {
                        setError("");
                        setGoogleRetry((attempt) => attempt + 1);
                      }}
                    >
                      Reintentar Google
                    </button>
                  )}
                </div>
              )}

              {!googleConfig.enabled && googleConfigError && (
                // Estado honesto "pendiente": el botón oficial de Google
                // necesita bien el backend (/api/auth/google/config) bien el
                // Client ID público VITE_GOOGLE_CLIENT_ID. Sin ninguno de los
                // dos NO se finge un acceso: se muestra la píldora inhabilitada
                // con el motivo real.
                <div className="k-auth-google-off">
                  <button
                    type="button"
                    className="k-auth-google-pending"
                    disabled
                    aria-disabled="true"
                    title="El acceso con Google requiere el backend (/api/auth/google/config) o el Client ID público VITE_GOOGLE_CLIENT_ID. En cuanto haya alguno, el botón oficial aparecerá aquí."
                  >
                    <span className="g-mark" aria-hidden="true">G</span>
                    <span>Continuar con Google</span>
                    <small>no disponible sin servidor</small>
                  </button>
                </div>
              )}

              {error && (
                <div className="k-auth-error-box is-landing" role="alert">
                  <span className="k-error-icon" aria-hidden="true">⚠</span>
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            <div className="k-auth-panel-card">
              <header className="k-auth-panel-heading">
                <span className="k-auth-panel-kicker">
                  {mode === "login" ? "Acceso seguro" : "Únete a Kronospace"}
                </span>
                <h2>{mode === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}</h2>
                <p>
                  {mode === "login"
                    ? "Ingresa tus datos para continuar."
                    : "Completa tus datos para comenzar."}
                </p>
              </header>

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
                    <div className={`k-google-btn-frame ${googleLoading ? "is-loading" : ""}`}>
                      <div
                        ref={googleFormBtnRef}
                        className="k-google-btn-slot"
                        aria-label="Continuar con Google"
                      />
                    </div>
                    {!googleReady && !googleLoadError && (
                      <span className="k-auth-google-status" role="status">
                        Preparando acceso seguro con Google…
                      </span>
                    )}
                    {googleLoading && (
                      <span className="k-auth-google-status" role="status">
                        Iniciando sesión con Google…
                      </span>
                    )}
                    {googleLoadError && (
                      <button
                        type="button"
                        className="k-google-retry-btn"
                        onClick={() => {
                          setError("");
                          setGoogleRetry((attempt) => attempt + 1);
                        }}
                      >
                        Reintentar Google
                      </button>
                    )}
                  </div>
                )}

                <div className="k-auth-mode-switch">
                  <span>{mode === "login" ? "¿Aún no tienes cuenta?" : "¿Ya tienes cuenta?"}</span>
                  <button
                    type="button"
                    onClick={() => switchMode(mode === "login" ? "register" : "login")}
                  >
                    {mode === "login" ? "Crear cuenta" : "Iniciar sesión"}
                  </button>
                </div>

                <button
                  type="button"
                  className="k-auth-close-btn"
                  onClick={() => setShowForm(false)}
                >
                  Volver
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
      <MotionToggle />
    </main>
  );
}

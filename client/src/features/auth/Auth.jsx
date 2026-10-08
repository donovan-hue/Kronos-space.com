import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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

    const slots = [googleFormBtnRef.current].filter(Boolean);

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
  }, [googleReady, mode]);

  function switchMode(newMode) {
    setMode(newMode);
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

  const title = mode === "login" ? "Iniciar sesión" : "Crear cuenta";

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <div>
            <Link to="/" className="brand mark" aria-label="KRONOS SPACE">
              <span className="lay b-extrude" aria-hidden="true">KRONOS</span>
              <span className="lay b-bevel" aria-hidden="true">KRONOS</span>
              <span className="lay b-rim" aria-hidden="true">KRONOS</span>
              <span className="lay b-face">KRONOS</span>
            </Link>
          </div>
          <div className="sub">Space</div>
        </div>
        <div className="auth-title">{title}</div>

        <form onSubmit={submit} noValidate>
          {mode === "register" && (
            <div className="field">
              <label htmlFor="auth-username">Nombre de usuario</label>
              <div className="input-ring">
                <input
                  id="auth-username"
                  type="text"
                  placeholder="@username"
                  autoComplete="username"
                  {...registerField("username")}
                />
              </div>
              <div className="err" role={errors.username ? "alert" : undefined}>{errors.username?.message}</div>
            </div>
          )}

          {mode === "register" && (
            <div className="field">
              <label htmlFor="auth-display-name">Nombre para mostrar</label>
              <div className="input-ring">
                <input
                  id="auth-display-name"
                  type="text"
                  placeholder="ej. Alex Rivera"
                  autoComplete="name"
                  {...registerField("displayName")}
                />
              </div>
              <div className="err" role={errors.displayName ? "alert" : undefined}>{errors.displayName?.message}</div>
            </div>
          )}

          <div className="field">
            <label htmlFor="auth-email">Correo</label>
            <div className="input-ring">
              <input
                id="auth-email"
                type="email"
                placeholder="tu@correo.com"
                autoComplete="email"
                {...registerField("email")}
              />
            </div>
            <div className="err" role={errors.email ? "alert" : undefined}>{errors.email?.message}</div>
          </div>

          <div className="field">
            <label htmlFor="auth-password">Contraseña</label>
            <div className="input-ring">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                placeholder={mode === "login" ? "••••••••" : "Mínimo 8 caracteres"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                {...registerField("password")}
              />
            </div>
            <span
              role="button"
              tabIndex={0}
              className="link"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setShowPassword((prev) => !prev)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setShowPassword((prev) => !prev);
                }
              }}
              aria-pressed={showPassword}
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </span>
            <div className="err" role={errors.password ? "alert" : undefined}>{errors.password?.message}</div>
          </div>

          {mode === "register" && (
            <div className="field">
              <label htmlFor="auth-confirm-password">Confirmación de contraseña</label>
              <div className="input-ring">
                <input
                  id="auth-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                  {...registerField("confirmPassword")}
                />
              </div>
              <span
                role="button"
                tabIndex={0}
                className="link"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setShowConfirmPassword((prev) => !prev);
                  }
                }}
                aria-pressed={showConfirmPassword}
              >
                {showConfirmPassword ? "Ocultar" : "Mostrar"}
              </span>
              <div className="err" role={errors.confirmPassword ? "alert" : undefined}>{errors.confirmPassword?.message}</div>
            </div>
          )}

          {mode === "login" && (
            <div className="row-between" style={{ margin: ".2rem .2rem 1.4rem" }}>
              <label className="meta">
                <input type="checkbox" {...registerField("remember")} /> Recordar sesión
              </label>
              <Link to="/forgot-password" className="link">¿Olvidaste tu contraseña?</Link>
            </div>
          )}

          {error && <div className="err" role="alert">{error}</div>}

          <button type="submit" disabled={loading} className="btn block">
            <span><i>{loading ? "Procesando..." : mode === "login" ? "Iniciar sesión" : "Crear cuenta"}</i></span>
          </button>

          {googleConfig.enabled && (
            <>
              <div className="or"><span>o</span></div>
              <div className={`k-google-btn-frame ${googleLoading ? "is-loading" : ""}`}>
                <div ref={googleFormBtnRef} className="k-google-btn-slot" aria-label="Continuar con Google" />
              </div>
              {!googleReady && !googleLoadError && (
                <div className="center meta" role="status">Preparando acceso seguro con Google…</div>
              )}
              {googleLoading && (
                <div className="center meta" role="status">Iniciando sesión con Google…</div>
              )}
              {googleLoadError && (
                <div className="center">
                  <span
                    role="button"
                    tabIndex={0}
                    className="link"
                    onClick={() => {
                      setError("");
                      setGoogleRetry((attempt) => attempt + 1);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setError("");
                        setGoogleRetry((attempt) => attempt + 1);
                      }
                    }}
                  >
                    Reintentar Google
                  </span>
                </div>
              )}
            </>
          )}

          <div className="rule"></div>
          <div className="center meta">
            {mode === "login" ? "¿Todavía no tienes cuenta?" : "¿Ya tienes cuenta?"}
            <span
              role="button"
              tabIndex={0}
              className="link"
              style={{ marginLeft: ".4rem" }}
              onClick={() => switchMode(mode === "login" ? "register" : "login")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  switchMode(mode === "login" ? "register" : "login");
                }
              }}
            >
              {mode === "login" ? "Crear cuenta" : "Iniciar sesión"}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

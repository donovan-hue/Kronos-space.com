import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "./feedback/ToastProvider";
import {
  getLastConversationUserId,
  getLastProfile,
} from "../services/fanContext";

/**
 * FAN NAV — launcher contextual de KRONOSPACE
 *
 * Especificación funcional (v2):
 * - SIEMPRE los mismos 8 accesos periféricos + Inicio central:
 *   Perfil, Mensaje, Kairos, Crear, Buscar, Notificaciones,
 *   Configuración, Historia.
 * - Posiciones angulares fijas del mock: -80,-57,-34,-11,+11,+34,+57,+80.
 * - Buscar, Notificaciones y Configuración sustituyen a los accesos de
 *   la barra superior (que ahora solo muestra la marca) y a las burbujas
 *   pendientes SocialFi/Market/Game, que regresarán cuando esos módulos
 *   existan de verdad (nunca navegación falsa).
 * - Lo que cambia según la pantalla NO son los botones, sino su
 *   COMPORTAMIENTO: destino contextual, botón activo, no re-navegar
 *   si ya estás ahí y preservación de estado.
 * - Navegación centralizada en handleFanNavigation(destination, context)
 *   — ningún botón tiene lógica propia.
 * - Historia dentro de Kairos navega al historial real de generaciones
 *   (/kairos/history); la historia social sigue pendiente.
 */

/* ---------- Iconos del mock (SVG stroke) ---------- */
const ICONS = {
  home: (
    <svg viewBox="0 0 24 24">
      <path d="M3.5 11.4 12 4l8.5 7.4" />
      <path d="M5.6 9.8V20h12.8V9.8" />
      <path d="M9.8 20v-5.2h4.4V20" />
    </svg>
  ),
  perfil: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5.4 19.6a6.6 6.6 0 0 1 13.2 0" />
    </svg>
  ),
  mensaje: (
    <svg viewBox="0 0 24 24">
      <path d="M20 6.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h1.4v3l3.6-3H18a2 2 0 0 0 2-2Z" />
      <path d="M8 9.3h8M8 12.4h5" />
    </svg>
  ),
  kairos: (
    <svg viewBox="0 0 24 24">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
    </svg>
  ),
  publica: (
    <svg viewBox="0 0 24 24">
      <rect x="4.5" y="4.5" width="15" height="15" rx="3.2" />
      <path d="M12 8.7v6.6M8.7 12h6.6" />
    </svg>
  ),
  buscar: (
    <svg viewBox="0 0 24 24">
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m15.4 15.4 4.8 4.8" />
    </svg>
  ),
  avisos: (
    <svg viewBox="0 0 24 24">
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.6 2.4H4.4Z" />
      <path d="M10.2 20.6a2 2 0 0 0 3.6 0" />
    </svg>
  ),
  config: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3.2v2.2M12 18.6v2.2M20.8 12h-2.2M5.4 12H3.2M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6M18.2 18.2l-1.6-1.6M7.4 7.4 5.8 5.8" />
    </svg>
  ),
  historia: (
    <svg viewBox="0 0 24 24">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v16H6.5A2.5 2.5 0 0 0 4 21.5Z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v16h5.5a2.5 2.5 0 0 1 2.5 2.5Z" />
    </svg>
  ),
};

/* ---------- Los 8 satélites del mock, con sus --deg exactos ---------- */
/* Los 8 satélites del mock, con sus --deg exactos. Material: cromado espejo. */
const SATELLITES = [
  { go: "perfil", label: "Perfil", deg: -80 },
  { go: "mensaje", label: "Mensaje", deg: -57 },
  { go: "kairos", label: "Kairos", deg: -34 },
  { go: "publica", label: "Crear", deg: -11 },
  { go: "buscar", label: "Buscar", deg: 11 },
  { go: "avisos", label: "Avisos", deg: 34 },
  { go: "config", label: "Config", deg: 57 },
  { go: "historia", label: "Historia", deg: 80 },
];

/* ---------- Sección actual a partir de la ruta ---------- */
export function getCurrentSection(pathname) {
  const p = pathname || "";
  if (p === "/home" || p === "/feed" || p === "/social") return "home";
  if (p.startsWith("/profile") || p.startsWith("/users")) return "perfil";
  if (p.startsWith("/messages") || p.startsWith("/conversations")) return "mensaje";
  if (p === "/kairos/history") return "kairos-history";
  if (p.startsWith("/kairos") || p.startsWith("/ai") || p === "/library") return "kairos";
  if (p.startsWith("/create")) return "publica";
  if (p === "/explore" || p === "/search") return "buscar";
  if (p.startsWith("/notifications")) return "avisos";
  if (p.startsWith("/settings") || p.startsWith("/moderation") || p.startsWith("/admin")) return "config";
  if (p.startsWith("/history")) return "historia";
  return "";
}

/* Sección a la que pertenece cada botón para marcarlo activo */
function isButtonActive(go, section) {
  if (go === "kairos") return section === "kairos" || section === "kairos-history";
  if (go === "historia") return section === "historia" || section === "kairos-history";
  return section === go;
}

export default function FanNav() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const section = useMemo(
    () => getCurrentSection(location.pathname),
    [location.pathname]
  );

  const close = useCallback(() => setOpen(false), []);

  // Regla 1.5.d: cambiar de pantalla cierra el abanico.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  /**
   * Navegación centralizada (regla 15).
   * Todos los botones pasan por aquí: identificar pantalla actual →
   * identificar destino → cerrar abanico → navegar (o no) → el botón
   * activo se recalcula solo al cambiar la ruta.
   */
  const handleFanNavigation = useCallback(
    (destination) => {
      const pathname = location.pathname;
      const go = (to) => {
        close();
        if (pathname !== to) navigate(to);
      };
      const stay = () => close();
      const soon = (label) => {
        showToast(`${label} llegará pronto a Kronos Space.`, { tone: "info" });
      };

      switch (destination) {
        case "inicio": {
          // En Home solo cierra; fuera de Home navega a /home.
          if (section === "home") stay();
          else go("/home");
          return;
        }

        case "perfil": {
          // Desde Mensajes con conversación abierta → perfil de ese usuario.
          if (section === "mensaje") {
            const peer = getLastConversationUserId();
            if (peer) {
              go(`/users/${peer}`);
              return;
            }
            go("/profile");
            return;
          }
          // Viendo el perfil de otro usuario → ese perfil ya es el contexto:
          // si ya estamos en un perfil (propio o ajeno), no recargar.
          if (section === "perfil") {
            stay();
            return;
          }
          // Contexto reciente de perfil ajeno (ej. Perfil → Mensaje → Perfil).
          const last = getLastProfile();
          if (last && !last.isOwn) {
            go(last.username ? `/profile/${last.username}` : `/users/${last.id}`);
            return;
          }
          go("/profile");
          return;
        }

        case "mensaje": {
          // Ya en Mensajes → no navegar, no crear conversaciones por accidente.
          if (section === "mensaje") {
            stay();
            return;
          }
          // Desde el perfil de otro usuario → conversación con ese usuario.
          const last = getLastProfile();
          if (section === "perfil" && last && !last.isOwn) {
            go(`/messages/${last.id}`);
            return;
          }
          go("/messages");
          return;
        }

        case "kairos": {
          // Dentro de Kairos: conservar la herramienta actual (no resetear).
          if (section === "kairos" || section === "kairos-history") {
            stay();
            return;
          }
          go("/kairos");
          return;
        }

        case "publica": {
          // Ya en Crear: cerrar sin recargar (el borrador se conserva
          // porque no hay navegación ni remount).
          if (section === "publica") {
            stay();
            return;
          }
          go("/create");
          return;
        }

        case "historia": {
          // Dentro de Kairos, Historia = historial real de generaciones.
          if (section === "kairos" || section === "kairos-history") {
            if (section === "kairos-history") stay();
            else go("/kairos/history");
            return;
          }
          // Historia social: módulo pendiente.
          soon("Historia");
          return;
        }

        case "buscar": {
          // Ya en Buscar/Explorar → conservar la búsqueda escrita.
          if (section === "buscar") {
            stay();
            return;
          }
          go("/search");
          return;
        }

        case "avisos": {
          if (section === "avisos") {
            stay();
            return;
          }
          go("/notifications");
          return;
        }

        case "config": {
          // Configuración general de toda la cuenta.
          if (section === "config") {
            stay();
            return;
          }
          go("/settings");
          return;
        }

        default:
          stay();
      }
    },
    [close, location.pathname, navigate, section, showToast]
  );

  function handleCentral() {
    if (!open) {
      setOpen(true);
      return;
    }
    handleFanNavigation("inicio");
  }

  return (
    <div className={`k-fan ${open ? "is-open" : ""}`}>
      {/* Gradiente cromado espejo para los iconos (tono maestro del
          proyecto: blanco → plata → acero → reflejo → titanio). */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="k-chrome-stroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#b0b0b0" />
            <stop offset="50%" stopColor="#444444" />
            <stop offset="70%" stopColor="#e0e0e0" />
            <stop offset="100%" stopColor="#777777" />
          </linearGradient>
        </defs>
      </svg>

      {/* Scrim: solo cierra, nunca navega (regla 14). */}
      <div className="k-fan-scrim" aria-hidden="true" onClick={close} />

      <nav className="k-fan-stage" aria-label="Navegación en abanico">
        {SATELLITES.map((orb, index) => {
          const active = isButtonActive(orb.go, section);
          return (
            <button
              key={orb.go}
              type="button"
              data-go={orb.go}
              className={`k-orb k-orb-sat ${active ? "is-active" : ""}`}
              style={{ "--deg": `${orb.deg}deg`, "--i": index }}
              onClick={() => handleFanNavigation(orb.go)}
              tabIndex={open ? 0 : -1}
              aria-hidden={!open}
              aria-current={active ? "true" : undefined}
            >
              <span className="k-orb-face">{ICONS[orb.go]}</span>
              <span className="k-orb-label">{orb.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          className={`k-orb k-orb-home ${section === "home" ? "is-active" : ""}`}
          onClick={handleCentral}
          aria-expanded={open}
          aria-current={section === "home" ? "true" : undefined}
          aria-label={open ? "Ir a inicio o cerrar menú" : "Abrir menú"}
        >
          <span className="k-orb-face">{ICONS.home}</span>
          <span className="k-orb-label k-orb-home-label">Inicio</span>
        </button>
      </nav>
    </div>
  );
}

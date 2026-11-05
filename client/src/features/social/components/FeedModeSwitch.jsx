import { Newspaper, Sparkles, Users } from "lucide-react";

/**
 * Conmutador del modo del feed.
 *
 * El servidor aplicaba `preferences.feed.mode` desde hace tiempo y la única
 * forma de cambiarlo era entrar a Ajustes; desde el inicio no se podía elegir
 * entre "lo más reciente", "quienes sigues" y "tus intereses".
 *
 * Es un cambio de VISTA, no de preferencia: el modo viaja como `?mode=` en la
 * consulta (el servidor lo valida contra la misma lista) y se recuerda en el
 * navegador para no volver siempre a `latest`. La preferencia guardada en el
 * perfil solo cambia desde Ajustes, que es donde se explica y persiste.
 */

export const FEED_MODES = [
  { id: "latest", label: "Reciente", hint: "Todo lo nuevo, de cualquier persona.", Icon: Newspaper },
  { id: "following", label: "Siguiendo", hint: "Solo quien sigues y lo tuyo.", Icon: Users },
  { id: "interests", label: "Intereses", hint: "Publicaciones de tus temas.", Icon: Sparkles }
];

const STORAGE_KEY = "kronos.feed.mode";

export function readStoredFeedMode() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY) || "";
    return FEED_MODES.some((entry) => entry.id === value) ? value : "latest";
  } catch {
    return "latest";
  }
}

export function storeFeedMode(mode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Modo privado o almacenamiento bloqueado: se queda en memoria.
  }
}

export default function FeedModeSwitch({ mode, onChange, disabled = false }) {
  return (
    <div className="k-feed-mode" role="group" aria-label="Orden del feed">
      {FEED_MODES.map((entry) => {
        const active = entry.id === mode;
        return (
          <button
            key={entry.id}
            type="button"
            className={`k-feed-mode-option ${active ? "is-active" : ""}`}
            aria-pressed={active}
            title={entry.hint}
            disabled={disabled}
            onClick={() => onChange(entry.id)}
          >
            <entry.Icon size={15} aria-hidden="true" />
            <span>{entry.label}</span>
          </button>
        );
      })}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUser, updateUser } from "../../services/authStorage";
import { updatePreferences, searchUsers, toggleFollow } from "../../services/usersService";
import Spinner from "../../components/ui/Spinner";

const TOPICS = [
  { id: "cielo", label: "✦ Cielo", desc: "Astrofotografía y espacio" },
  { id: "musica", label: "🎵 Música", desc: "Composición y géneros" },
  { id: "fotografia", label: "📸 Foto", desc: "Paisajes, retratos y visuales" },
  { id: "viajes", label: "🌋 Viajes", desc: "Rutas y expediciones" },
  { id: "arte", label: "🎨 Arte", desc: "Diseño, pintura y 3D" },
  { id: "ciencia", label: "🔬 Ciencia", desc: "Descubrimientos y física" },
  { id: "cocina", label: "🍜 Cocina", desc: "Gastronomía y recetas" },
  { id: "deporte", label: "⚽ Deporte", desc: "Entrenamiento y actividad" },
  { id: "tecnologia", label: "💻 Tech", desc: "Desarrollo y hardware" },
  { id: "cine", label: "🎬 Cine", desc: "Películas y análisis" },
  { id: "libros", label: "📚 Libros", desc: "Lectura y literatura" },
  { id: "videojuegos", label: "🎮 Gaming", desc: "Mundos y partidas" }
];

export default function Onboarding() {
  const navigate = useNavigate();
  const currentUser = getUser() || {};
  const [step, setStep] = useState(1);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [users, setUsers] = useState([]);
  const [followedUsers, setFollowedUsers] = useState(new Set());
  // Carga independiente de cada paso: un solo booleano lo apagaba el primero
  // de los dos fetch en terminar. Estaba declarado y sin usar, y por eso los
  // dos mensajes de lista vacía decían «Buscando…» o «No encontramos…» sin
  // saber en qué estado estaban de verdad.
  const [loading, setLoading] = useState({ users: true });
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  function finDeCarga(clave) {
    setLoading((previo) => ({ ...previo, [clave]: false }));
  }

  /** Mensaje legible de un fallo de red o del backend. */
  function mensajeDe(error, porDefecto) {
    return error?.response?.data?.error || error?.message || porDefecto;
  }

  // Cargar usuarios recomendados para el Paso 2
  useEffect(() => {
    let active = true;
    searchUsers("a")
      .then((data) => {
        if (active && Array.isArray(data?.users)) {
          setUsers(data.users.slice(0, 6));
        }
      })
      .catch((error) => {
        if (active) setActionError(mensajeDe(error, "No se pudieron cargar las personas sugeridas."));
      })
      .finally(() => {
        if (active) finDeCarga("users");
      });
    return () => { active = false; };
  }, []);

  function toggleTopic(id) {
    setSelectedTopics((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  async function handleFollowUser(userId) {
    setActionError("");
    try {
      await toggleFollow(userId);
      setFollowedUsers((prev) => {
        const next = new Set(prev);
        if (next.has(userId)) next.delete(userId);
        else next.add(userId);
        return next;
      });
    } catch (error) {
      setActionError(mensajeDe(error, "No pudimos seguir a esa persona. Inténtalo de nuevo."));
    }
  }

  /**
   * Persiste la caché local del usuario. `updateUser` lanza
   * SESSION_STORAGE_UNAVAILABLE cuando el navegador bloquea la escritura;
   * eso no es un fallo del backend ni de la operación en curso (el servidor
   * ya confirmó), así que no debe escapar como rechazo no manejado ni forzar
   * la rama de error. La navegación continúa después de la confirmación del servidor.
   */
  function persistUserLocally(nextUser) {
    try {
      updateUser(nextUser);
    } catch {
      // La caché local queda sin actualizar; el servidor sigue siendo la
      // fuente de verdad y /auth/me la refresca en la próxima carga.
    }
  }

  async function completeOnboarding(targetRoute = "/home") {
    if (saving) return;
    setSaving(true);
    setActionError("");
    try {
      await updatePreferences({
        onboarded: true,
        feed: {
          mode: selectedTopics.length ? "interests" : "latest",
          interests: selectedTopics
        }
      });
      const updated = {
        ...currentUser,
        preferences: {
          ...currentUser.preferences,
          onboarded: true,
          feed: {
            mode: selectedTopics.length ? "interests" : "latest",
            interests: selectedTopics
          }
        }
      };
      persistUserLocally(updated);
      navigate(targetRoute, { replace: true });
    } catch (error) {
      // No simular un guardado con la caché local: conservar la selección y
      // permitir reintentar la misma acción tras un rechazo del servidor.
      setActionError(mensajeDe(error, "No se guardaron tus preferencias. Tus elecciones siguen aquí; vuelve a intentarlo."));
    } finally {
      setSaving(false);
    }
  }

  const name = currentUser.displayName || currentUser.username || "explorador";

  return (
    <div className="k-onboarding-root">
      <div className="k-onboarding-container">
        {/* Barra superior de Onboarding */}
        <header className="k-onboarding-header">
          <div>
            <p className="k-eyebrow">BIENVENIDA A KRONOS</p>
            <h1 className="k-onboarding-greeting">Hola, {name}</h1>
          </div>

          <div className="k-onboarding-progress" aria-label={`Paso ${step} de 3`}>
            <div className="k-progress-dots">
              {[1, 2, 3].map((s) => (
                <span
                  key={s}
                  className={`k-progress-dot ${s === step ? "is-active" : s < step ? "is-done" : ""}`}
                />
              ))}
            </div>
            <span className="k-progress-label">Paso {step} de 3</span>
          </div>

          <button
            type="button"
            className="k-button k-button-ghost k-onboarding-skip"
            onClick={() => completeOnboarding("/home")}
            disabled={saving}
          >
            Saltar
          </button>
        </header>

        {actionError && (
          <p className="k-state k-state-error" role="alert">{actionError}</p>
        )}

        {/* PASO 1: Temas de interés */}
        {step === 1 && (
          <section className="k-onboarding-step" aria-labelledby="step-1-title">
            <h2 id="step-1-title" className="k-onboarding-step-title">
              ¿Qué te mueve?
            </h2>
            <p className="k-onboarding-step-desc">
              Elige al menos 3 temas para afinar tu Pulso y tu feed desde el primer momento.
            </p>

            <div className="k-onboarding-topics-grid">
              {TOPICS.map((topic) => {
                const isSelected = selectedTopics.includes(topic.id);
                return (
                  <button
                    type="button"
                    key={topic.id}
                    className={`k-topic-pill ${isSelected ? "is-selected" : ""}`}
                    onClick={() => toggleTopic(topic.id)}
                    aria-pressed={isSelected}
                  >
                    <strong>{topic.label}</strong>
                    <small>{topic.desc}</small>
                  </button>
                );
              })}
            </div>

            <footer className="k-onboarding-step-footer">
              <span className="k-muted">
                {selectedTopics.length}/3 seleccionados
                {selectedTopics.length >= 3 && " ✓"}
              </span>
              <button
                type="button"
                className="k-button k-button-primary"
                onClick={() => setStep(2)}
                disabled={selectedTopics.length < 3}
              >
                Continuar →
              </button>
            </footer>
          </section>
        )}

        {/* PASO 2: Personas a seguir */}
        {step === 2 && (
          <section className="k-onboarding-step" aria-labelledby="step-2-title">
            <h2 id="step-2-title" className="k-onboarding-step-title">
              Personas destacadas
            </h2>
            <p className="k-onboarding-step-desc">
              Sigue a otros creadores para llenar tu Inicio de contenido afín.
            </p>

            {users.length === 0 ? (
              loading.users ? (
                <div className="k-muted" role="status" aria-busy="true">
                  <Spinner size="sm" /> Buscando personas destacadas…
                </div>
              ) : (
                <p className="k-muted">No encontramos creadores adicionales en este momento.</p>
              )
            ) : (
              <div className="k-onboarding-items-grid">
                {users.map((u) => {
                  const isFollowed = followedUsers.has(u._id);
                  return (
                    <article key={u._id} className="k-onboarding-item-card">
                      <div className="k-item-card-info">
                        <strong>@{u.username}</strong>
                        <small className="k-muted">{u.displayName || u.bio || "Creador en Kronos"}</small>
                      </div>
                      <button
                        type="button"
                        className={`k-button ${isFollowed ? "k-button-secondary" : "k-button-primary"}`}
                        onClick={() => handleFollowUser(u._id)}
                      >
                        {isFollowed ? "Siguiendo ✓" : "Seguir"}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}

            <footer className="k-onboarding-step-footer">
              <button
                type="button"
                className="k-button k-button-ghost"
                onClick={() => setStep(1)}
              >
                ← Atrás
              </button>
              <button
                type="button"
                className="k-button k-button-primary"
                onClick={() => setStep(3)}
              >
                Continuar →
              </button>
            </footer>
          </section>
        )}

        {/* PASO 3: Tu primera acción */}
        {step === 3 && (
          <section className="k-onboarding-step" aria-labelledby="step-3-title">
            <h2 id="step-3-title" className="k-onboarding-step-title">
              Tu primera acción
            </h2>
            <p className="k-onboarding-step-desc">
              Todo está listo. ¿Por dónde quieres empezar?
            </p>

            <div className="k-onboarding-actions-grid">
              <button
                type="button"
                className="k-action-big-card"
                onClick={() => completeOnboarding("/create/post")}
                disabled={saving}
              >
                <span className="k-big-icon">✍️</span>
                <strong>Publicar algo breve</strong>
                <small>Comparte una idea, imagen o carrusel con la comunidad.</small>
              </button>

              <button
                type="button"
                className="k-action-big-card"
                onClick={() => completeOnboarding("/pulse")}
                disabled={saving}
              >
                <span className="k-big-icon">⚡</span>
                <strong>Empieza por Pulso</strong>
                <small>Sesión finita de 8 publicaciones seleccionadas para ti.</small>
              </button>

              <button
                type="button"
                className="k-action-big-card"
                onClick={() => completeOnboarding("/home")}
                disabled={saving}
              >
                <span className="k-big-icon">🪐</span>
                <strong>Ir a mi Inicio</strong>
                <small>Explora tu feed principal personalizado.</small>
              </button>
            </div>

            <footer className="k-onboarding-step-footer">
              <button
                type="button"
                className="k-button k-button-ghost"
                onClick={() => setStep(2)}
                disabled={saving}
              >
                ← Atrás
              </button>
              <button
                type="button"
                className="k-button k-button-primary"
                onClick={() => completeOnboarding("/home")}
                disabled={saving}
              >
                {saving ? <Spinner size="sm" /> : "Finalizar e ir a Inicio"}
              </button>
            </footer>
          </section>
        )}
      </div>
    </div>
  );
}

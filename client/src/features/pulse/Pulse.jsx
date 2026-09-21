import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Minus, Plus, RefreshCw } from "lucide-react";
import { getUser } from "../../services/authStorage";
import { getPulseSession, markPostSeen, signalPost } from "../../services/pulseService";
import { mediaUrl } from "../../services/mediaUrl";
import PostMedia from "../social/components/PostMedia";

/**
 * PULSO — sesión finita (Fase 6 del plan maestro).
 *
 * Alternativa al scroll infinito: hasta 8 publicaciones no vistas, una a
 * la vez, con fin explícito. "Visto" marca en el servidor (no se repite
 * en próximas sesiones) y las señales más/menos califican los temas para
 * las próximas sesiones.
 */
export default function Pulse() {
  const meId = useMemo(() => {
    const user = getUser();
    return String(user?._id || user?.id || "");
  }, []);
  const [session, setSession] = useState({ posts: [], sessionSize: 0, moreTags: [], lessTags: [] });
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFinished(false);
    setIndex(0);
    try {
      const data = await getPulseSession({ limit: 8 });
      setSession({
        posts: Array.isArray(data?.posts) ? data.posts : [],
        sessionSize: data?.sessionSize || 0,
        moreTags: data?.moreTags || [],
        lessTags: data?.lessTags || []
      });
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "No se pudo construir tu Pulso.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const current = session.posts[index] || null;
  const done = !current && !loading;

  async function advance(markSeen) {
    if (!current || busy) return;
    setBusy(true);
    try {
      if (markSeen) await markPostSeen(current._id);
      if (index + 1 < session.posts.length) {
        setIndex(index + 1);
      } else {
        setFinished(true);
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "No se pudo avanzar.");
    } finally {
      setBusy(false);
    }
  }

  async function signal(direction) {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    try {
      await signalPost(current._id, direction);
      await advance(false);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "No se pudo guardar la preferencia.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page k-pulse" aria-labelledby="k-pulse-title">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">PULSO</p>
          <h1 id="k-pulse-title">Tu sesión finita</h1>
          <p className="k-muted">
            Hasta 8 publicaciones sin repetir, una a la vez. Cuando termina, termina: el infinito vive en Inicio.
          </p>
        </div>
        <button type="button" className="k-button k-button-ghost" onClick={load} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" /> Nueva sesión
        </button>
      </header>

      {(session.moreTags.length > 0 || session.lessTags.length > 0) && (
        <p className="k-muted k-pulse-signals">
          {session.moreTags.length > 0 && <>Priorizas: {session.moreTags.map((tag) => `#${tag}`).join(", ")} · </>}
          {session.lessTags.length > 0 && <>Excluyes: {session.lessTags.map((tag) => `#${tag}`).join(", ")}</>}
        </p>
      )}

      {error && <p className="k-pulse-error" role="alert">{error}</p>}

      {loading ? (
        <div className="k-surface k-pulse-card" aria-busy="true">
          <p className="k-muted">Construyendo tu sesión...</p>
        </div>
      ) : finished || (done && session.posts.length === 0) ? (
        <div className="k-surface k-pulse-card k-pulse-done">
          <Check size={26} aria-hidden="true" />
          <h2>Sesión completa</h2>
          <p className="k-muted">Ya viste lo elegible sin repetir. Vuelve cuando quieras: seguiremos sin repetirte.</p>
          <button type="button" className="k-button k-button-primary" onClick={load}>Empezar otra sesión</button>
        </div>
      ) : current ? (
        <article className="k-surface k-pulse-card" aria-label={`Publicación ${index + 1} de ${session.posts.length}`}>
          <header className="k-pulse-card-head">
            <Link to={`/profile/${current.author?.username}`} className="k-pulse-author">
              {current.author?.avatar ? (
                <img src={mediaUrl(current.author.avatar)} alt="" />
              ) : (
                <span aria-hidden="true">{(current.author?.displayName || current.author?.username || "?").slice(0, 1).toUpperCase()}</span>
              )}
              <strong>{current.author?.displayName || current.author?.username || "Tu red"}</strong>
            </Link>
            <small className="k-muted">{index + 1} de {session.posts.length}</small>
          </header>

          {current.content && <p className="k-pulse-content">{current.content}</p>}
          <PostMedia media={current.media} mediaItems={current.mediaItems} content={current.content} />

          {current.recommendationReason && (
            <p className="k-muted k-pulse-reason">Por qué aparece: {current.recommendationReason}</p>
          )}

          <footer className="k-pulse-actions">
            <button type="button" className="k-button k-button-ghost" onClick={() => signal("less")} disabled={busy} title="Menos contenido así en tus sesiones">
              <Minus size={15} aria-hidden="true" /> Menos como esto
            </button>
            <button type="button" className="k-button k-button-ghost" onClick={() => signal("more")} disabled={busy} title="Prioriza este tema en tus sesiones">
              <Plus size={15} aria-hidden="true" /> Más como esto
            </button>
            <button type="button" className="k-button k-button-primary" onClick={() => advance(true)} disabled={busy}>
              {busy ? "..." : "Visto · siguiente"}
            </button>
          </footer>
          <p className="k-muted k-pulse-skip">
            <Link to={`/post/${current._id}`}>Abrir en detalle</Link> · la señal guarda tus temas para las próximas sesiones
          </p>
        </article>
      ) : null}

      {meId === "" && <p className="k-muted">Inicia sesión para usar tu Pulso.</p>}
    </section>
  );
}

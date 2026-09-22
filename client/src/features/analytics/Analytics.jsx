import { useCallback, useEffect, useState } from "react";
import { getCreatorAnalytics } from "../../services/analyticsService";
import Spinner from "../../components/ui/Spinner";

const WINDOWS = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" }
];

const TOTAL_CARDS = [
  { key: "posts", label: "Publicaciones" },
  { key: "likes", label: "Me gusta" },
  { key: "comments", label: "Comentarios" },
  { key: "saves", label: "Guardados" },
  { key: "remixes", label: "Remixes recibidos" }
];

function maxInteractions(timeline) {
  return timeline.reduce((max, day) => Math.max(max, day.interactions), 0);
}

export default function Analytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (windowDays) => {
    setLoading(true);
    setError("");
    try {
      setData(await getCreatorAnalytics(windowDays));
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo cargar tu analítica.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  const peak = data ? maxInteractions(data.timeline) : 0;

  return (
    <section className="page analytics-page">
      <header className="k-page-header">
        <div>
          <h1>Tu analítica</h1>
          <p>Privada, solo para ti: alcance e interacciones de tu propia obra.</p>
        </div>
        <div className="k-tabs" role="tablist" aria-label="Ventana de la analítica">
          {WINDOWS.map((option) => (
            <button
              key={option.days}
              type="button"
              role="tab"
              aria-selected={days === option.days}
              className={days === option.days ? "k-tab is-active" : "k-tab"}
              onClick={() => setDays(option.days)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {loading && <Spinner size="lg" label="Calculando…" />}

      {data && !loading && (
        <>
          <div className="analytics-grid">
            {TOTAL_CARDS.map((card) => (
              <section key={card.key} className="k-surface k-settings-section">
                <p className="k-eyebrow">{card.label.toUpperCase()}</p>
                <h2>{data.totals[card.key]}</h2>
              </section>
            ))}
            <section className="k-surface k-settings-section">
              <p className="k-eyebrow">SEGUIDORES</p>
              <h2>{data.followers}</h2>
            </section>
          </div>

          <section className="k-surface k-settings-section analytics-timeline" aria-label="Actividad de los últimos 14 días">
            <p className="k-eyebrow">ACTIVIDAD · ÚLTIMOS 14 DÍAS</p>
            <div className="analytics-bars" role="img" aria-label="Barras de publicaciones e interacciones por día">
              {data.timeline.map((day) => (
                <div key={day.date} className="analytics-bar-column" title={`${day.date}: ${day.posts} publicaciones · ${day.interactions} interacciones`}>
                  <span
                    className="analytics-bar analytics-bar-interactions"
                    style={{ height: `${peak ? Math.round((day.interactions / peak) * 100) : 0}%` }}
                  />
                  <span className="analytics-bar-label">{day.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="k-surface k-settings-section" aria-label="Publicaciones con más interacciones">
            <p className="k-eyebrow">LAS QUE MÁS RESONARON</p>
            {data.topPosts.length === 0 && <p className="k-empty">Aún no hay publicaciones en esta ventana.</p>}
            <ul className="analytics-top">
              {data.topPosts.map((post) => (
                <li key={post._id}>
                  <p className="analytics-top-content">{post.content || "(solo media)"}</p>
                  <p className="analytics-top-meta">
                    {post.likes} me gusta · {post.comments} comentarios · {post.saves} guardados
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <p className="analytics-scope">{data.scope}</p>
        </>
      )}

    </section>
  );
}

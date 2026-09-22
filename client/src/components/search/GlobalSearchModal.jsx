import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchGlobal } from "../../services/usersService";
import { mediaUrl } from "../../services/mediaUrl";
import { queryKeys } from "../../services/queryKeys";

function formatDate(dateValue) {
  if (!dateValue) return "";
  try {
    const d = new Date(dateValue);
    const now = new Date();
    const diffHours = Math.floor((now - d) / (1000 * 60 * 60));
    if (diffHours < 1) return "hace poco";
    if (diffHours < 24) return `hace ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `hace ${diffDays}d`;
    return d.toLocaleDateString("es-MX", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function GlobalSearchModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Debounce de 300 ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Enfocar input al abrir
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setDebouncedQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const enabled = debouncedQuery.length >= 2;

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.search(debouncedQuery, "all"),
    queryFn: () => searchGlobal(debouncedQuery, "all"),
    enabled,
    staleTime: 30_000,
  });

  const users = data?.users || [];
  const topics = data?.topics || [];
  const orbits = data?.orbits || [];
  const posts = data?.posts || [];

  // Flatten items for keyboard arrow navigation
  const flatItems = [];
  users.forEach((u) => {
    flatItems.push({
      type: "user",
      id: u._id,
      url: u.username ? `/profile/${u.username}` : `/users/${u._id}`,
      data: u
    });
  });
  topics.forEach((t) => {
    flatItems.push({
      type: "topic",
      id: `topic-${t.tag}`,
      url: `/explore?q=${encodeURIComponent(`#${t.tag}`)}`,
      data: t
    });
  });
  orbits.forEach((o) => {
    flatItems.push({
      type: "orbit",
      id: o._id,
      url: `/orbits/${o._id}`,
      data: o
    });
  });
  posts.forEach((p) => {
    flatItems.push({
      type: "post",
      id: p._id,
      url: `/post/${p._id}`,
      data: p
    });
  });

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, selectedIndex]);

  function handleSelect(item) {
    if (!item) return;
    onClose();
    navigate(item.url);
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % flatItems.length);
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatItems.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (flatItems[selectedIndex]) {
        handleSelect(flatItems[selectedIndex]);
      } else if (query.trim().length >= 2) {
        onClose();
        navigate(`/explore?q=${encodeURIComponent(query.trim())}`);
      }
    }
  }

  if (!isOpen) return null;

  const hasSearched = debouncedQuery.length >= 2;
  const hasResults = flatItems.length > 0;

  return (
    <div
      className="k-search-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="k-search-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global en Kronos"
      >
        <div className="k-search-modal-input-wrap">
          <span className="k-search-modal-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4.5 4.5" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="search"
            className="k-search-modal-input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar personas, temas, órbitas, publicaciones…"
            aria-label="Escribe para buscar"
            autoComplete="off"
            spellCheck="false"
          />
          {query && (
            <button
              type="button"
              className="k-search-modal-clear"
              onClick={() => {
                setQuery("");
                setDebouncedQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
            >
              ×
            </button>
          )}
          <span className="k-search-modal-shortcut" aria-hidden="true">ESC</span>
        </div>

        <div className="k-search-modal-body">
          {isLoading && (
            <div className="k-search-modal-loading" role="status" aria-label="Buscando">
              <div className="k-search-skeleton-item">
                <span className="k-skeleton k-skeleton-avatar" />
                <div style={{ flex: 1 }}>
                  <span className="k-skeleton" style={{ width: "40%", height: 14, marginBottom: 6 }} />
                  <span className="k-skeleton" style={{ width: "70%", height: 12 }} />
                </div>
              </div>
              <div className="k-search-skeleton-item">
                <span className="k-skeleton k-skeleton-avatar" />
                <div style={{ flex: 1 }}>
                  <span className="k-skeleton" style={{ width: "50%", height: 14, marginBottom: 6 }} />
                  <span className="k-skeleton" style={{ width: "60%", height: 12 }} />
                </div>
              </div>
            </div>
          )}

          {!isLoading && isError && (
            <div className="k-search-modal-empty" role="alert">
              <p>No se pudo completar la búsqueda. Intenta nuevamente.</p>
            </div>
          )}

          {!isLoading && !hasSearched && (
            <div className="k-search-modal-hint">
              <p className="k-eyebrow">SUGERENCIAS RÁPIDAS</p>
              <div className="k-search-quick-tags">
                <button
                  type="button"
                  className="k-chip"
                  onClick={() => {
                    setQuery("Kronos");
                  }}
                >
                  Kronos
                </button>
                <button
                  type="button"
                  className="k-chip"
                  onClick={() => {
                    setQuery("IA");
                  }}
                >
                  #IA
                </button>
                <button
                  type="button"
                  className="k-chip"
                  onClick={() => {
                    setQuery("arte");
                  }}
                >
                  #arte
                </button>
                <button
                  type="button"
                  className="k-chip"
                  onClick={() => {
                    setQuery("fotografía");
                  }}
                >
                  #fotografía
                </button>
              </div>
            </div>
          )}

          {!isLoading && hasSearched && !hasResults && !isError && (
            <div className="k-search-modal-empty">
              <p>Nada por aquí todavía. Prueba con otro término o crea la órbita que falta.</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 12 }}>
                <button
                  type="button"
                  className="k-button k-button-secondary"
                  onClick={() => {
                    onClose();
                    navigate("/orbits");
                  }}
                >
                  Ver Órbitas
                </button>
                <button
                  type="button"
                  className="k-button k-button-ghost"
                  onClick={() => {
                    onClose();
                    navigate(`/explore?q=${encodeURIComponent(debouncedQuery)}`);
                  }}
                >
                  Explorar todo
                </button>
              </div>
            </div>
          )}

          {!isLoading && hasResults && (
            <div className="k-search-modal-results">
              {/* GENTE */}
              {users.length > 0 && (
                <section className="k-search-group" aria-label="Gente">
                  <div className="k-search-group-header">
                    <span className="k-eyebrow">GENTE</span>
                    <span className="k-search-group-count">{users.length}</span>
                  </div>
                  <div className="k-search-group-list">
                    {users.map((u) => {
                      const itemIdx = flatItems.findIndex((it) => it.type === "user" && it.id === u._id);
                      const isSelected = itemIdx === selectedIndex;
                      return (
                        <div
                          key={u._id}
                          className={`k-search-item ${isSelected ? "is-selected" : ""}`}
                          onClick={() => handleSelect(flatItems[itemIdx])}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <span className="k-search-item-icon k-search-avatar">
                            {u.avatar ? (
                              <img src={mediaUrl(u.avatar)} alt="" />
                            ) : (
                              (u.displayName?.[0] || u.username?.[0] || "K").toUpperCase()
                            )}
                          </span>
                          <div className="k-search-item-content">
                            <strong>@{u.username}</strong>
                            {u.displayName && <span className="k-search-item-sub"> · {u.displayName}</span>}
                            {u.bio && <span className="k-search-item-desc"> — {u.bio.slice(0, 60)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* TEMAS */}
              {topics.length > 0 && (
                <section className="k-search-group" aria-label="Temas">
                  <div className="k-search-group-header">
                    <span className="k-eyebrow">TEMAS</span>
                    <span className="k-search-group-count">{topics.length}</span>
                  </div>
                  <div className="k-search-group-list">
                    {topics.map((t) => {
                      const itemIdx = flatItems.findIndex((it) => it.type === "topic" && it.id === `topic-${t.tag}`);
                      const isSelected = itemIdx === selectedIndex;
                      return (
                        <div
                          key={t.tag}
                          className={`k-search-item ${isSelected ? "is-selected" : ""}`}
                          onClick={() => handleSelect(flatItems[itemIdx])}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <span className="k-search-item-icon">#</span>
                          <div className="k-search-item-content">
                            <strong>#{t.tag}</strong>
                            <span className="k-search-item-sub"> · {t.count} {t.count === 1 ? "publicación" : "publicaciones"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ÓRBITAS */}
              {orbits.length > 0 && (
                <section className="k-search-group" aria-label="Órbitas">
                  <div className="k-search-group-header">
                    <span className="k-eyebrow">ÓRBITAS</span>
                    <span className="k-search-group-count">{orbits.length}</span>
                  </div>
                  <div className="k-search-group-list">
                    {orbits.map((o) => {
                      const itemIdx = flatItems.findIndex((it) => it.type === "orbit" && it.id === o._id);
                      const isSelected = itemIdx === selectedIndex;
                      return (
                        <div
                          key={o._id}
                          className={`k-search-item ${isSelected ? "is-selected" : ""}`}
                          onClick={() => handleSelect(flatItems[itemIdx])}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <span className="k-search-item-icon">◎</span>
                          <div className="k-search-item-content">
                            <strong>{o.name}</strong>
                            <span className="k-search-item-sub">
                              {" "}· {o.membersCount || 1} {o.membersCount === 1 ? "miembro" : "miembros"} · {o.visibility === "private" ? "privada" : "pública"}
                            </span>
                            {o.description && <span className="k-search-item-desc"> — {o.description.slice(0, 60)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* PUBLICACIONES */}
              {posts.length > 0 && (
                <section className="k-search-group" aria-label="Publicaciones">
                  <div className="k-search-group-header">
                    <span className="k-eyebrow">PUBLICACIONES</span>
                    <span className="k-search-group-count">{posts.length}</span>
                  </div>
                  <div className="k-search-group-list">
                    {posts.map((p) => {
                      const itemIdx = flatItems.findIndex((it) => it.type === "post" && it.id === p._id);
                      const isSelected = itemIdx === selectedIndex;
                      const dateStr = formatDate(p.createdAt);
                      return (
                        <div
                          key={p._id}
                          className={`k-search-item ${isSelected ? "is-selected" : ""}`}
                          onClick={() => handleSelect(flatItems[itemIdx])}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <span className="k-search-item-icon">▢</span>
                          <div className="k-search-item-content">
                            <span>&ldquo;{p.content ? (p.content.length > 55 ? `${p.content.slice(0, 55)}…` : p.content) : "Publicación multimedia"}&rdquo;</span>
                            <span className="k-search-item-sub"> · @{p.author?.username || "kronos"}</span>
                            {dateStr && <span className="k-search-item-sub"> · {dateStr}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        <div className="k-search-modal-footer">
          <span><kbd>↑</kbd> <kbd>↓</kbd> para navegar</span>
          <span><kbd>↵</kbd> para abrir</span>
          <span><kbd>ESC</kbd> para cerrar</span>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Plus } from "lucide-react";
import { getUser } from "../../../services/authStorage";
import { getStoryTray } from "../../../services/storiesService";
import { mediaUrl } from "../../../services/mediaUrl";
import StoryViewer from "./StoryViewer";
import StoryCreator from "./StoryCreator";

/**
 * STORIES — bandeja del feed.
 *
 * Primero la historia propia (crear si no hay activas), luego los grupos
 * de quienes sigues con anillo si hay historias sin ver. Sin estado
 * simulado: sin sesión o sin historias solo se muestra el botón propio.
 */
export default function StoriesBar() {
  const meId = useMemo(() => {
    const user = getUser();
    return String(user?._id || user?.id || "");
  }, []);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState({ open: false, index: 0 });
  const [creatorOpen, setCreatorOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const tray = await getStoryTray();
      setGroups(Array.isArray(tray) ? tray : []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ownGroup = groups.find((group) => String(group.author?._id) === meId) || null;
  const otherGroups = groups.filter((group) => String(group.author?._id) !== meId);

  function openViewer(index) {
    setViewer({ open: true, index });
  }

  function openOwn() {
    const index = groups.findIndex((group) => String(group.author?._id) === meId);
    if (index >= 0) openViewer(index);
    else setCreatorOpen(true);
  }

  if (!meId) return null;
  if (loading) {
    return (
      <section className="k-stories-bar" aria-label="Historias" aria-busy="true">
        <span className="k-story-tile-skeleton" />
        <span className="k-story-tile-skeleton" />
        <span className="k-story-tile-skeleton" />
      </section>
    );
  }

  return (
    <section className="k-stories-bar" aria-label="Historias">
      <button type="button" className="k-story-tile" onClick={openOwn} aria-label={ownGroup ? "Tu historia" : "Crear historia"}>
        <span className={`k-story-ring ${ownGroup?.hasUnseen ? "is-unseen" : "is-seen"}`}>
          {ownGroup?.author?.avatar ? (
            <img src={mediaUrl(ownGroup.author.avatar)} alt="" />
          ) : (
            <span className="k-story-ring-fallback" aria-hidden="true">Tú</span>
          )}
          {!ownGroup && (
            <span className="k-story-ring-plus" aria-hidden="true">
              <Plus size={14} />
            </span>
          )}
        </span>
        <small>{ownGroup ? "Tu historia" : "Crear"}</small>
      </button>

      {otherGroups.map((group, index) => (
        <button
          key={group.author?._id || index}
          type="button"
          className="k-story-tile"
          onClick={() => openViewer(groups.findIndex((item) => String(item.author?._id) === String(group.author?._id)))}
          aria-label={`Historias de ${group.author?.displayName || group.author?.username}`}
        >
          <span className={`k-story-ring ${group.hasUnseen ? "is-unseen" : "is-seen"}`}>
            {group.author?.avatar ? (
              <img src={mediaUrl(group.author.avatar)} alt="" />
            ) : (
              <span className="k-story-ring-fallback" aria-hidden="true">
                {(group.author?.displayName || group.author?.username || "?").slice(0, 1).toUpperCase()}
              </span>
            )}
          </span>
          <small>{group.author?.username || "…"}</small>
        </button>
      ))}

      <Link className="k-story-tile k-story-tile-archive" to="/stories/archive" aria-label="Archivo de historias">
        <span className="k-story-ring k-story-ring-archive" aria-hidden="true">
          <Archive size={18} />
        </span>
        <small>Archivo</small>
      </Link>

      {viewer.open && (
        <StoryViewer
          groups={groups}
          startGroupIndex={viewer.index}
          onClose={() => setViewer({ open: false, index: 0 })}
          onChanged={load}
        />
      )}

      <StoryCreator
        open={creatorOpen}
        onClose={() => setCreatorOpen(false)}
        onCreated={() => {
          setLoading(true);
          load();
        }}
      />
    </section>
  );
}

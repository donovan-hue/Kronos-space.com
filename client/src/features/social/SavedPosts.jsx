import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getUser } from "../../services/authStorage";
import { getSavedPosts, likePost, reactToPost, repostPost, toggleSave } from "../../services/postsService";
import { optimisticReaction, reactionFromResponse } from "./reactions";
import { blockUser, hidePost, muteUser } from "../../services/moderationService";
import ReportDialog from "../moderation/ReportDialog";
import PostCard from "./components/PostCard";
import { queryKeys } from "../../services/queryKeys";
import { publicAppUrl } from "../../services/publicUrl";
import { flattenPostPages, removePostFromSavedLists, updatePostEverywhere } from "./postLists";
import {
  addPostToCollection,
  createCollection,
  deleteCollection,
  getCollectionPosts,
  getCollections,
  removePostFromCollection,
  updateCollection
} from "../../services/collectionsService";
import { useConfirm } from "../../components/feedback/ConfirmProvider";

export default function SavedPosts() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meId = useMemo(() => String(getUser()?._id || getUser()?.id || ""), []);

  // Guardados como query infinito. Los mutadores escriben en TODAS las
  // listas en caché (feed, perfil, guardados): quitar un guardado aquí
  // también actualiza la pestaña Guardados del perfil.
  const query = useInfiniteQuery({
    queryKey: queryKeys.posts.saved,
    queryFn: async ({ pageParam }) => {
      const data = await getSavedPosts({ page: pageParam, limit: 20 });
      const incoming = Array.isArray(data?.posts) ? data.posts : [];
      return {
        posts: incoming,
        hasMore: typeof data?.hasMore === "boolean" ? data.hasMore : incoming.length === 20,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage?.hasMore ? allPages.length + 1 : undefined,
  });

  const posts = useMemo(() => flattenPostPages(query.data?.pages), [query.data]);
  const hasMore = Boolean(query.hasNextPage);
  const loading = query.isPending;
  const loadingMore = query.isFetchingNextPage;

  const setPosts = useCallback(
    (updater) => {
      queryClient.setQueryData(queryKeys.posts.saved, (cache) => {
        if (!cache?.pages) return cache;
        return {
          ...cache,
          pages: cache.pages.map((pageItem) => ({
            ...pageItem,
            posts:
              typeof updater === "function"
                ? updater(pageItem.posts || [])
                : updater,
          })),
        };
      });
    },
    [queryClient]
  );

  const loadMore = useCallback(async () => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    await query.fetchNextPage();
  }, [query]);

  const [liking, setLiking] = useState("");
  const [saving, setSaving] = useState("");
  const [reposting, setReposting] = useState("");
  const [hiding, setHiding] = useState("");
  const [reportTarget, setReportTarget] = useState(null);
  const [moderationNote, setModerationNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [collections, setCollections] = useState([]);
  const [collectionName, setCollectionName] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [organizingPost, setOrganizingPost] = useState("");
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState("");
  const [activeCollectionPosts, setActiveCollectionPosts] = useState([]);
  const [activeCollectionPage, setActiveCollectionPage] = useState(1);
  const [activeCollectionHasMore, setActiveCollectionHasMore] = useState(false);
  const [activeCollectionLoading, setActiveCollectionLoading] = useState(false);
  const [editingCollectionId, setEditingCollectionId] = useState("");
  const [editingCollectionName, setEditingCollectionName] = useState("");
  const [editingCollectionDescription, setEditingCollectionDescription] = useState("");
  const [collectionSaving, setCollectionSaving] = useState(false);
  const [collectionPostAction, setCollectionPostAction] = useState("");
  const error =
    actionError ||
    (query.error
      ? query.error.response?.data?.error || "No se pudieron cargar los guardados."
      : "");
  const activeCollection = collections.find((collection) => String(collection._id) === String(activeCollectionId));

  useEffect(() => {
    if (typeof getCollections !== "function") return undefined;
    let active = true;
    setCollectionsLoading(true);
    getCollections()
      .then((data) => {
        if (active) setCollections(Array.isArray(data?.collections) ? data.collections : []);
      })
      .catch((requestError) => {
        if (active) setActionError(requestError.response?.data?.error || "No se pudieron cargar las colecciones.");
      })
      .finally(() => {
        if (active) setCollectionsLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!activeCollectionId) {
      setActiveCollectionPosts([]);
      setActiveCollectionPage(1);
      setActiveCollectionHasMore(false);
      return undefined;
    }
    let active = true;
    setActiveCollectionLoading(true);
    setActiveCollectionPage(1);
    getCollectionPosts(activeCollectionId, { page: 1, limit: 20 })
      .then((data) => {
        if (active) {
          setActiveCollectionPosts(Array.isArray(data?.posts) ? data.posts : []);
          setActiveCollectionHasMore(Boolean(data?.hasMore));
        }
      })
      .catch((requestError) => {
        if (active) setActionError(requestError.response?.data?.error || "No se pudo cargar la colección.");
      })
      .finally(() => {
        if (active) setActiveCollectionLoading(false);
      });
    return () => { active = false; };
  }, [activeCollectionId]);

  async function handleCreateCollection(event) {
    event.preventDefault();
    if (!collectionName.trim() || creatingCollection || typeof createCollection !== "function") return;
    setCreatingCollection(true);
    setActionError("");
    try {
      const created = await createCollection(collectionName, collectionDescription);
      if (created) setCollections((current) => [created, ...current]);
      setCollectionName("");
      setCollectionDescription("");
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || requestError.message || "No se pudo crear la colección.");
    } finally {
      setCreatingCollection(false);
    }
  }

  function startEditingCollection(collection) {
    setEditingCollectionId(collection._id);
    setEditingCollectionName(collection.name || "");
    setEditingCollectionDescription(collection.description || "");
    setActionError("");
  }

  function cancelEditingCollection() {
    setEditingCollectionId("");
    setEditingCollectionName("");
    setEditingCollectionDescription("");
  }

  async function handleUpdateCollection(event, collectionId) {
    event.preventDefault();
    if (!editingCollectionName.trim() || collectionSaving) return;
    setCollectionSaving(true);
    setActionError("");
    try {
      const updated = await updateCollection(collectionId, editingCollectionName, editingCollectionDescription);
      if (updated) setCollections((current) => current.map((collection) => String(collection._id) === String(collectionId) ? updated : collection));
      cancelEditingCollection();
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || requestError.message || "No se pudo actualizar la colección.");
    } finally {
      setCollectionSaving(false);
    }
  }

  async function handleDeleteCollection(collection) {
    if (!collection?._id || collectionSaving) return;
    const ok = await confirm({
      title: "Eliminar colección",
      message: `¿Deseas eliminar la colección “${collection.name}”?`,
      confirmText: "Eliminar",
      danger: true
    });
    if (!ok) return;
    setCollectionSaving(true);
    setActionError("");
    try {
      await deleteCollection(collection._id);
      setCollections((current) => current.filter((item) => String(item._id) !== String(collection._id)));
      if (String(activeCollectionId) === String(collection._id)) {
        setActiveCollectionId("");
        setActiveCollectionPosts([]);
        setActiveCollectionPage(1);
        setActiveCollectionHasMore(false);
      }
      if (String(editingCollectionId) === String(collection._id)) cancelEditingCollection();
      setModerationNote("Colección eliminada.");
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudo eliminar la colección.");
    } finally {
      setCollectionSaving(false);
    }
  }

  async function loadMoreCollectionPosts() {
    if (!activeCollectionId || !activeCollectionHasMore || activeCollectionLoading) return;
    setActiveCollectionLoading(true);
    setActionError("");
    const nextPage = activeCollectionPage + 1;
    try {
      const data = await getCollectionPosts(activeCollectionId, { page: nextPage, limit: 20 });
      const incoming = Array.isArray(data?.posts) ? data.posts : [];
      setActiveCollectionPosts((current) => {
        const known = new Set(current.map((post) => String(post._id)));
        return [...current, ...incoming.filter((post) => !known.has(String(post._id)))];
      });
      setActiveCollectionPage(nextPage);
      setActiveCollectionHasMore(Boolean(data?.hasMore));
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudieron cargar más publicaciones.");
    } finally {
      setActiveCollectionLoading(false);
    }
  }

  async function handleRemoveFromCollection(postId) {
    if (!activeCollectionId || !postId || collectionPostAction) return;
    setCollectionPostAction(postId);
    setActionError("");
    try {
      const result = await removePostFromCollection(activeCollectionId, postId);
      setActiveCollectionPosts((current) => current.filter((post) => String(post._id) !== String(postId)));
      if (result?.collection) {
        setCollections((current) => current.map((collection) => String(collection._id) === String(result.collection._id) ? result.collection : collection));
      }
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudo quitar la publicación de la colección.");
    } finally {
      setCollectionPostAction("");
    }
  }

  async function handleOrganize(postId, collectionId) {
    if (!postId || !collectionId || organizingPost || typeof addPostToCollection !== "function") return;
    setOrganizingPost(postId);
    setActionError("");
    try {
      const result = await addPostToCollection(collectionId, postId);
      if (result?.collection) {
        setCollections((current) => current.map((collection) => String(collection._id) === String(result.collection._id) ? result.collection : collection));
        if (String(activeCollectionId) === String(collectionId) && result.added !== false) {
          const addedPost = posts.find((post) => String(post._id) === String(postId));
          if (addedPost) setActiveCollectionPosts((current) => current.some((post) => String(post._id) === String(postId)) ? current : [addedPost, ...current]);
        }
      }
      setModerationNote(result?.added === false ? "La publicación ya estaba en esa colección." : "Publicación añadida a la colección.");
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudo organizar la publicación.");
    } finally {
      setOrganizingPost("");
    }
  }

  async function handleReaction(id, type) {
    if (!id || liking) return;
    const prev = posts.find((p) => String(p._id) === String(id));
    if (!prev) return;
    setLiking(id);
    setActionError("");
    updatePostEverywhere(queryClient, id, (p) => optimisticReaction(p, type));
    try {
      const result = typeof reactToPost === "function"
        ? await reactToPost(id, type)
        : await likePost(id);
      updatePostEverywhere(queryClient, id, (p) => reactionFromResponse(p, result));
    } catch (e) {
      updatePostEverywhere(queryClient, id, () => prev);
      setActionError(e.response?.data?.error || "No se pudo actualizar la reacción.");
    } finally {
      setLiking("");
    }
  }

  async function handleSave(id) {
    if (!id || saving) return;
    setSaving(id);
    setActionError("");
    try {
      const result = await toggleSave(id);
      if (!result.saved) {
        removePostFromSavedLists(queryClient, id);
      } else {
        updatePostEverywhere(queryClient, id, (p) => ({ ...p, saved: true, savedCount: typeof result.savedCount === "number" ? result.savedCount : p.savedCount }));
      }
    } catch (e) {
      setActionError(e.response?.data?.error || "No se pudo quitar de guardados.");
    } finally {
      setSaving("");
    }
  }

  async function handleRepost(id) {
    if (!id || reposting) return;
    const ok = await confirm({
      title: "Republicar",
      message: "¿Republicar esta publicación en tu perfil?",
      confirmText: "Republicar"
    });
    if (!ok) return;
    setReposting(id);
    setActionError("");
    try {
      await repostPost(id);
    } catch (e) {
      if (e.response?.status === 409) setActionError("Ya has republicado esta publicación.");
      else setActionError(e.response?.data?.error || "No se pudo republicar.");
    } finally {
      setReposting("");
    }
  }

  async function handleShare(post) {
    const url = publicAppUrl(`/post/${post._id}`);
    try {
      if (navigator.share) await navigator.share({ title: "Publicación en Kronos", text: post.content || "Publicación en Kronos", url });
      else {
        await navigator.clipboard.writeText(url);
        window.alert("Enlace copiado");
      }
    } catch (e) {
      if (e.name !== "AbortError") setActionError("No se pudo compartir la publicación.");
    }
  }

  async function handleHide(id) {
    if (!id || hiding) return;
    setHiding(id);
    setActionError("");
    setModerationNote("");
    try {
      await hidePost(id);
      setPosts((items) => items.filter((p) => String(p._id) !== String(id)));
      setModerationNote("Publicación oculta para ti.");
    } catch (e) {
      setActionError(e.response?.data?.error || "No se pudo ocultar la publicación.");
    } finally {
      setHiding("");
    }
  }

  async function handleMute(author) {
    if (!author?._id) return;
    setActionError("");
    setModerationNote("");
    try {
      await muteUser(author._id);
      setPosts((items) => items.filter((p) => String(p.author?._id || p.author) !== String(author._id)));
      setModerationNote(`Silenciaste a @${author.username || "usuario"}.`);
    } catch (e) {
      setActionError(e.response?.data?.error || "No se pudo silenciar al usuario.");
    }
  }

  async function handleBlock(author) {
    if (!author?._id) return;
    const ok = await confirm({
      title: `Bloquear a @${author.username || "usuario"}`,
      message: `¿Deseas bloquear a @${author.username || "usuario"}?`,
      confirmText: "Bloquear",
      danger: true
    });
    if (!ok) return;
    setActionError("");
    setModerationNote("");
    try {
      await blockUser(author._id);
      setPosts((items) => items.filter((p) => String(p.author?._id || p.author) !== String(author._id)));
      setModerationNote(`Bloqueaste a @${author.username || "usuario"}.`);
    } catch (e) {
      setActionError(e.response?.data?.error || "No se pudo bloquear al usuario.");
    }
  }

  if (loading) {
    return (
      <section className="page">
        <div className="k-surface k-feed-state"><span className="k-skeleton" /><span className="k-skeleton k-skeleton-wide" /></div>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="k-page-header">
        <div>
          <h1>Guardados</h1>
          <p>Publicaciones que marcaste para después.</p>
        </div>
        <Link className="k-button k-button-ghost" to="/home">Volver al feed</Link>
      </header>
      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {moderationNote && <p className="k-state k-state-success" role="status">{moderationNote}</p>}
      <ReportDialog
        open={Boolean(reportTarget)}
        targetType="post"
        targetId={reportTarget?._id}
        targetLabel={reportTarget?.author?.username ? `la publicación de @${reportTarget.author.username}` : ""}
        onClose={() => setReportTarget(null)}
      />
      <section className="k-collections-panel" aria-labelledby="saved-collections-title">
        <div className="k-section-heading">
          <div>
            <p className="k-eyebrow">ORGANIZAR</p>
            <h2 id="saved-collections-title">Colecciones privadas</h2>
          </div>
          <span className="k-muted">{collectionsLoading ? "Cargando..." : `${collections.length} colecciones`}</span>
        </div>
        <form className="k-collection-create-form" onSubmit={handleCreateCollection}>
          <input value={collectionName} onChange={(event) => setCollectionName(event.target.value)} maxLength={80} placeholder="Nombre de colección" aria-label="Nombre de colección" />
          <input value={collectionDescription} onChange={(event) => setCollectionDescription(event.target.value)} maxLength={300} placeholder="Descripción opcional" aria-label="Descripción de colección" />
          <button type="submit" className="k-button k-button-secondary" disabled={!collectionName.trim() || creatingCollection}>
            {creatingCollection ? "Creando..." : "Crear colección"}
          </button>
        </form>
        {collections.length > 0 && (
          <div className="k-collection-manager" aria-label="Administrar colecciones">
            {collections.map((collection) => editingCollectionId === collection._id ? (
              <form className="k-collection-edit-form" key={collection._id} onSubmit={(event) => handleUpdateCollection(event, collection._id)}>
                <input value={editingCollectionName} onChange={(event) => setEditingCollectionName(event.target.value)} maxLength={80} aria-label="Editar nombre de colección" />
                <input value={editingCollectionDescription} onChange={(event) => setEditingCollectionDescription(event.target.value)} maxLength={300} aria-label="Editar descripción de colección" />
                <button type="submit" className="k-button k-button-secondary" disabled={!editingCollectionName.trim() || collectionSaving}>{collectionSaving ? "Guardando..." : "Guardar"}</button>
                <button type="button" className="k-button k-button-ghost" onClick={cancelEditingCollection}>Cancelar</button>
              </form>
            ) : (
              <div className={`k-collection-row${String(activeCollectionId) === String(collection._id) ? " is-active" : ""}`} key={collection._id}>
                <button type="button" className="k-collection-select" onClick={() => setActiveCollectionId(String(collection._id))}>
                  <strong>{collection.name}</strong><span>{collection.postsCount || 0} publicaciones</span>
                </button>
                <button type="button" className="k-button k-button-ghost" onClick={() => startEditingCollection(collection)}>Editar</button>
                <button type="button" className="k-button k-button-ghost k-collection-delete" onClick={() => handleDeleteCollection(collection)} disabled={collectionSaving}>Eliminar</button>
              </div>
            ))}
          </div>
        )}
        {activeCollection && (
          <div className="k-collection-content">
            <div className="k-section-heading">
              <div><h3>{activeCollection.name}</h3><p className="k-muted">{activeCollection.description || "Sin descripción"}</p></div>
              <button type="button" className="k-button k-button-ghost" onClick={() => setActiveCollectionId("")}>Cerrar</button>
            </div>
            {activeCollectionLoading ? <p className="k-muted">Cargando publicaciones...</p> : activeCollectionPosts.length === 0 ? (
              <p className="k-muted">Esta colección aún no tiene publicaciones visibles.</p>
            ) : (
              <div className="k-collection-posts">
                {activeCollectionPosts.map((post) => (
                  <article className="k-collection-post" key={post._id}>
                    <div>
                      <Link to={`/post/${post._id}`}><strong>{post.author?.displayName || post.author?.username || "Usuario"}</strong></Link>
                      <p>{post.content || "Publicación con multimedia"}</p>
                    </div>
                    <button type="button" className="k-button k-button-ghost" onClick={() => handleRemoveFromCollection(post._id)} disabled={collectionPostAction === post._id}>
                      {collectionPostAction === post._id ? "Quitando..." : "Quitar"}
                    </button>
                  </article>
                ))}
              </div>
            )}
            {activeCollectionHasMore && (
              <button type="button" className="k-button k-button-secondary k-collection-load-more" onClick={loadMoreCollectionPosts} disabled={activeCollectionLoading}>
                {activeCollectionLoading ? "Cargando..." : "Cargar más de la colección"}
              </button>
            )}
          </div>
        )}
      </section>
      {posts.length === 0 ? (
        <div className="k-empty-state">
          <h2>Nada guardado aún</h2>
          <p>Usa el botón Guardar en el feed para ver tus favoritos aquí.</p>
          <Link className="k-button k-button-primary" to="/home">Ir al feed</Link>
        </div>
      ) : (
        <>
          <div className="k-feed-list">
            {posts.map((post) => {
              const authorId = String(post.author?._id || post.author || "");
              const isOwn = Boolean(authorId && meId && authorId === meId);
              return (
                <PostCard
                  key={post._id}
                  post={post}
                  currentUserId={meId}
                  isOwn={isOwn}
                  liking={liking}
                  saving={saving}
                  reposting={reposting}
                  hiding={hiding}
                  onReact={handleReaction}
                  onSave={handleSave}
                  onRepost={handleRepost}
                  onShare={handleShare}
                  toggleOpen={(postId) => navigate(`/post/${postId}`)}
                  onHide={handleHide}
                  onReport={(item) => setReportTarget(item)}
                  onMute={isOwn ? undefined : handleMute}
                  onBlock={isOwn ? undefined : handleBlock}
                  collectionAction={collections.length > 0 ? (
                    <div className="k-post-collection-control">
                      <label htmlFor={`collection-${post._id}`}>Añadir a colección</label>
                      <select
                        id={`collection-${post._id}`}
                        value=""
                        disabled={organizingPost === post._id}
                        onChange={(event) => handleOrganize(post._id, event.target.value)}
                      >
                        <option value="">Selecciona una colección</option>
                        {collections.map((collection) => <option key={collection._id} value={collection._id}>{collection.name}</option>)}
                      </select>
                    </div>
                  ) : null}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
            {hasMore ? (
              <button type="button" className="k-button k-button-secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Cargando..." : "Cargar más"}
              </button>
            ) : (
              <p className="k-muted" style={{ fontSize: "0.9rem" }}>No hay más guardados.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

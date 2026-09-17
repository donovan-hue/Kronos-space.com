import { mediaUrl } from "../../services/mediaUrl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getUser, updateUser } from "../../services/authStorage";
import { getMe, getUserById, toggleFollow as toggleFollowService, updateProfile, uploadAvatar } from "../../services/usersService";
import { getUserPosts, likePost as likePostService, deletePost, updatePost, toggleSave, repostPost } from "../../services/postsService";

function formatDate(date) {
  if (!date) return "";
  try {
    return new Date(date).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

export default function Profile() {
  const { id } = useParams();
  const isOwnProfile = !id;

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [postsCount, setPostsCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [following, setFollowing] = useState(false);
  const [likingPostId, setLikingPostId] = useState(null);
  const [savingPost, setSavingPost] = useState("");
  const [editingPostId, setEditingPostId] = useState("");
  const [editValue, setEditValue] = useState("");
  const [savingPostEdit, setSavingPostEdit] = useState("");

  const [error, setError] = useState("");
  const [postsError, setPostsError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({ displayName: "", bio: "", avatar: "" });
  const avatarInputRef = useRef(null);

  const meId = useMemo(() => String(getUser()?._id || getUser()?.id || ""), []);

  useEffect(() => {
    loadProfile();
  }, [id]);

  async function loadProfile() {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const user = isOwnProfile ? await getMe() : await getUserById(id);
      setProfile(user);
      setForm({ displayName: user.displayName || "", bio: user.bio || "", avatar: mediaUrl(user.avatar) });
      updateFollowingState(user);
      setPage(1);
      setHasMore(true);
      await loadUserPosts(user._id, { page: 1, reset: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo cargar el perfil.");
    } finally {
      setLoading(false);
    }
  }

  function updateFollowingState(user) {
    if (!user || isOwnProfile) {
      setFollowing(false);
      return;
    }
    if (typeof user.isFollowing === "boolean") {
      setFollowing(user.isFollowing);
      return;
    }
    const currentUserId = meId;
    if (!currentUserId) {
      setFollowing(false);
      return;
    }
    const followers = Array.isArray(user.followers) ? user.followers : [];
    setFollowing(followers.some((followerId) => String(followerId?._id || followerId) === String(currentUserId)));
  }

  async function loadUserPosts(userId, { page: targetPage = 1, reset = false } = {}) {
    if (!userId) return;
    if (reset) setPostsLoading(true);
    else setPostsLoadingMore(true);
    setPostsError("");
    try {
      const data = await getUserPosts(userId, { page: targetPage, limit: 20 });
      const incoming = Array.isArray(data?.posts) ? data.posts : [];
      const total = Number.isInteger(data?.totalPosts) ? data.totalPosts : typeof data?.total === "number" ? data.total : incoming.length;
      const incomingHasMore = typeof data?.hasMore === "boolean" ? data.hasMore : incoming.length === 20;
      setPostsCount(total);
      setHasMore(incomingHasMore);
      setPage(targetPage);
      if (reset) {
        const map = new Map();
        for (const p of incoming) map.set(String(p._id), p);
        setPosts(Array.from(map.values()));
      } else {
        setPosts((current) => {
          const existing = new Set(current.map((p) => String(p._id)));
          const deduped = incoming.filter((p) => !existing.has(String(p._id)));
          return [...current, ...deduped];
        });
      }
    } catch (requestError) {
      setPostsError(requestError.response?.data?.error || "No se pudieron cargar las publicaciones.");
    } finally {
      setPostsLoading(false);
      setPostsLoadingMore(false);
    }
  }

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setSuccess("");
    setError("");
  }

  async function handleAvatarFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setError("");
    setSuccess("");
    try {
      const updated = await uploadAvatar(file);
      setProfile(updated);
      setForm((c) => ({ ...c, avatar: mediaUrl(updated.avatar) }));
      updateUser({ ...getUser(), ...updated });
      setSuccess("Avatar actualizado correctamente.");
    } catch (e) {
      setError(e.response?.data?.error || e.message || "No se pudo subir el avatar.");
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (saving || !isOwnProfile) return;
    if (form.displayName.trim().length > 100) {
      setError("El nombre visible no puede superar 100 caracteres");
      return;
    }
    if (form.bio.trim().length > 500) {
      setError("La biografía no puede superar 500 caracteres");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updatedUser = await updateProfile({
        displayName: form.displayName.trim(),
        bio: form.bio.trim(),
        avatar: form.avatar.trim()
      });
      setProfile(updatedUser);
      setForm({ displayName: updatedUser.displayName || "", bio: updatedUser.bio || "", avatar: mediaUrl(updatedUser.avatar) });
      updateUser({ ...getUser(), ...updatedUser });
      setSuccess("Perfil actualizado correctamente.");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo actualizar el perfil.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleFollow() {
    if (!profile?._id || isOwnProfile) return;
    setError("");
    setSuccess("");
    try {
      const data = await toggleFollowService(profile._id);
      const newFollowing = Boolean(data.following);
      setFollowing(newFollowing);
      setProfile((current) => {
        if (!current) return current;
        const followersCount = Number.isInteger(current.followersCount) ? current.followersCount : Array.isArray(current.followers) ? current.followers.length : 0;
        return { ...current, isFollowing: newFollowing, followersCount: Math.max(0, followersCount + (newFollowing ? 1 : -1)) };
      });
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo actualizar el seguimiento.");
    }
  }

  async function handleLike(postId) {
    if (!postId || likingPostId) return;
    const prev = posts.find((p) => String(p._id) === String(postId));
    const prevLiked = prev?.liked;
    const prevCount = typeof prev?.likesCount === "number" ? prev.likesCount : Array.isArray(prev?.likes) ? prev.likes.length : 0;
    setLikingPostId(postId);
    setError("");
    setPosts((items) => items.map((p) => (String(p._id) === String(postId) ? { ...p, liked: !prevLiked, likesCount: prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1 } : p)));
    try {
      const result = await likePostService(postId);
      setPosts((currentPosts) => currentPosts.map((post) => (String(post._id) === String(postId) ? { ...post, likesCount: typeof result?.likesCount === "number" ? result.likesCount : post.likesCount || 0, liked: Boolean(result?.liked) } : post)));
    } catch (requestError) {
      setPosts((items) => items.map((p) => (String(p._id) === String(postId) ? { ...p, liked: prevLiked, likesCount: prevCount } : p)));
      setError(requestError.response?.data?.error || "No se pudo actualizar el like.");
    } finally {
      setLikingPostId(null);
    }
  }

  async function handleSave(postId) {
    const prev = posts.find((p) => String(p._id) === String(postId));
    const prevSaved = prev?.saved;
    const prevCount = prev?.savedCount || 0;
    setSavingPost(postId);
    setPosts((items) => items.map((p) => (String(p._id) === String(postId) ? { ...p, saved: !prevSaved, savedCount: prevSaved ? Math.max(0, prevCount - 1) : prevCount + 1 } : p)));
    try {
      const result = await toggleSave(postId);
      setPosts((items) => items.map((p) => (String(p._id) === String(postId) ? { ...p, saved: Boolean(result.saved), savedCount: typeof result.savedCount === "number" ? result.savedCount : p.savedCount } : p)));
    } catch (e) {
      setPosts((items) => items.map((p) => (String(p._id) === String(postId) ? { ...p, saved: prevSaved, savedCount: prevCount } : p)));
      setError(e.response?.data?.error || "No se pudo guardar.");
    } finally {
      setSavingPost("");
    }
  }

  async function handleRepost(postId) {
    if (!window.confirm("¿Republicar?")) return;
    try {
      const newPost = await repostPost(postId);
      if (newPost) {
        setPosts((items) => [newPost, ...items]);
        setPostsCount((c) => c + 1);
      }
    } catch (e) {
      if (e.response?.status === 409) setError("Ya has republicado esta publicación.");
      else setError(e.response?.data?.error || "No se pudo republicar.");
    }
  }

  async function handleEditPost(postId) {
    const value = editValue.trim();
    if (!value) {
      setError("La publicación está vacía");
      return;
    }
    if (value.length > 5000) {
      setError("La publicación no puede superar 5000 caracteres");
      return;
    }
    setSavingPostEdit(postId);
    try {
      const updated = await updatePost(postId, value);
      setPosts((items) => items.map((p) => (String(p._id) === String(postId) ? updated : p)));
      setEditingPostId("");
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 403) setError("No tienes permisos para editar esta publicación.");
      else if (status === 404) setError("Publicación no encontrada.");
      else setError(requestError.response?.data?.error || "No se pudo editar la publicación.");
    } finally {
      setSavingPostEdit("");
    }
  }

  async function handleDeletePost(postId) {
    if (!postId) return;
    if (!window.confirm("¿Eliminar esta publicación?")) return;
    try {
      await deletePost(postId);
      setPosts((items) => items.filter((p) => String(p._id) !== String(postId)));
      setPostsCount((c) => Math.max(0, c - 1));
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 403) setError("No tienes permisos para eliminar esta publicación.");
      else if (status === 404) setError("Publicación no encontrada.");
      else setError(requestError.response?.data?.error || "No se pudo eliminar la publicación.");
    }
  }

  if (loading) {
    return (
      <section className="page">
        <div className="k-surface k-feed-state">
          <span className="k-skeleton" />
          <span className="k-skeleton k-skeleton-wide" />
        </div>
      </section>
    );
  }

  if (error && !profile) {
    return (
      <section className="page">
        <h2>Perfil</h2>
        <p role="alert" className="k-state k-state-error">{error}</p>
        <button className="k-button k-button-secondary" type="button" onClick={loadProfile}>
          Reintentar
        </button>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="page">
        <h2>Perfil</h2>
        <p>No se encontró el perfil.</p>
      </section>
    );
  }

  const followersCount = Number.isInteger(profile.followersCount) ? profile.followersCount : Array.isArray(profile.followers) ? profile.followers.length : 0;
  const followingCount = Number.isInteger(profile.followingCount) ? profile.followingCount : Array.isArray(profile.following) ? profile.following.length : 0;

  return (
    <section className="page profile-page" style={{ display: "grid", gap: 24 }}>
      <header className="profile-header k-surface" style={{ display: "flex", gap: 20, padding: 20, borderRadius: "var(--k-radius-lg)" }}>
        <div className="profile-avatar" style={{ width: 84, height: 84, borderRadius: "50%", overflow: "hidden", background: "var(--k-surface-3)", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
          {profile.avatar ? (
            <img src={mediaUrl(profile.avatar)} alt={profile.displayName || profile.username || "Avatar"} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: "2rem" }}>{(profile.displayName || profile.username || "U").charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="profile-info" style={{ flex: 1 }}>
          <h2 style={{ margin: 0 }}>{profile.displayName || profile.username || "Usuario"}</h2>
          {profile.username && <p className="k-muted">@{profile.username}</p>}
          {profile.bio && <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{profile.bio}</p>}
          <div className="profile-stats" style={{ display: "flex", gap: 16, marginTop: 12 }}>
            <span><strong>{postsCount}</strong> publicaciones</span>
            <span><strong>{followersCount}</strong> seguidores</span>
            <span><strong>{followingCount}</strong> siguiendo</span>
          </div>
          {!isOwnProfile && (
            <div className="profile-actions" style={{ display: "flex", gap: 12, marginTop: 14 }}>
              <button className={`k-button ${following ? "k-button-secondary" : "k-button-primary"}`} type="button" onClick={handleToggleFollow} aria-pressed={following}>
                {following ? "Dejar de seguir" : "Seguir"}
              </button>
              <Link className="k-button k-button-secondary" to={`/messages/${profile._id}`}>
                Mensaje
              </Link>
            </div>
          )}
        </div>
      </header>

      {error && <p role="alert" className="k-state k-state-error">{error}</p>}
      {success && <p role="status" className="k-state k-state-success">{success}</p>}

      {isOwnProfile && (
        <section className="profile-edit k-surface" style={{ padding: 20, borderRadius: "var(--k-radius-lg)" }}>
          <h3 style={{ marginTop: 0 }}>Editar perfil</h3>
          <form onSubmit={saveProfile} style={{ display: "grid", gap: 12 }}>
            <label htmlFor="profile-displayName">Nombre</label>
            <input id="profile-displayName" name="displayName" type="text" value={form.displayName} onChange={handleFormChange} maxLength={100} placeholder="Tu nombre" disabled={saving || avatarUploading} style={{ padding: 10, border: "1px solid var(--k-border)", borderRadius: 10, background: "var(--k-bg)", color: "var(--k-text)" }} />
            <label htmlFor="profile-bio">Biografía</label>
            <textarea id="profile-bio" name="bio" value={form.bio} onChange={handleFormChange} maxLength={500} placeholder="Cuéntanos sobre ti" disabled={saving || avatarUploading} style={{ minHeight: 80, padding: 10, border: "1px solid var(--k-border)", borderRadius: 10, background: "var(--k-bg)", color: "var(--k-text)", resize: "vertical" }} />
            <label htmlFor="profile-avatar">Avatar (URL)</label>
            <input id="profile-avatar" name="avatar" type="url" value={form.avatar} onChange={handleFormChange} maxLength={2000} placeholder="https://..." disabled={saving || avatarUploading} style={{ padding: 10, border: "1px solid var(--k-border)", borderRadius: 10, background: "var(--k-bg)", color: "var(--k-text)" }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarFile} disabled={saving || avatarUploading} style={{ display: "none" }} />
              <button type="button" className="k-button k-button-secondary" onClick={() => avatarInputRef.current?.click()} disabled={saving || avatarUploading}>
                {avatarUploading ? "Subiendo..." : "Subir imagen"}
              </button>
              <span className="k-muted" style={{ fontSize: "0.85rem" }}>JPG/PNG/WebP, máx 10 MB</span>
            </div>
            <button className="k-button k-button-primary" type="submit" disabled={saving || avatarUploading} aria-busy={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </form>
        </section>
      )}

      <section className="profile-posts">
        <div className="profile-posts-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Publicaciones</h3>
          <Link className="k-button k-button-ghost" to="/home">Ir al inicio</Link>
        </div>

        {postsError && <p role="alert" className="k-state k-state-error">{postsError}</p>}

        {postsLoading ? (
          <div className="k-surface k-feed-state">
            <span className="k-skeleton" />
            <span className="k-skeleton k-skeleton-wide" />
          </div>
        ) : posts.length === 0 ? (
          <div className="k-surface k-empty-state">
            <p className="k-muted">Este usuario todavía no tiene publicaciones.</p>
          </div>
        ) : (
          <div className="posts-list" style={{ display: "grid", gap: 16 }}>
            {posts.map((post) => {
              const comments = Array.isArray(post.comments) ? post.comments : [];
              const likesCount = typeof post.likesCount === "number" ? post.likesCount : Array.isArray(post.likes) ? post.likes.length : 0;
              const authorId = String(post.author?._id || post.author || profile._id || "");
              const isOwnPost = Boolean(authorId && meId && authorId === meId);
              const isEditing = editingPostId === post._id;
              return (
                <article className="k-post" key={post._id}>
                  <header className="k-post-header">
                    <div style={{ flex: 1 }}>
                      <strong>{post.author?.displayName || post.author?.username || profile.displayName || profile.username || "Usuario"}</strong>
                      {post.author?.username && <span className="k-muted" style={{ marginLeft: 6 }}>@{post.author.username}</span>}
                    </div>
                    <small className="k-muted">{formatDate(post.createdAt)}</small>
                    {isOwnPost && (
                      <div style={{ display: "flex", gap: 8, marginLeft: 12 }}>
                        <button type="button" className="k-button k-button-ghost" onClick={() => { if (isEditing) setEditingPostId(""); else { setEditingPostId(post._id); setEditValue(post.content); } }}>
                          {isEditing ? "Cancelar" : "Editar"}
                        </button>
                        <button type="button" className="k-button k-button-ghost" onClick={() => handleDeletePost(post._id)}>
                          Eliminar
                        </button>
                      </div>
                    )}
                  </header>

                  {post.repostOf && (
                    <div style={{ margin: "0 20px 8px", padding: 10, border: "1px solid var(--k-border)", borderRadius: 10, background: "var(--k-bg)" }}>
                      <p className="k-muted" style={{ margin: 0, fontSize: "0.8rem" }}>Republicado de @{post.repostOf.author?.username || "usuario"}</p>
                      <p style={{ margin: "4px 0 0" }}>{post.repostOf.content}</p>
                    </div>
                  )}

                  {isEditing ? (
                    <div className="k-comments" style={{ borderTop: 0, background: "var(--k-surface)" }}>
                      <textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} maxLength={5000} style={{ minHeight: 80, padding: 10, border: "1px solid var(--k-border)", borderRadius: 10, background: "var(--k-bg)", color: "var(--k-text)", resize: "vertical" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                        <span className="k-muted" style={{ fontSize: "0.85rem" }}>{editValue.length}/5000</span>
                        <button type="button" className="k-button k-button-primary" onClick={() => handleEditPost(post._id)} disabled={savingPostEdit === post._id || !editValue.trim()}>
                          {savingPostEdit === post._id ? "Guardando..." : "Guardar"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Link className="k-post-content" to={`/post/${post._id}`}>
                        <p style={{ whiteSpace: "pre-wrap" }}>{post.content}</p>
                      </Link>
                      {post.media?.url && (
                        <div style={{ margin: "0 20px 12px", overflow: "hidden", borderRadius: 10, border: "1px solid var(--k-border)" }}>
                          <img src={mediaUrl(post.media.url)} alt={post.media.alt || post.content.slice(0, 80)} loading="lazy" style={{ width: "100%", maxHeight: 420, objectFit: "cover", display: "block" }} />
                        </div>
                      )}
                    </>
                  )}

                  <div className="k-post-actions" style={{ flexWrap: "wrap" }}>
                    <button type="button" className={post.liked ? "is-liked" : ""} onClick={() => handleLike(post._id)} disabled={likingPostId === post._id}>
                      {post.liked ? "Ya no me gusta" : "Me gusta"} {likesCount}
                    </button>
                    <Link to={`/post/${post._id}`}>Comentarios {comments.length}</Link>
                    <button type="button" className={post.saved ? "is-liked" : ""} onClick={() => handleSave(post._id)} disabled={savingPost === post._id}>
                      {post.saved ? "Guardado" : "Guardar"} {post.savedCount ? `· ${post.savedCount}` : ""}
                    </button>
                    <button type="button" onClick={() => handleRepost(post._id)}>Repost</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {posts.length > 0 && hasMore && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
            <button type="button" className="k-button k-button-secondary" onClick={() => loadUserPosts(profile._id, { page: page + 1, reset: false })} disabled={postsLoadingMore}>
              {postsLoadingMore ? "Cargando..." : "Cargar más"}
            </button>
          </div>
        )}
        {posts.length > 0 && !hasMore && <p className="k-muted" style={{ textAlign: "center", marginTop: 16, fontSize: "0.9rem" }}>Has visto todas las publicaciones.</p>}
      </section>
    </section>
  );
}

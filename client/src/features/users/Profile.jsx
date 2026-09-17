import { mediaUrl } from "../../services/mediaUrl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getUser, updateUser } from "../../services/authStorage";
import { getMe, getUserById, toggleFollow as toggleFollowService, updateProfile, uploadAvatar, uploadCover } from "../../services/usersService";
import { blockUser, muteUser, unblockUser, unmuteUser } from "../../services/moderationService";
import ReportDialog from "../moderation/ReportDialog";
import { likePost as likePostService, deletePost, updatePost, toggleSave, repostPost } from "../../services/postsService";

import useProfileActivity from "./hooks/useProfileActivity";
import ProfileTabs, { PROFILE_TABS } from "./ProfileTabs";

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
  return <ProfileContent key={id || "me"} id={id} />;
}

function ProfileContent({ id }) {
  const meId = useMemo(() => String(getUser()?._id || getUser()?.id || ""), []);
  const isOwnProfile = !id || String(id) === meId;
  const [activeTab, setActiveTab] = useState("posts");
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const currentTab = PROFILE_TABS.find(tab => tab.id === activeTab);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [following, setFollowing] = useState(false);
  const [likingPostId, setLikingPostId] = useState(null);
  const [savingPost, setSavingPost] = useState("");
  const [editingPostId, setEditingPostId] = useState("");
  const [editValue, setEditValue] = useState("");
  const [savingPostEdit, setSavingPostEdit] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({ displayName: "", bio: "", avatar: "", cover: "" });
  const avatarInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [mutedByMe, setMutedByMe] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const { posts, setPosts, postsCount, setPostsCount, postsLoading, postsLoadingMore,
    postsError, hasMore, refresh, loadMore } = useProfileActivity(profile?._id, activeTab, isOwnProfile);


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
      setForm({
        displayName: user.displayName || "",
        bio: user.bio || "",
        avatar: mediaUrl(user.avatar),
        cover: mediaUrl(user.cover)
      });
      setBlockedByMe(Boolean(user.blockedByMe));
      setMutedByMe(Boolean(user.mutedByMe));
      updateFollowingState(user);

    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo cargar el perfil.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCoverFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    setError("");
    setSuccess("");
    try {
      const updated = await uploadCover(file);
      setProfile(current => ({ ...current, cover: updated.cover }));
      setForm(current => ({ ...current, cover: mediaUrl(updated.cover) }));
      setSuccess("Portada actualizada.");
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "No se pudo subir la portada.");
    } finally {
      setCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  async function toggleBlock() {
    if (!profile?._id || moderationBusy) return;
    setModerationBusy(true);
    setError("");
    setSuccess("");
    try {
      if (blockedByMe) {
        await unblockUser(profile._id);
        setBlockedByMe(false);
        setSuccess("Usuario desbloqueado. Vuelve a cargar el contenido para verlo de nuevo.");
        refresh();
      } else {
        await blockUser(profile._id);
        setBlockedByMe(true);
        setFollowing(false);
        setSuccess("Usuario bloqueado. Ya no interactúa contigo ni tú con él.");
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo actualizar el bloqueo.");
    } finally {
      setModerationBusy(false);
    }
  }

  async function toggleMute() {
    if (!profile?._id || moderationBusy) return;
    setModerationBusy(true);
    setError("");
    setSuccess("");
    try {
      if (mutedByMe) {
        await unmuteUser(profile._id);
        setMutedByMe(false);
        setSuccess("Dejaste de silenciar a este usuario.");
      } else {
        await muteUser(profile._id);
        setMutedByMe(true);
        setSuccess("Usuario silenciado: su contenido no aparece en tu feed.");
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo actualizar el silencio.");
    } finally {
      setModerationBusy(false);
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
      setForm({
        displayName: updatedUser.displayName || "",
        bio: updatedUser.bio || "",
        avatar: mediaUrl(updatedUser.avatar),
        cover: mediaUrl(updatedUser.cover)
      });
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
        return { ...current, isFollowing: newFollowing, followersCount: current.followersCount === null ? null : Math.max(0, followersCount + (newFollowing ? 1 : -1)) };
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
      if (activeTabRef.current === "saved" && !result.saved) {
        setPosts(items => items.filter(post => String(post._id) !== String(postId)));
        setPostsCount(count => Math.max(0, count - 1));
      } else {
        setPosts((items) => items.map((p) => (String(p._id) === String(postId) ? { ...p, saved: Boolean(result.saved), savedCount: typeof result.savedCount === "number" ? result.savedCount : p.savedCount } : p)));
      }
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
        setSuccess("Republicación creada en tu perfil.");
        if (isOwnProfile && activeTabRef.current === activeTab && (activeTab === "reposts" || activeTab === "media")) refresh();
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
      <div className="k-cover" aria-hidden={profile.cover ? undefined : true}>
        {profile.cover ? (
          <img src={mediaUrl(profile.cover)} alt={`Portada de ${profile.displayName || profile.username || "usuario"}`} loading="lazy" />
        ) : (
          <span className="k-cover-empty">{isOwnProfile ? "Añade una portada a tu perfil" : ""}</span>
        )}
      </div>
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
            <span><strong>{postsCount}</strong> en {currentTab.label.toLowerCase()}</span>
            {profile.followersCount !== null && <span><strong>{followersCount}</strong> seguidores</span>}
            {profile.followingCount !== null && <span><strong>{followingCount}</strong> siguiendo</span>}
          </div>
          {!isOwnProfile && (
            <div className="profile-actions" style={{ display: "flex", gap: 12, marginTop: 14 }}>
              <button className={`k-button ${following ? "k-button-secondary" : "k-button-primary"}`} type="button" onClick={handleToggleFollow} aria-pressed={following}>
                {following ? "Dejar de seguir" : "Seguir"}
              </button>
              <Link className="k-button k-button-secondary" to={`/messages/${profile._id}`}>
                Mensaje
              </Link>
              <button
                className="k-button k-button-ghost"
                type="button"
                onClick={toggleMute}
                disabled={moderationBusy}
                aria-pressed={mutedByMe}
              >
                {mutedByMe ? "Quitar silencio" : "Silenciar"}
              </button>
              <button
                className="k-button k-button-danger"
                type="button"
                onClick={toggleBlock}
                disabled={moderationBusy}
                aria-pressed={blockedByMe}
              >
                {blockedByMe ? "Desbloquear" : "Bloquear"}
              </button>
              <button className="k-button k-button-ghost" type="button" onClick={() => setReportOpen(true)}>
                Reportar
              </button>
            </div>
          )}
        </div>
      </header>

      {error && <p role="alert" className="k-state k-state-error">{error}</p>}
      {success && <p role="status" className="k-state k-state-success">{success}</p>}
      {blockedByMe && (
        <p className="k-state k-state-warning" role="status">
          Tienes bloqueado a este usuario: no pueden seguirse, escribir ni ver el contenido del otro en los feeds.
        </p>
      )}

      <ReportDialog
        open={reportOpen}
        targetType="user"
        targetId={profile._id}
        targetLabel={profile.username ? `@${profile.username}` : ""}
        onClose={() => setReportOpen(false)}
      />

      {isOwnProfile && (
        <section className="profile-edit k-surface" style={{ padding: 20, borderRadius: "var(--k-radius-lg)" }}>
          <h3 style={{ marginTop: 0 }}>Editar perfil</h3>
          <p><Link to="/settings/profile">Configurar privacidad del perfil</Link></p>
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
            </div>
            <div className="k-button-group">
              <label className="k-muted" htmlFor="profile-cover">Portada</label>
              <input ref={coverInputRef} id="profile-cover" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCoverFile} disabled={saving || coverUploading} style={{ display: "none" }} />
              <button type="button" className="k-button k-button-secondary" onClick={() => coverInputRef.current?.click()} disabled={saving || coverUploading}>
                {coverUploading ? "Subiendo portada..." : "Subir portada"}
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
        <ProfileTabs value={activeTab} isOwnProfile={isOwnProfile} onChange={tab => { setActiveTab(tab); setEditingPostId(""); }} />
        <div id="profile-activity-panel" role="tabpanel" aria-labelledby={`profile-tab-${activeTab}`} aria-busy={postsLoading || postsLoadingMore} tabIndex={0}>
        {activeTab === "saved" && <p className="k-muted">Solo tú puedes ver esta lista de guardados.</p>}
        <div className="profile-posts-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{currentTab.label}</h3>
          <Link className="k-button k-button-ghost" to="/home">Ir al inicio</Link>
        </div>

        {postsError && <div><p role="alert" className="k-state k-state-error">{postsError}</p><button type="button" className="k-button k-button-secondary" onClick={refresh}>Reintentar</button></div>}

        {postsLoading ? (
          <div className="k-surface k-feed-state">
            <span className="k-skeleton" />
            <span className="k-skeleton k-skeleton-wide" />
          </div>
        ) : postsError && posts.length === 0 ? null : posts.length === 0 ? (
          <div className="k-surface k-empty-state">
            <p className="k-muted">{currentTab.empty}</p>
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
            <button type="button" className="k-button k-button-secondary" onClick={loadMore} disabled={postsLoadingMore}>
              {postsLoadingMore ? "Cargando..." : "Cargar más"}
            </button>
          </div>
        )}
        {posts.length > 0 && !hasMore && <p className="k-muted" style={{ textAlign: "center", marginTop: 16, fontSize: "0.9rem" }}>Has visto todo en esta pestaña.</p>}
        </div>
      </section>
    </section>
  );
}

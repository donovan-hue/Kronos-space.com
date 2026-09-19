import { mediaUrl } from "../../services/mediaUrl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getUser, updateUser } from "../../services/authStorage";
import { getMe, getUserById, getUserByUsername, toggleFollow as toggleFollowService, updateProfile, uploadAvatar, uploadCover } from "../../services/usersService";
import { blockUser, hidePost, muteUser, unblockUser, unmuteUser } from "../../services/moderationService";
import ReportDialog from "../moderation/ReportDialog";
import { likePost as likePostService, deletePost, updatePost, toggleSave, repostPost } from "../../services/postsService";

import { queryKeys } from "../../services/queryKeys";
import useProfileActivity from "./hooks/useProfileActivity";
import ProfileTabs, { PROFILE_TABS } from "./ProfileTabs";
import { rememberProfile } from "../../services/fanContext";
import PostCard from "../social/components/PostCard";
import ImageEditor from "../../components/media/ImageEditor";
import ProfileFollowDialog from "./ProfileFollowDialog";

function formatDate(date) {
  if (!date) return "";
  try {
    return new Date(date).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

export default function Profile() {
  const { id, username } = useParams();
  return <ProfileContent key={username ? `u-${username}` : id || "me"} id={id} username={username} />;
}

function ProfileContent({ id, username }) {
  const navigate = useNavigate();
  const me = getUser();
  const meId = useMemo(() => String(me?._id || me?.id || ""), [me]);
  const meUsername = useMemo(() => String(me?.username || "").toLowerCase(), [me]);
  const isOwnProfile = (!id && !username) ||
    (id && String(id) === meId) ||
    (username && username.toLowerCase() === meUsername);
  const [activeTab, setActiveTab] = useState("posts");
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const currentTab = PROFILE_TABS.find(tab => tab.id === activeTab);

  const queryClient = useQueryClient();

  // ------- Perfil como estado de servidor (TanStack Query) -------
  // La clave distingue propio / por username / por id. following,
  // blockedByMe y mutedByMe derivan del dato en caché; las acciones
  // (seguir, bloquear, silenciar) escriben el caché — una sola fuente.
  const profileKey = useMemo(
    () =>
      queryKeys.profile(
        isOwnProfile
          ? { kind: "me" }
          : username
            ? { kind: "username", value: username }
            : { kind: "id", value: id }
      ),
    [isOwnProfile, username, id]
  );

  const profileQuery = useQuery({
    queryKey: profileKey,
    queryFn: () =>
      isOwnProfile
        ? getMe()
        : username
          ? getUserByUsername(username)
          : getUserById(id),
    enabled: Boolean(isOwnProfile || username || id),
  });
  const profile = profileQuery.data;
  const loading = profileQuery.isPending;

  /** Reemplazo compatible de setProfile: escribe al caché del perfil. */
  const setProfile = useCallback(
    (updater) => {
      queryClient.setQueryData(profileKey, (current) =>
        typeof updater === "function" ? updater(current) : updater
      );
    },
    [queryClient, profileKey]
  );

  const following = useMemo(() => {
    if (!profile || isOwnProfile) return false;
    if (typeof profile.isFollowing === "boolean") return profile.isFollowing;
    if (!meId) return false;
    const followers = Array.isArray(profile.followers) ? profile.followers : [];
    return followers.some(
      (followerId) => String(followerId?._id || followerId) === String(meId)
    );
  }, [profile, isOwnProfile, meId]);

  const blockedByMe = Boolean(profile?.blockedByMe);
  const mutedByMe = Boolean(profile?.mutedByMe);

  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [likingPostId, setLikingPostId] = useState(null);
  const [savingPost, setSavingPost] = useState("");
  const [repostingPostId, setRepostingPostId] = useState("");
  const [hidingPostId, setHidingPostId] = useState("");
  const [editingPostId, setEditingPostId] = useState("");
  const [editValue, setEditValue] = useState("");
  const [savingPostEdit, setSavingPostEdit] = useState("");

  const [actionError, setActionError] = useState("");
  const error =
    actionError ||
    (profileQuery.error
      ? profileQuery.error.response?.data?.error || "No se pudo cargar el perfil."
      : "");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({ displayName: "", bio: "", avatar: "", cover: "" });
  const avatarInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [profileImageEditor, setProfileImageEditor] = useState(null);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [postReportTarget, setPostReportTarget] = useState(null);
  const [followDialog, setFollowDialog] = useState(null);

  const { posts, setPosts, postsCount, setPostsCount, postsLoading, postsLoadingMore,
    postsError, hasMore, refresh, loadMore } = useProfileActivity(profile?._id, activeTab, isOwnProfile);


  // Hidratación por perfil visitado (una vez por identidad): contexto del
  // fan nav y valores iniciales del formulario de edición.
  const hydratedProfileRef = useRef("");
  useEffect(() => {
    const user = profileQuery.data;
    if (!user || hydratedProfileRef.current === profileKey.join("/")) return;
    hydratedProfileRef.current = profileKey.join("/");
    // Contexto para el fan nav: recordar el perfil visitado para que
    // "Mensaje" abra la conversación con este usuario y "Perfil" pueda
    // regresar aquí después (Perfil → Mensaje → Perfil).
    rememberProfile({ id: user._id, username: user.username, isOwn: isOwnProfile });
    setForm({
      displayName: user.displayName || "",
      bio: user.bio || "",
      avatar: mediaUrl(user.avatar),
      cover: mediaUrl(user.cover)
    });
  }, [profileQuery.data, profileKey, isOwnProfile]);

  function openProfileImageEditor(target, inputFile) {
    if (!inputFile) return;
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(inputFile.type)) {
      setActionError("Formato no permitido. Usa JPG, PNG o WebP.");
      return;
    }
    if (inputFile.size > 10 * 1024 * 1024) {
      setActionError("La imagen no puede superar 10 MB");
      return;
    }
    setActionError("");
    setSuccess("");
    setProfileImageEditor({ target, file: inputFile });
  }

  function handleCoverFile(event) {
    openProfileImageEditor("cover", event.target.files?.[0]);
  }

  async function applyProfileImage(editedFile) {
    if (!profileImageEditor || !editedFile) return;
    const target = profileImageEditor.target;
    setProfileImageEditor(null);
    setActionError("");
    setSuccess("");

    try {
      if (target === "avatar") {
        setAvatarUploading(true);
        const updated = await uploadAvatar(editedFile);
        setProfile(updated);
        setForm((current) => ({ ...current, avatar: mediaUrl(updated.avatar) }));
        updateUser({ ...getUser(), ...updated });
        setSuccess("Avatar actualizado correctamente.");
      } else {
        setCoverUploading(true);
        const updated = await uploadCover(editedFile);
        setProfile(current => ({ ...current, cover: updated.cover }));
        setForm(current => ({ ...current, cover: mediaUrl(updated.cover) }));
        setSuccess("Portada actualizada.");
      }
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || requestError.message || (target === "avatar" ? "No se pudo subir el avatar." : "No se pudo subir la portada."));
    } finally {
      setAvatarUploading(false);
      setCoverUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  function cancelProfileImageEditor() {
    setProfileImageEditor(null);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  async function toggleBlock() {
    if (!profile?._id || moderationBusy) return;
    setModerationBusy(true);
    setActionError("");
    setSuccess("");
    try {
      if (blockedByMe) {
        await unblockUser(profile._id);
        setProfile((current) => ({ ...current, blockedByMe: false }));
        setSuccess("Usuario desbloqueado. Vuelve a cargar el contenido para verlo de nuevo.");
        refresh();
      } else {
        await blockUser(profile._id);
        setProfile((current) => ({ ...current, blockedByMe: true, isFollowing: false }));
        setSuccess("Usuario bloqueado. Ya no interactúa contigo ni tú con él.");
      }
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudo actualizar el bloqueo.");
    } finally {
      setModerationBusy(false);
    }
  }

  async function toggleMute() {
    if (!profile?._id || moderationBusy) return;
    setModerationBusy(true);
    setActionError("");
    setSuccess("");
    try {
      if (mutedByMe) {
        await unmuteUser(profile._id);
        setProfile((current) => ({ ...current, mutedByMe: false }));
        setSuccess("Dejaste de silenciar a este usuario.");
      } else {
        await muteUser(profile._id);
        setProfile((current) => ({ ...current, mutedByMe: true }));
        setSuccess("Usuario silenciado: su contenido no aparece en tu feed.");
      }
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudo actualizar el silencio.");
    } finally {
      setModerationBusy(false);
    }
  }

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setSuccess("");
    setActionError("");
  }

  function handleAvatarFile(event) {
    openProfileImageEditor("avatar", event.target.files?.[0]);
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (saving || !isOwnProfile) return;
    if (form.displayName.trim().length > 100) {
      setActionError("El nombre visible no puede superar 100 caracteres");
      return;
    }
    if (form.bio.trim().length > 500) {
      setActionError("La biografía no puede superar 500 caracteres");
      return;
    }
    setSaving(true);
    setActionError("");
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
      setEditProfileOpen(false);
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudo actualizar el perfil.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleFollow() {
    if (!profile?._id || isOwnProfile) return;
    setActionError("");
    setSuccess("");
    try {
      const data = await toggleFollowService(profile._id);
      const newFollowing = Boolean(data.following);
      setProfile((current) => {
        if (!current) return current;
        const followersCount = Number.isInteger(current.followersCount) ? current.followersCount : Array.isArray(current.followers) ? current.followers.length : 0;
        return { ...current, isFollowing: newFollowing, followersCount: current.followersCount === null ? null : Math.max(0, followersCount + (newFollowing ? 1 : -1)) };
      });
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudo actualizar el seguimiento.");
    }
  }

  async function handleShareProfile() {
    if (!profile?._id) return;
    const path = profile.username ? `/profile/${profile.username}` : `/users/${profile._id}`;
    const url = `${window.location.origin}${path}`;
    const title = profile.displayName || profile.username || "Perfil en Kronos";
    setActionError("");
    setSuccess("");
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `Perfil de ${title} en KRONOSPACE`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setSuccess("Enlace del perfil copiado.");
      }
    } catch (shareError) {
      if (shareError.name !== "AbortError") setActionError("No se pudo compartir el perfil.");
    }
  }

  async function handleLike(postId) {
    if (!postId || likingPostId) return;
    const prev = posts.find((p) => String(p._id) === String(postId));
    const prevLiked = prev?.liked;
    const prevCount = typeof prev?.likesCount === "number" ? prev.likesCount : Array.isArray(prev?.likes) ? prev.likes.length : 0;
    setLikingPostId(postId);
    setActionError("");
    setPosts((items) => items.map((p) => (String(p._id) === String(postId) ? { ...p, liked: !prevLiked, likesCount: prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1 } : p)));
    try {
      const result = await likePostService(postId);
      setPosts((currentPosts) => currentPosts.map((post) => (String(post._id) === String(postId) ? { ...post, likesCount: typeof result?.likesCount === "number" ? result.likesCount : post.likesCount || 0, liked: Boolean(result?.liked) } : post)));
    } catch (requestError) {
      setPosts((items) => items.map((p) => (String(p._id) === String(postId) ? { ...p, liked: prevLiked, likesCount: prevCount } : p)));
      setActionError(requestError.response?.data?.error || "No se pudo actualizar el like.");
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
      setActionError(e.response?.data?.error || "No se pudo guardar.");
    } finally {
      setSavingPost("");
    }
  }

  async function handleRepost(postId) {
    if (!postId || repostingPostId) return;
    if (!window.confirm("¿Republicar?")) return;
    setRepostingPostId(postId);
    setActionError("");
    setSuccess("");
    try {
      const newPost = await repostPost(postId);
      if (newPost) {
        setSuccess("Republicación creada en tu perfil.");
        if (isOwnProfile && activeTabRef.current === activeTab && (activeTab === "reposts" || activeTab === "media")) refresh();
      }
    } catch (e) {
      if (e.response?.status === 409) setActionError("Ya has republicado esta publicación.");
      else setActionError(e.response?.data?.error || "No se pudo republicar.");
    } finally {
      setRepostingPostId("");
    }
  }

  async function handleEditPost(postId, nextValue = editValue) {
    const value = String(nextValue || "").trim();
    const post = posts.find((item) => String(item._id) === String(postId));
    const hasMedia = Boolean(post?.media?.url);
    if (!value && !hasMedia) {
      setActionError("La publicación está vacía");
      return;
    }
    if (value.length > 5000) {
      setActionError("La publicación no puede superar 5000 caracteres");
      return;
    }
    setSavingPostEdit(postId);
    try {
      const updated = await updatePost(postId, value, { allowEmptyContent: hasMedia });
      setPosts((items) => items.map((p) => (String(p._id) === String(postId) ? updated : p)));
      setEditingPostId("");
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 403) setActionError("No tienes permisos para editar esta publicación.");
      else if (status === 404) setActionError("Publicación no encontrada.");
      else setActionError(requestError.response?.data?.error || "No se pudo editar la publicación.");
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
      if (status === 403) setActionError("No tienes permisos para eliminar esta publicación.");
      else if (status === 404) setActionError("Publicación no encontrada.");
      else setActionError(requestError.response?.data?.error || "No se pudo eliminar la publicación.");
    }
  }

  async function handleSharePost(post) {
    if (!post?._id) return;
    const url = `${window.location.origin}/post/${post._id}`;
    try {
      if (navigator.share) await navigator.share({ title: "Publicación en Kronos", text: post.content || "Publicación en Kronos", url });
      else {
        await navigator.clipboard.writeText(url);
        window.alert("Enlace copiado");
      }
    } catch (shareError) {
      if (shareError.name !== "AbortError") setActionError("No se pudo compartir la publicación.");
    }
  }

  async function handleHidePost(postId) {
    if (!postId || hidingPostId) return;
    setHidingPostId(postId);
    setActionError("");
    setSuccess("");
    try {
      await hidePost(postId);
      setPosts((items) => items.filter((p) => String(p._id) !== String(postId)));
      setPostsCount((count) => Math.max(0, count - 1));
      setSuccess("Publicación oculta para ti.");
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudo ocultar la publicación.");
    } finally {
      setHidingPostId("");
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
        <button className="k-button k-button-secondary" type="button" onClick={() => profileQuery.refetch()}>
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
          <div className="profile-stats" style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
            <span><strong>{postsCount}</strong> en {currentTab.label.toLowerCase()}</span>
            {profile.followersCount !== null && (
              <button className="k-profile-stat-button" type="button" onClick={() => setFollowDialog("followers")}>
                <strong>{followersCount}</strong> seguidores
              </button>
            )}
            {profile.followingCount !== null && (
              <button className="k-profile-stat-button" type="button" onClick={() => setFollowDialog("following")}>
                <strong>{followingCount}</strong> siguiendo
              </button>
            )}
          </div>
          <div className="profile-utility-actions">
            <button className="k-button k-button-secondary" type="button" onClick={handleShareProfile}>
              Compartir perfil
            </button>
            {isOwnProfile && (
              <button className="k-button k-button-primary" type="button" onClick={() => setEditProfileOpen(true)}>
                Editar perfil
              </button>
            )}
          </div>
          {!isOwnProfile && (
            <div className="profile-actions" style={{ display: "flex", gap: 12, marginTop: 14, alignItems: "center" }}>
              {/* Acciones primarias visibles (KRONOS-AUDIT-007): el resto
                  (silenciar, bloquear, reportar) vive en el menú "···" para
                  no competir con Seguir/Mensaje. */}
              <button className={`k-button ${following ? "k-button-secondary" : "k-button-primary"}`} type="button" onClick={handleToggleFollow} aria-pressed={following}>
                {following ? "Dejar de seguir" : "Seguir"}
              </button>
              <Link className="k-button k-button-secondary" to={`/messages/${profile._id}`}>
                Mensaje
              </Link>
              <details className="k-post-menu">
                <summary aria-label="Más opciones de este perfil">
                  <span aria-hidden="true">⋯</span>
                </summary>
                <div role="menu" aria-label="Opciones secundarias del perfil">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={toggleMute}
                    disabled={moderationBusy}
                    aria-pressed={mutedByMe}
                  >
                    {mutedByMe ? "Quitar silencio" : "Silenciar"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={toggleBlock}
                    disabled={moderationBusy}
                    aria-pressed={blockedByMe}
                  >
                    {blockedByMe ? "Desbloquear" : "Bloquear"}
                  </button>
                  <button type="button" role="menuitem" onClick={() => setReportOpen(true)}>
                    Reportar
                  </button>
                </div>
              </details>
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
      <ReportDialog
        open={Boolean(postReportTarget)}
        targetType="post"
        targetId={postReportTarget?._id}
        targetLabel={postReportTarget?.author?.username ? `la publicación de @${postReportTarget.author.username}` : ""}
        onClose={() => setPostReportTarget(null)}
      />

      <ProfileFollowDialog
        open={Boolean(followDialog)}
        type={followDialog}
        profile={profile}
        currentUserId={meId}
        onClose={() => setFollowDialog(null)}
        onCountChange={(delta) => setProfile((current) => {
          if (!current || current.followersCount === null) return current;
          const currentCount = Number.isInteger(current.followersCount) ? current.followersCount : Array.isArray(current.followers) ? current.followers.length : followersCount;
          return { ...current, followersCount: Math.max(0, currentCount + delta) };
        })}
      />

      <ImageEditor
        file={profileImageEditor?.file}
        onApply={applyProfileImage}
        onCancel={cancelProfileImageEditor}
        title={profileImageEditor?.target === "cover" ? "Recortar portada" : "Recortar avatar"}
        description={profileImageEditor?.target === "cover" ? "Ajusta recorte 3:1, centrado, zoom, rotación y formato antes de subir la portada." : "Ajusta recorte 1:1, centrado, zoom, rotación y formato antes de subir el avatar."}
        defaultAspect={profileImageEditor?.target === "cover" ? "3:1" : "1:1"}
        aspectOptions={profileImageEditor?.target === "cover" ? [
          { value: "3:1", label: "Portada 3:1", ratio: 3 },
          { value: "16:9", label: "16:9", ratio: 16 / 9 },
          { value: "original", label: "Original", ratio: null }
        ] : [
          { value: "1:1", label: "Avatar 1:1", ratio: 1 },
          { value: "4:5", label: "4:5", ratio: 4 / 5 },
          { value: "original", label: "Original", ratio: null }
        ]}
        outputNamePrefix={profileImageEditor?.target === "cover" ? "kronos-cover" : "kronos-avatar"}
      />

      {isOwnProfile && editProfileOpen && (
        <div className="k-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditProfileOpen(false); }}>
          <section className="profile-edit k-modal" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
            <header className="k-follow-dialog-header">
              <div>
                <h3 id="profile-edit-title">Editar perfil</h3>
              </div>
              <button className="k-button k-button-ghost" type="button" onClick={() => setEditProfileOpen(false)}>
                Cerrar
              </button>
            </header>
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
        </div>
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
              const authorId = String(post.author?._id || post.author || profile._id || "");
              const isOwnPost = Boolean(authorId && meId && authorId === meId);
              const isEditing = editingPostId === post._id;
              // Silenciar/Bloquear al autor ya están en los botones de la
              // cabecera del perfil (KRONOS-AUDIT-008): no se repiten en el
              // menú "···" del post porque aquí todos los posts son del
              // mismo autor que se está viendo (onMute/onBlock se omiten).
              return (
                <PostCard
                  key={post._id}
                  post={post}
                  currentUserId={meId}
                  isOwn={isOwnPost}
                  liking={likingPostId === post._id ? post._id : ""}
                  saving={savingPost === post._id ? post._id : ""}
                  reposting={repostingPostId === post._id ? post._id : ""}
                  hiding={hidingPostId === post._id ? post._id : ""}
                  editing={isEditing}
                  setEditing={() => {
                    if (isEditing) {
                      setEditingPostId("");
                    } else {
                      setEditingPostId(post._id);
                      setEditValue(post.content || "");
                    }
                  }}
                  editValue={isEditing ? editValue : post.content || ""}
                  setEditValue={setEditValue}
                  savingEdit={savingPostEdit === post._id}
                  onLike={handleLike}
                  onSave={handleSave}
                  onRepost={handleRepost}
                  onShare={handleSharePost}
                  toggleOpen={(postId) => navigate(`/post/${postId}`)}
                  onEdit={handleEditPost}
                  onDelete={handleDeletePost}
                  onHide={handleHidePost}
                  onReport={(item) => setPostReportTarget(item)}
                />
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

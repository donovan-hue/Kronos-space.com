import { api } from "./apiClient";

export async function getMe() {
  const { data } = await api.get("/users/me");
  return data;
}

export async function getUserById(userId) {
  const { data } = await api.get(`/users/${userId}`);
  return data;
}

export async function getUserByUsername(username) {
  const { data } = await api.get(`/users/username/${encodeURIComponent(username)}`);
  return data;
}

export async function searchUsers(query) {
  const value = typeof query === "string" ? query.trim() : "";
  if (!value) return { users: [] };
  const { data } = await api.get("/users/search", { params: { q: value } });
  return data;
}

export async function toggleFollow(userId) {
  const { data } = await api.post(`/users/${userId}/follow`);
  return data; // { userId, following }
}

export async function getFollowers(userId, { page = 1, limit = 20 } = {}) {
  const { data } = await api.get(`/users/${userId}/followers`, { params: { page, limit } });
  return data;
}

export async function getFollowing(userId, { page = 1, limit = 20 } = {}) {
  const { data } = await api.get(`/users/${userId}/following`, { params: { page, limit } });
  return data;
}

/** BLOQUE 009 — personas y publicaciones visibles para el usuario actual. */
export async function searchGlobal(query, scope = "all", { page = 1, limit = 15 } = {}) {
  const value = typeof query === "string" ? query.trim() : "";
  if (value.length < 2) throw new Error("Escribe al menos 2 caracteres para buscar.");
  const { data } = await api.get("/search", { params: { q: value, scope, page, limit } });
  return data;
}

export async function updateProfile(payload) {
  const body = {};
  for (const field of ["displayName", "bio", "avatar"]) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) body[field] = payload[field];
  }
  const { data } = await api.patch("/users/me", body);
  return data;
}

/**
 * uploadAvatar — KRONOS-UI-016 — AUDIT-005
 * Field: avatar (image/jpeg/png/webp, max 10MB)
 */
export async function uploadAvatar(file) {
  if (!file) throw new Error("Selecciona una imagen");
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) throw new Error("Formato no permitido. Usa JPG, PNG o WebP.");
  if (file.size > 10 * 1024 * 1024) throw new Error("La imagen no puede superar 10 MB");
  const form = new FormData();
  form.append("avatar", file);
  const { data } = await api.post("/users/me/avatar", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data; // user
}

/**
 * uploadCover — KRONOS-UI-016 (bloque 007-016)
 * Field: cover (image/jpeg/png/webp, max 10MB). El backend valida firma.
 */
export async function uploadCover(file) {
  if (!file) throw new Error("Selecciona una imagen");
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) throw new Error("Formato no permitido. Usa JPG, PNG o WebP.");
  if (file.size > 10 * 1024 * 1024) throw new Error("La imagen no puede superar 10 MB");
  const form = new FormData();
  form.append("cover", file);
  const { data } = await api.post("/users/me/cover", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data; // user
}

export async function updateProfilePrivacy(privacy) {
  const { data } = await api.patch("/users/me/privacy", privacy);
  return data.privacy;
}

export async function updatePreferences(preferences) {
  const { data } = await api.patch("/users/me/preferences", preferences);
  return data.preferences;
}

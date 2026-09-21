import { api } from "./apiClient";

export async function getCollections() {
  const { data } = await api.get("/collections");
  return data;
}

export async function createCollection(name, description = "") {
  const value = String(name || "").trim();
  if (!value) throw new Error("El nombre de la colección es obligatorio");
  if (value.length > 80) throw new Error("El nombre no puede superar 80 caracteres");
  const { data } = await api.post("/collections", { name: value, description: String(description || "").trim() });
  return data?.collection;
}

export async function updateCollection(collectionId, name, description = "") {
  const { data } = await api.patch(`/collections/${collectionId}`, { name, description });
  return data?.collection;
}

export async function deleteCollection(collectionId) {
  const { data } = await api.delete(`/collections/${collectionId}`);
  return data;
}

export async function addPostToCollection(collectionId, postId) {
  const { data } = await api.post(`/collections/${collectionId}/posts/${postId}`);
  return data;
}

export async function removePostFromCollection(collectionId, postId) {
  const { data } = await api.delete(`/collections/${collectionId}/posts/${postId}`);
  return data;
}

export async function getCollectionPosts(collectionId, { page = 1, limit = 20 } = {}) {
  const { data } = await api.get(`/collections/${collectionId}/posts`, { params: { page, limit } });
  return data;
}

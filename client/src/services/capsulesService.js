import { api } from "./apiClient";

/** CÁPSULAS DEL TIEMPO (Fase 5) — capa de servicio sobre /api/capsules. */

export async function getCapsules() {
  const { data } = await api.get("/capsules");
  return data?.capsules || [];
}

export async function getCapsule(capsuleId) {
  const { data } = await api.get(`/capsules/${capsuleId}`);
  return data?.capsule;
}

export async function createCapsule({ title, opensAt, timezone = "UTC", message = "" } = {}) {
  const { data } = await api.post("/capsules", { title, opensAt, timezone, message });
  return data?.capsule;
}

export async function sealCapsule(capsuleId) {
  const { data } = await api.post(`/capsules/${capsuleId}/seal`);
  return data?.capsule;
}

export async function cancelCapsule(capsuleId) {
  const { data } = await api.post(`/capsules/${capsuleId}/cancel`);
  return data?.capsule;
}

export async function addCapsuleMessage(capsuleId, text) {
  const { data } = await api.post(`/capsules/${capsuleId}/messages`, { text });
  return data?.capsule;
}

export async function inviteCapsuleContributor(capsuleId, username) {
  const { data } = await api.post(`/capsules/${capsuleId}/invite`, { username });
  return data?.capsule;
}

export async function deleteCapsule(capsuleId) {
  const { data } = await api.delete(`/capsules/${capsuleId}`);
  return data;
}

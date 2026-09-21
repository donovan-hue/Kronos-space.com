import { api } from "./apiClient";

export async function getOrbits() {
  const { data } = await api.get("/orbits");
  return data?.orbits || [];
}

export async function getOrbit(orbitId) {
  const { data } = await api.get(`/orbits/${orbitId}`);
  return data.orbit;
}

export async function createOrbit(payload) {
  const { data } = await api.post("/orbits", payload);
  return data.orbit;
}

export async function updateOrbit(orbitId, payload) {
  const { data } = await api.patch(`/orbits/${orbitId}`, payload);
  return data.orbit;
}

export async function deleteOrbit(orbitId) {
  const { data } = await api.delete(`/orbits/${orbitId}`);
  return data;
}

export async function joinOrbit(orbitId) {
  const { data } = await api.post(`/orbits/${orbitId}/join`);
  return data.orbit;
}

export async function leaveOrbit(orbitId) {
  const { data } = await api.post(`/orbits/${orbitId}/leave`);
  return data;
}

export async function getOrbitMembers(orbitId) {
  const { data } = await api.get(`/orbits/${orbitId}/members`);
  return data;
}

export async function addOrbitMember(orbitId, userId, role = "member") {
  const { data } = await api.post(`/orbits/${orbitId}/members`, { userId, role });
  return data;
}

export async function updateOrbitMember(orbitId, userId, role) {
  const { data } = await api.patch(`/orbits/${orbitId}/members/${userId}`, { role });
  return data;
}

export async function removeOrbitMember(orbitId, userId) {
  const { data } = await api.delete(`/orbits/${orbitId}/members/${userId}`);
  return data;
}

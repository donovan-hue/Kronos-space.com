import { api } from "./apiClient";

export async function getCircles() {
  const { data } = await api.get("/circles");
  return data?.circles || [];
}

export async function createCircle({ name, description = "" } = {}) {
  const { data } = await api.post("/circles", { name, description });
  return data.circle;
}

export async function updateCircle(circleId, { name, description = "" } = {}) {
  const { data } = await api.patch(`/circles/${circleId}`, { name, description });
  return data.circle;
}

export async function deleteCircle(circleId) {
  const { data } = await api.delete(`/circles/${circleId}`);
  return data;
}

export async function getCircleMembers(circleId) {
  const { data } = await api.get(`/circles/${circleId}/members`);
  return data;
}

export async function addCircleMember(circleId, userId) {
  const { data } = await api.post(`/circles/${circleId}/members`, { userId });
  return data;
}

export async function removeCircleMember(circleId, userId) {
  const { data } = await api.delete(`/circles/${circleId}/members/${userId}`);
  return data;
}

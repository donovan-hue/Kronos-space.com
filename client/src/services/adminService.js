import { api } from "./apiClient";

export async function getAdminOverview() {
  const { data } = await api.get("/admin/overview");
  return data;
}

export async function getAdminUsers({ q = "", page = 1, limit = 25 } = {}) {
  const { data } = await api.get("/admin/users", { params: { q, page, limit } });
  return data;
}

export async function updateUserRole(userId, role) {
  const { data } = await api.patch(`/admin/users/${userId}/role`, { role });
  return data.user;
}

export async function getAdminPosts({ page = 1, limit = 25 } = {}) {
  const { data } = await api.get("/admin/posts", { params: { page, limit } });
  return data;
}

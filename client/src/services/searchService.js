import { api } from "./apiClient";

export async function globalSearch(query, { type = "all", page = 1, limit = 20 } = {}) {
  const value = typeof query === "string" ? query.trim() : "";
  if (!value) return { query: "", type, users: [], posts: [], total: 0, page: 1, limit, hasMore: false };
  const { data } = await api.get("/search", { params: { q: value, type, page, limit } });
  return data;
}

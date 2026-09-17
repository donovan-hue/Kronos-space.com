import { API_URL } from "./apiClient";

// Upload paths belong to the API, not to the static frontend (Vercel/Pages).
export function mediaUrl(value, apiUrl = API_URL, origin = window.location.origin) {
  if (typeof value !== "string" || !value.startsWith("/uploads/")) return value || "";
  return new URL(value, new URL(apiUrl, origin)).href;
}

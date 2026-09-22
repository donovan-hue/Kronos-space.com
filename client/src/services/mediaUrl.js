import { API_URL } from "./apiClient";

// Upload paths belong to the API, not to the static frontend (Vercel/Pages).
function defaultOrigin() {
  try {
    return typeof window !== "undefined" && window.location
      ? window.location.origin
      : "http://localhost:3000";
  } catch {
    return "http://localhost:3000";
  }
}

export function mediaUrl(value, apiUrl = API_URL, origin = defaultOrigin()) {
  if (typeof value !== "string" || !value.startsWith("/uploads/")) return value || "";
  return new URL(value, new URL(apiUrl, origin)).href;
}

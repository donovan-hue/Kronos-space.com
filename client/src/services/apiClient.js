import axios from "axios";
import { clearSession, getToken } from "./authStorage";

// In production/preview use the same origin and let the web server proxy /api.
// This avoids browser requests to localhost, which only exists inside the sandbox.
export const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
export const api = axios.create({ baseURL: API_URL, timeout: 15000, headers: { "Content-Type": "application/json" } });
api.interceptors.request.use((config) => { const token = getToken(); if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
api.interceptors.response.use((response) => response, (error) => { if (error.response?.status === 401) clearSession(); return Promise.reject(error); });

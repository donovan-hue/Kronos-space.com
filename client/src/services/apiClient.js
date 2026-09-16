import axios from "axios";
import { clearSession, getToken } from "./authStorage";
import { currentHostname, resolveApiUrl } from "./apiUrl";

// En desarrollo se usa /api relativo (proxy de vite.config.js). En los hosts
// estáticos de producción el /api relativo devuelve 405 en los POST, así que
// sin VITE_API_URL el cliente apunta al host real de la API. Nunca a
// localhost, que solo existe en la máquina de quien programa.
export const API_URL = resolveApiUrl({
  configured: import.meta.env.VITE_API_URL,
  hostname: currentHostname()
});
export const api = axios.create({ baseURL: API_URL, timeout: 15000, headers: { "Content-Type": "application/json" } });
api.interceptors.request.use((config) => { const token = getToken(); if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
api.interceptors.response.use((response) => response, (error) => { if (error.response?.status === 401) clearSession(); return Promise.reject(error); });

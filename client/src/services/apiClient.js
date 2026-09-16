import axios from "axios";
import { clearSession, getToken } from "./authStorage";

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/$/, "");
export const api = axios.create({ baseURL: API_URL, timeout: 15000, headers: { "Content-Type": "application/json" } });
api.interceptors.request.use((config) => { const token = getToken(); if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
api.interceptors.response.use((response) => response, (error) => { if (error.response?.status === 401) clearSession(); return Promise.reject(error); });

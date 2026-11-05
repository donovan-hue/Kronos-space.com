import { api } from "./apiClient";

/**
 * Biblioteca de prompts y estilos propios.
 *
 * El catálogo (instrumentos y estilos de fábrica) lo sirve el servidor: el
 * cliente no lo copia, para que no haya dos listas que se desincronicen.
 */

export async function getPromptCatalog({ grupo = "", q = "" } = {}) {
  const params = new URLSearchParams();
  if (grupo) params.set("grupo", grupo);
  if (q) params.set("q", q.slice(0, 80));
  const sufijo = params.toString() ? `?${params.toString()}` : "";
  const { data } = await api.get(`/prompts/catalog${sufijo}`);
  return {
    grupos: Array.isArray(data?.grupos) ? data.grupos : [],
    instrumentos: Array.isArray(data?.instrumentos) ? data.instrumentos : [],
    estilos: Array.isArray(data?.estilos) ? data.estilos : [],
    total: Number(data?.total) || 0,
  };
}

export async function getPromptPresets({ tipo = "", grupo = "", q = "" } = {}) {
  const params = new URLSearchParams();
  if (tipo) params.set("tipo", tipo);
  if (grupo) params.set("grupo", grupo);
  if (q) params.set("q", q.slice(0, 80));
  const sufijo = params.toString() ? `?${params.toString()}` : "";
  const { data } = await api.get(`/prompts/presets${sufijo}`);
  return {
    presets: Array.isArray(data?.presets) ? data.presets : [],
    total: Number(data?.total) || 0,
  };
}

export async function createPromptPreset(payload = {}) {
  const { data } = await api.post("/prompts/presets", {
    nombre: String(payload.nombre || "").trim().slice(0, 80),
    tipo: payload.tipo || "preset",
    instrumento: payload.instrumento || "",
    valores: payload.valores || {},
    estiloVisual: String(payload.estiloVisual || "").trim().slice(0, 1000),
  });
  return data?.preset;
}

export async function updatePromptPreset(id, payload = {}) {
  const { data } = await api.patch(`/prompts/presets/${id}`, payload);
  return data?.preset;
}

export async function deletePromptPreset(id) {
  const { data } = await api.delete(`/prompts/presets/${id}`);
  return data;
}

export async function applyPromptPreset(id) {
  const { data } = await api.post(`/prompts/presets/${id}/aplicar`);
  return data;
}

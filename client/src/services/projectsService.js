import { api } from "./apiClient";

/** PROYECTOS — tablero por pieza (guion, tomas, música y versiones). */

export async function getProjects({ archived = false } = {}) {
  const { data } = await api.get("/projects", { params: archived ? { archived: "true" } : undefined });
  return data?.projects || [];
}

export async function createProject({ title, brief = "", format = "libre", scenes = [] } = {}) {
  const value = String(title || "").trim();
  if (!value) throw new Error("El proyecto necesita un nombre");
  const { data } = await api.post("/projects", { title: value, brief, format, scenes });
  return data?.project;
}

export async function getProject(projectId) {
  const { data } = await api.get(`/projects/${projectId}`);
  return data?.project;
}

export async function updateProject(projectId, patch = {}) {
  const { data } = await api.patch(`/projects/${projectId}`, patch);
  return data?.project;
}

export async function deleteProject(projectId) {
  const { data } = await api.delete(`/projects/${projectId}`);
  return data;
}

export async function createProjectVersion(projectId, label = "") {
  const { data } = await api.post(`/projects/${projectId}/versions`, { label });
  return data;
}

export async function deleteProjectVersion(projectId, versionId) {
  const { data } = await api.delete(`/projects/${projectId}/versions/${versionId}`);
  return data;
}

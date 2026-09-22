import { api } from "./apiClient";

export async function getExportStatus() {
  const { data } = await api.get("/export/status");
  return data;
}

export async function requestDataExport() {
  const { data } = await api.post("/export/request");
  return data;
}

export async function downloadDataExport() {
  const response = await api.get("/export/download", {
    responseType: "blob"
  });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `kronos-export-${Date.now()}.json`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

import { api } from "./apiClient";

/* ============================================================
   Catálogo de música del estudio.

   El servidor publica el catálogo en `GET /api/music` (solo pistas
   publicadas; la administración las sube con POST /api/music). Aquí solo
   se pide, se limpia y se devuelve tal cual: el estudio no inventa ni una
   canción de relleno. Si la lectura falla, se devuelve la lista vacía con
   el motivo para que la pantalla diga la verdad.

   Cada pista: { _id, titulo, autor, duracion, etiquetas[], licencia,
   url, tipo: "catalogo" | "propia" }
   ============================================================ */

export const MOTIVO_SIN_CATALOGO =
  "No se pudo leer el catálogo de música del servidor. Vuelve a intentarlo en un momento.";

export async function obtenerCatalogoMusica() {
  try {
    const { data } = await api.get("/music", { params: { limite: 60 } });
    const pistas = Array.isArray(data?.pistas) ? data.pistas : Array.isArray(data) ? data : [];
    return {
      pistas: pistas.filter((pista) => pista && pista._id && pista.titulo).map((pista) => ({
        _id: String(pista._id),
        titulo: String(pista.titulo),
        autor: String(pista.autor || ""),
        duracion: Number(pista.duracion || 0),
        etiquetas: Array.isArray(pista.etiquetas) ? pista.etiquetas.slice(0, 4) : [],
        url: pista.url || "",
        tipo: "catalogo"
      })),
      motivo: ""
    };
  } catch {
    return { pistas: [], motivo: MOTIVO_SIN_CATALOGO };
  }
}

/* Búsqueda local sobre el catálogo ya cargado: sin red y sin esperas. */
export function filtrarCatalogo(pistas, consulta) {
  const texto = String(consulta || "").trim().toLowerCase();
  if (!texto) return pistas;
  return pistas.filter((pista) =>
    [pista.titulo, pista.autor, ...(pista.etiquetas || [])]
      .join(" ")
      .toLowerCase()
      .includes(texto)
  );
}

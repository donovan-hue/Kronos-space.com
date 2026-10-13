import { api } from "./apiClient";

/* ============================================================
   Catálogo de música del estudio.

   El servidor todavía no publica pistas: `/api/music` responde 404 y
   aquí se devuelve una lista vacía con su motivo, para que el estudio
   diga la verdad y no invente canciones. Cuando el servidor exponga el
   catálogo (ver docs/ESTUDIO-MEDIOS-Y-KAIROS.md), esta función no
   cambia: solo empieza a llegar contenido.

   Cada pista: { _id, titulo, autor, duracion, etiquetas[], licencia,
   url, tipo: "catalogo" | "propia" }
   ============================================================ */

export const MOTIVO_SIN_CATALOGO =
  "El servidor todavía no publica un catálogo de música. Cuando exponga /api/music, las pistas aparecerán aquí.";

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

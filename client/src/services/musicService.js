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

// Resuelve por identificador las publicaciones antiguas sin URL guardada.
export async function obtenerPistaMusica(trackId) {
  const { data } = await api.get(`/music/${encodeURIComponent(trackId)}`);
  return data.pista;
}

/**
 * Publica una pista en el catálogo (solo administración).
 *
 * `POST /api/music` existía desde el principio y ninguna pantalla lo llamaba:
 * el catálogo solo se podía llenar a mano con curl. El archivo va en un
 * `FormData` y el resto como campos de texto, que es lo que espera el
 * middleware de audio del servidor.
 */
export async function publicarPista({ archivo, titulo, autor = "", duracion = 0, etiquetas = "", licencia = "", publicada = true }) {
  if (!archivo) throw new Error("La pista necesita un archivo de audio");
  const formulario = new FormData();
  formulario.append("audio", archivo);
  formulario.append("titulo", String(titulo || "").trim());
  formulario.append("autor", String(autor || "").trim());
  formulario.append("duracion", String(Number(duracion) || 0));
  formulario.append("etiquetas", String(etiquetas || ""));
  formulario.append("licencia", String(licencia || ""));
  formulario.append("publicada", publicada ? "true" : "false");
  const { data } = await api.post("/music", formulario);
  return data?.pista;
}

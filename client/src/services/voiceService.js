import { api } from "./apiClient";

/* ============================================================
   Catálogo de voces del estudio.

   El servidor publica las voces en `GET /api/voices` (las voces listadas
   para todos, más las grabaciones propias de quien pregunta). Aquí solo se
   pide, se limpia y se devuelve tal cual: el estudio no inventa ninguna voz
   de relleno. Una voz de catálogo sin modelo, o con el servicio de voz sin
   configurar, llega marcada como no disponible con su motivo, y la pantalla
   lo dice.

   Cada voz: { _id, nombre, descripcion, idioma, genero, tipo, url, duracion,
   modelo, ajustes[], disponible, motivo }
   ============================================================ */

export const MOTIVO_SIN_VOCES =
  "No se pudo leer el catálogo de voces del servidor. Vuelve a intentarlo en un momento.";

export const MOTIVO_SIN_GRABACION =
  "Graba tu voz en off desde el estudio para usarla en la pieza.";

export async function obtenerVoces() {
  try {
    const { data } = await api.get("/voices", { params: { limite: 60 } });
    const voces = Array.isArray(data?.voces) ? data.voces : Array.isArray(data) ? data : [];
    return {
      voces: voces
        .filter((voz) => voz && voz._id && voz.nombre)
        .map((voz) => ({
          _id: String(voz._id),
          nombre: String(voz.nombre),
          descripcion: String(voz.descripcion || ""),
          idioma: String(voz.idioma || ""),
          genero: String(voz.genero || ""),
          tipo: voz.tipo === "catalogo" ? "catalogo" : "propia",
          url: voz.url || "",
          duracion: Number(voz.duracion || 0),
          modelo: String(voz.modelo || ""),
          vozProveedor: String(voz.vozProveedor || ""),
          ajustes: Array.isArray(voz.ajustes) ? voz.ajustes.slice(0, 6) : [],
          disponible: voz.disponible !== false,
          motivo: String(voz.motivo || "")
        })),
      servicio: {
        listo: Boolean(data?.servicio?.listo),
        variable: String(data?.servicio?.variable || ""),
        modelo: String(data?.servicio?.modelo || ""),
        voz: String(data?.servicio?.voz || ""),
        limites: {
          texto: Number(data?.servicio?.limites?.texto || 1200)
        }
      },
      motivo: ""
    };
  } catch {
    return {
      voces: [],
      servicio: { listo: false, variable: "", modelo: "", voz: "", limites: { texto: 1200 } },
      motivo: MOTIVO_SIN_VOCES
    };
  }
}

/* Búsqueda local sobre el catálogo ya cargado: sin red y sin esperas. */
export function filtrarVoces(voces, consulta) {
  const texto = String(consulta || "").trim().toLowerCase();
  if (!texto) return voces;
  return voces.filter((voz) =>
    [voz.nombre, voz.descripcion, voz.idioma, voz.genero]
      .join(" ")
      .toLowerCase()
      .includes(texto)
  );
}

/* Locución: convierte el texto en una toma de voz con el modelo configurado
   en el servidor. Con `voiceId` usa el modelo y la voz de esa voz del
   catálogo. Devuelve la dirección ya guardada en /uploads/voices/. */
export async function generarLocucion({ texto, voiceId = "" } = {}) {
  const limpio = String(texto || "").trim();
  if (!limpio) throw new Error("Escribe el texto de la locución.");
  const { data } = await api.post("/voices/locucion", { texto: limpio, voiceId });
  if (!data?.toma?.url) throw new Error("No se pudo generar la locución.");
  return {
    url: data.toma.url,
    mimeType: data.toma.mimeType || "audio/mpeg",
    size: Number(data.toma.size) || 0,
    modelo: String(data.toma.modelo || ""),
    voz: String(data.toma.voz || "")
  };
}

/* Una toma de voz propia: el archivo va a /api/uploads/audio con
   destino "voz" y vuelve la dirección ya guardada en /uploads/voices/. */
export async function subirVoz(archivo) {
  const forma = new FormData();
  forma.append("audio", archivo);
  forma.append("destino", "voz");
  const { data } = await api.post("/uploads/audio", forma, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  if (!data?.url) throw new Error("No se pudo subir la voz.");
  return { url: data.url, size: Number(data.size) || 0, mimeType: data.mimeType || "" };
}

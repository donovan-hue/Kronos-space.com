import { api } from "./apiClient";

/**
 * Descubrimiento: temas en tendencia y a quién seguir (bloque 1.2).
 *
 * El pendiente era «sin tendencias ni sugerencias de a quién seguir más allá de
 * lo que ya hay en Explorar». Estos dos endpoints alimentan esa pantalla.
 *
 * Si la lectura falla se devuelve una lista vacía **con el motivo**, no datos
 * de relleno: una tendencia inventada se nota y desacredita al resto.
 */

export async function getTendencias({ dias = 7, limite = 8 } = {}) {
  try {
    const { data } = await api.get("/search/trending", { params: { dias, limite } });
    const tendencias = Array.isArray(data?.tendencias) ? data.tendencias : [];
    return { tendencias, motivo: "" };
  } catch {
    return { tendencias: [], motivo: "No se pudieron cargar las tendencias." };
  }
}

/**
 * Sugerencias de a quién seguir. Cada una trae `motivo` calculado por el
 * servidor (amigos en común o seguidores), para poder explicar la lista en vez
 * de presentarla como una orden.
 */
export async function getSugerenciasDeSeguir({ limite = 6 } = {}) {
  try {
    const { data } = await api.get("/search/suggestions", { params: { limite } });
    const sugerencias = Array.isArray(data?.sugerencias) ? data.sugerencias : [];
    return { sugerencias, motivo: "" };
  } catch {
    return { sugerencias: [], motivo: "No se pudieron cargar las sugerencias." };
  }
}

/* ============================================================
   ESTUDIO DE MEDIOS — motor de edición

   Aquí vive todo lo que no dibuja: catálogo de filtros, ajustes de
   tono, medidas de exportación, recorte de música y la receta de
   edición del video. Las pantallas solo lo consumen.

   Regla: filtros y ajustes se expresan como funciones CSS, así que
   la vista previa y el archivo exportado salen del mismo cálculo.
   ============================================================ */

/* ---------- 1. Filtros ---------- */

export const FILTROS = [
  { id: "original", nombre: "Original", css: "none", grupo: "base" },
  { id: "vivo", nombre: "Vivo", css: "saturate(1.35) contrast(1.06)", grupo: "color" },
  { id: "suave", nombre: "Suave", css: "saturate(0.9) contrast(0.95) brightness(1.05)", grupo: "color" },
  { id: "frio", nombre: "Frío", css: "hue-rotate(-12deg) saturate(1.05) brightness(1.02)", grupo: "color" },
  { id: "calido", nombre: "Cálido", css: "sepia(0.16) saturate(1.15) brightness(1.03)", grupo: "color" },
  { id: "crepusculo", nombre: "Crepúsculo", css: "hue-rotate(-18deg) saturate(1.2) contrast(1.08)", grupo: "color" },
  { id: "niebla", nombre: "Niebla", css: "contrast(0.9) brightness(1.08) saturate(0.85)", grupo: "clima" },
  { id: "claridad", nombre: "Claridad", css: "brightness(1.12) contrast(1.05)", grupo: "clima" },
  { id: "sombra", nombre: "Sombra", css: "brightness(0.9) contrast(1.12)", grupo: "clima" },
  { id: "retro", nombre: "Retro", css: "sepia(0.35) saturate(1.1) contrast(1.05)", grupo: "tono" },
  { id: "negro", nombre: "Noir", css: "grayscale(1) contrast(1.18)", grupo: "tono" },
  { id: "plata", nombre: "Plata", css: "grayscale(0.85) brightness(1.06) contrast(0.98)", grupo: "tono" },
  { id: "cromo", nombre: "Cromo", css: "saturate(0.6) contrast(1.22) brightness(1.04)", grupo: "tono" },
  { id: "bruma", nombre: "Bruma", css: "blur(0.6px) brightness(1.04) saturate(0.95)", grupo: "clima" },
  { id: "vintage", nombre: "Vintage", css: "sepia(0.22) contrast(0.96) brightness(1.03) saturate(0.92)", grupo: "tono" },
  { id: "chispa", nombre: "Chispa", css: "saturate(1.4) contrast(1.1) brightness(1.02)", grupo: "color" }
];

export function filtroPorId(id) {
  return FILTROS.find((filtro) => filtro.id === id) || FILTROS[0];
}

/* ---------- 2. Ajustes de tono ---------- */

export const AJUSTES_BASE = {
  brillo: 1,
  contraste: 1,
  saturacion: 1,
  calidez: 0,
  exposicion: 0,
  desenfoque: 0,
  vineta: 0,
  grano: 0
};

export const LIMITES_AJUSTE = {
  brillo: [0.5, 1.5],
  contraste: [0.5, 1.5],
  saturacion: [0, 2],
  calidez: [-0.3, 0.3],
  exposicion: [-0.4, 0.4],
  desenfoque: [0, 4],
  vineta: [0, 1],
  grano: [0, 1]
};

export function esAjusteNeutro(ajustes) {
  return Object.entries(AJUSTES_BASE).every(([clave, valor]) => Number(ajustes?.[clave] ?? valor) === valor);
}

export function normalizarAjustes(ajustes) {
  const salida = { ...AJUSTES_BASE };
  Object.entries(LIMITES_AJUSTE).forEach(([clave, [minimo, maximo]]) => {
    const valor = Number(ajustes?.[clave]);
    if (Number.isFinite(valor)) salida[clave] = Math.min(maximo, Math.max(minimo, valor));
  });
  return salida;
}

/* La calidez no existe como función CSS: se resuelve con sepia más un
   giro de tono. El sepia nunca pasa de 0.35 para no volver la foto plana. */
export function cssAjustes(ajustes) {
  const a = normalizarAjustes(ajustes);
  const partes = [];
  const brillo = a.brillo * (1 + a.exposicion);
  if (brillo !== 1) partes.push(`brightness(${brillo.toFixed(3)})`);
  if (a.contraste !== 1) partes.push(`contrast(${a.contraste.toFixed(3)})`);
  if (a.saturacion !== 1) partes.push(`saturate(${a.saturacion.toFixed(3)})`);
  if (a.calidez !== 0) {
    const sepia = Math.min(0.35, Math.abs(a.calidez));
    partes.push(`sepia(${sepia.toFixed(3)})`);
    partes.push(a.calidez > 0 ? `hue-rotate(-8deg)` : `hue-rotate(8deg)`);
  }
  if (a.desenfoque > 0) partes.push(`blur(${a.desenfoque.toFixed(2)}px)`);
  return partes.length ? partes.join(" ") : "none";
}

/* ---------- 3. Filtro final (filtro + ajustes) ---------- */

export function cssCombinado(filtroId, ajustes, intensidad = 1) {
  const filtro = filtroPorId(filtroId);
  const fuerza = Math.min(1, Math.max(0, Number(intensidad) || 0));
  const partes = [];
  if (filtro.css !== "none" && fuerza > 0) {
    partes.push(fuerza >= 1 ? filtro.css : fundirFiltro(filtro.css, fuerza));
  }
  const ajustesCss = cssAjustes(ajustes);
  if (ajustesCss !== "none") partes.push(ajustesCss);
  return partes.length ? partes.join(" ") : "none";
}

/* A media intensidad un filtro se mezcla con la imagen original. */
function fundirFiltro(css, fuerza) {
  return css.replace(/(\w[\w-]*)\(([-\d.]+)(deg|px)?\)/g, (todo, nombre, valor, unidad) => {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return todo;
    const neutro = nombre === "brightness" || nombre === "saturate" || nombre === "contrast" ? 1 : 0;
    const mezclado = neutro + (numero - neutro) * fuerza;
    return `${nombre}(${mezclado.toFixed(3)}${unidad || ""})`;
  });
}

/* ---------- 4. Exportación ---------- */

export const MEDIDAS = {
  original: { nombre: "Original", ratio: null },
  "1:1": { nombre: "Cuadrada 1:1", ratio: 1 },
  "4:5": { nombre: "Retrato 4:5", ratio: 4 / 5 },
  "9:16": { nombre: "Vertical 9:16 (reel)", ratio: 9 / 16 },
  "16:9": { nombre: "Panorámica 16:9", ratio: 16 / 9 },
  "3:1": { nombre: "Portada 3:1", ratio: 3 }
};

export const CALIDADES = [
  { id: "alta", nombre: "Alta", escala: 1, jpeg: 0.92 },
  { id: "media", nombre: "Media", escala: 0.75, jpeg: 0.85 },
  { id: "ligera", nombre: "Ligera", escala: 0.5, jpeg: 0.78 }
];

export function calidadPorId(id) {
  return CALIDADES.find((calidad) => calidad.id === id) || CALIDADES[0];
}

/* Caja de recorte centrada para una medida dada. Se calcula en píxeles
   reales para que el archivo exportado no dependa del tamaño en pantalla. */
export function cajaRecorte(ancho, alto, medida) {
  const ratio = MEDIDAS[medida]?.ratio ?? null;
  if (!ratio || !ancho || !alto) return { x: 0, y: 0, ancho, alto };
  const ratioActual = ancho / alto;
  if (ratioActual > ratio) {
    const nuevoAncho = Math.round(alto * ratio);
    return { x: Math.round((ancho - nuevoAncho) / 2), y: 0, ancho: nuevoAncho, alto };
  }
  const nuevoAlto = Math.round(ancho / ratio);
  return { x: 0, y: Math.round((alto - nuevoAlto) / 2), ancho, alto: nuevoAlto };
}

/* ---------- 5. Música ---------- */

/* El inicio y el fin se guardan en segundos y siempre dentro de la pista.
   El fundido es de entrada y de salida; nunca rebasa la mitad del corte. */
export function recortarMusica({ inicio = 0, fin = 0, volumen = 0.8, fundidoEntrada = 0, fundidoSalida = 0, duracion = 0 } = {}) {
  const total = Math.max(0, Number(duracion) || 0);
  const arranque = Math.min(Math.max(0, Number(inicio) || 0), total || Infinity);
  const termino = fin ? Math.min(Math.max(arranque, Number(fin)), total || Infinity) : total;
  const largo = Math.max(0, (termino || total) - arranque);
  const mitad = largo / 2;
  return {
    inicio: Number(arranque.toFixed(2)),
    fin: Number((termino || total).toFixed(2)),
    duracion: Number(largo.toFixed(2)),
    volumen: Math.min(1, Math.max(0, Number(volumen) || 0)),
    fundidoEntrada: Math.min(mitad, Math.max(0, Number(fundidoEntrada) || 0)),
    fundidoSalida: Math.min(mitad, Math.max(0, Number(fundidoSalida) || 0))
  };
}

export function formatearTiempo(segundos) {
  const total = Math.max(0, Math.round(Number(segundos) || 0));
  const minutos = Math.floor(total / 60);
  const resto = total % 60;
  return `${minutos}:${String(resto).padStart(2, "0")}`;
}

/* ---------- 6. Receta del video ---------- */

/* El video no se vuelve a codificar en el navegador: se guarda la receta
   con todo lo que hay que aplicar y el servidor la respeta al procesar. */
export function recetaVideo({ duracion = 0, corte = {}, filtroId = "original", intensidad = 1, ajustes = {}, musica = null, texto = null, medida = "original" } = {}) {
  const total = Math.max(0, Number(duracion) || 0);
  const inicio = Math.min(Math.max(0, Number(corte.inicio) || 0), total || Infinity);
  const fin = corte.fin ? Math.min(Math.max(inicio, Number(corte.fin)), total || Infinity) : total;
  return {
    version: 1,
    medida,
    corte: {
      inicio: Number(inicio.toFixed(2)),
      fin: Number((fin || total).toFixed(2)),
      silenciar: Boolean(corte.silenciar)
    },
    filtro: { id: filtroPorId(filtroId).id, intensidad: Math.min(1, Math.max(0, Number(intensidad) || 0)), css: cssCombinado(filtroId, ajustes, intensidad) },
    ajustes: normalizarAjustes(ajustes),
    musica: musica && musica.trackId ? musica : null,
    texto: texto && texto.contenido ? texto : null
  };
}

export function validarReceta(receta) {
  const problemas = [];
  if (!receta || typeof receta !== "object") return ["La receta no es válida."];
  if (!receta.corte || receta.corte.fin < receta.corte.inicio) problemas.push("El fin del corte va antes del inicio.");
  if (receta.corte && receta.corte.fin === receta.corte.inicio) problemas.push("El corte no puede durar cero segundos.");
  if (receta.musica && receta.musica.fin && receta.musica.fin < receta.musica.inicio) problemas.push("La música termina antes de empezar.");
  return problemas;
}

/* ---------- 7. Texto sobre el medio ---------- */

export const POSICIONES = [
  { id: "arriba", nombre: "Arriba" },
  { id: "centro", nombre: "Centro" },
  { id: "abajo", nombre: "Abajo" }
];

export const TEXTOS_BASE = {
  contenido: "",
  posicion: "abajo",
  tamano: 1,
  color: "#ffffff",
  fondo: true
};

export function normalizarTexto(texto) {
  const base = { ...TEXTOS_BASE, ...(texto || {}) };
  return {
    contenido: String(base.contenido || "").slice(0, 140),
    posicion: POSICIONES.some((p) => p.id === base.posicion) ? base.posicion : "abajo",
    tamano: Math.min(2, Math.max(0.6, Number(base.tamano) || 1)),
    color: /^#[0-9a-fA-F]{6}$/.test(base.color) ? base.color : "#ffffff",
    fondo: Boolean(base.fondo)
  };
}

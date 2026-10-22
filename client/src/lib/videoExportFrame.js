import { cajaRecorte, calidadPorId, normalizarAjustes, normalizarTexto, cssFiltroVideo } from "./mediaStudio";
import { pintarTransicion } from "./videoTransitions";

export function medidasExportacion(ancho, alto, medida, calidad) {
  if (!(Number.isFinite(ancho) && ancho > 0 && Number.isFinite(alto) && alto > 0)) throw new Error("No se pudieron leer las dimensiones del primer clip.");
  const caja = cajaRecorte(ancho, alto, medida);
  const escala = Math.min(1, 1920 / Math.max(caja.ancho, caja.alto)) * calidadPorId(calidad).escala;
  return { width: Math.max(2, Math.floor(caja.ancho * escala / 2) * 2), height: Math.max(2, Math.floor(caja.alto * escala / 2) * 2) };
}

export function pintarCuadroExportado(ctx, source, previous, transition, receta, width, height) {
  ctx.save();
  ctx.filter = cssFiltroVideo({ type: "video", edit: receta });
  pintarTransicion(ctx, previous, source, transition, width, height, receta.medida !== "original");
  ctx.filter = "none";
  const ajustes = normalizarAjustes(receta.ajustes);
  if (ajustes.vineta > 0) {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.72);
    gradient.addColorStop(0, "rgba(0,0,0,0)"); gradient.addColorStop(1, `rgba(0,0,0,${0.75 * ajustes.vineta})`);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  }
  if (ajustes.grano > 0) {
    ctx.save(); ctx.globalAlpha = ajustes.grano * 0.2; ctx.globalCompositeOperation = "overlay";
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? "#fff" : "#000";
      ctx.fillRect(Math.random() * width, Math.random() * height, Math.max(1, width / 200), Math.max(1, height / 200));
    }
    ctx.restore();
  }
  const text = normalizarTexto(receta.texto);
  if (text.contenido.trim()) {
    const margin = width * 0.06;
    const size = Math.max(10, width * 0.055 * text.tamano);
    const lineHeight = size * 1.25;
    ctx.font = `700 ${size}px Inter, system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const lines = [];
    for (const paragraph of text.contenido.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > width - margin * 2) { lines.push(line); line = word; }
        else line = candidate;
      }
      lines.push(line);
    }
    const visible = lines.slice(0, Math.max(1, Math.floor((height - margin * 2) / lineHeight)));
    const block = visible.length * lineHeight;
    const start = text.posicion === "arriba" ? margin : text.posicion === "centro" ? (height - block) / 2 : height - margin - block;
    visible.forEach((line, i) => {
      const y = start + lineHeight * (i + 0.5);
      if (text.fondo) {
        const w = Math.min(width - margin * 2, ctx.measureText(line).width + margin / 2);
        ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect((width - w) / 2, y - lineHeight / 2, w, lineHeight);
      }
      ctx.fillStyle = text.color; ctx.fillText(line, width / 2, y, width - margin * 2);
    });
  }
  ctx.restore();
}

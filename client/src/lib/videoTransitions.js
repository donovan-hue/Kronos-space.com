import { normalizarTransicion } from "./mediaStudio";

export function transicionDeClip(clip, previo, siguiente) {
  return normalizarTransicion(clip?.transicion, Math.min(2, Math.max(0, previo) / 2, Math.max(0, siguiente) / 2));
}

export function pintarFuente(ctx, fuente, ancho, alto, recortar = false) {
  const w = fuente?.videoWidth || fuente?.naturalWidth || fuente?.width;
  const h = fuente?.videoHeight || fuente?.naturalHeight || fuente?.height;
  if (!w || !h) return;
  const escala = (recortar ? Math.max : Math.min)(ancho / w, alto / h);
  const x = (ancho - w * escala) / 2; const y = (alto - h * escala) / 2;
  // Las bandas forman parte del fotograma: también deben fundirse/barrerse.
  ctx.fillStyle = "#000";
  if (y > 0) { ctx.fillRect(0, 0, ancho, y); ctx.fillRect(0, alto - y, ancho, y); }
  if (x > 0) { ctx.fillRect(0, 0, x, alto); ctx.fillRect(ancho - x, 0, x, alto); }
  ctx.drawImage(fuente, x, y, w * escala, h * escala);
}

// El enlace se pinta sobre el comienzo de la toma entrante. No añade tiempo
// ni modifica los cortes: mantiene la suma de duraciones guardada del estudio.
export function pintarTransicion(ctx, anterior, actual, transicion, ancho, alto, recortar = false) {
  const p = Math.min(1, Math.max(0, transicion?.progreso ?? 1));
  const tipo = transicion?.tipo || "corte";
  ctx.save();
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, ancho, alto);
  if (!anterior || p >= 1 || tipo === "corte") pintarFuente(ctx, actual, ancho, alto, recortar);
  else if (tipo === "negro" || tipo === "blanco") {
    ctx.fillStyle = tipo === "negro" ? "#000" : "#fff"; ctx.fillRect(0, 0, ancho, alto);
    ctx.globalAlpha = p < 0.5 ? 1 - p * 2 : (p - 0.5) * 2;
    pintarFuente(ctx, p < 0.5 ? anterior : actual, ancho, alto, recortar);
  } else {
    pintarFuente(ctx, anterior, ancho, alto, recortar);
    if (tipo === "barrido") {
      ctx.beginPath(); ctx.rect(0, 0, ancho * p, alto); ctx.clip();
    } else {
      ctx.globalAlpha = p;
      if (tipo === "acercar") {
        const escala = 1 + (1 - p) * 0.15;
        ctx.translate(ancho / 2, alto / 2); ctx.scale(escala, escala); ctx.translate(-ancho / 2, -alto / 2);
      }
    }
    pintarFuente(ctx, actual, ancho, alto, recortar);
  }
  ctx.restore();
}

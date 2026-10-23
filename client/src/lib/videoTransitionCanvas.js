import { pintarFuente, pintarTransicion } from "./videoTransitions";

// Composición visual separada del reloj y de los controles nativos.
export function conectarLienzoTransiciones(video, canvas, clock, getSource) {
  let previous = null;
  let frame = null;
  let disposed = false;
  const ctx = canvas.getContext("2d");
  const parent = video.parentElement;
  const size = () => {
    const box = parent.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width)); const h = Math.max(1, Math.round(box.height));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  };
  const render = () => {
    if (disposed || !ctx) return;
    if (frame !== null) cancelAnimationFrame(frame); frame = null;
    const transition = clock.transition;
    if (!previous || !transition) { canvas.hidden = true; previous = null; return; }
    size(); canvas.hidden = false;
    const current = getSource();
    const ready = current?.tagName !== "VIDEO" || current.readyState >= 2;
    pintarTransicion(ctx, previous, ready ? current : previous, transition, canvas.width, canvas.height);
    if (!clock.paused && !clock.seeking && !document.hidden) frame = requestAnimationFrame(render);
  };
  const events = ["timeupdate", "playing", "loadedmetadata", "seeking", "seeked", "pause", "ended", "emptied"];
  for (const event of events) clock.addEventListener(event, render);
  window.addEventListener("resize", render);
  document.addEventListener("visibilitychange", render);
  return {
    capture() {
      if (!ctx) return;
      size();
      previous = document.createElement("canvas"); previous.width = canvas.width; previous.height = canvas.height;
      const context = previous.getContext("2d");
      context.fillStyle = "#000"; context.fillRect(0, 0, previous.width, previous.height);
      pintarFuente(context, getSource(), previous.width, previous.height);
    },
    dispose() {
      disposed = true; if (frame !== null) cancelAnimationFrame(frame);
      for (const event of events) clock.removeEventListener(event, render);
      window.removeEventListener("resize", render);
      document.removeEventListener("visibilitychange", render);
      previous = null; canvas.hidden = true;
    }
  };
}

import { test, expect, vi } from "vitest";
import { pintarFuente, pintarTransicion, transicionDeClip } from "../src/lib/videoTransitions";
import { medidasExportacion, pintarCuadroExportado } from "../src/lib/videoExportFrame";
import { formatoExportacion, exportarVideo } from "../src/lib/videoExport";

const source = { width: 100, height: 100 };
function context() {
  return Object.fromEntries(["save", "restore", "drawImage", "fillRect", "beginPath", "rect", "clip", "translate", "scale", "fillText"].map(key => [key, vi.fn()]));
}
test("límites de transición por vecinos, corte y datos inválidos", () => {
  expect(transicionDeClip({ transicion: { tipo: "fundido", duracion: 9 } }, 1, 4)).toEqual({ tipo: "fundido", duracion: 0.5 });
  expect(transicionDeClip({ transicion: { tipo: "inventado", duracion: 1 } }, 4, 4)).toEqual({ tipo: "corte", duracion: 0 });
  expect(transicionDeClip({ transicion: { tipo: "negro", duracion: 1 } }, 0, 4)).toEqual({ tipo: "negro", duracion: 0 });
});
test("encuadra sin deformar, incluye las bandas en la mezcla y permite recorte", () => {
  const ctx = context(); pintarFuente(ctx, source, 200, 100);
  expect(ctx.drawImage).toHaveBeenLastCalledWith(source, 50, 0, 100, 100); expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  pintarFuente(ctx, source, 200, 100, true); expect(ctx.drawImage).toHaveBeenLastCalledWith(source, 0, -50, 200, 200);
});
for (const tipo of ["corte", "fundido", "negro", "blanco", "barrido", "acercar"]) {
  test(`pinta ${tipo} y restaura el contexto al terminar`, () => {
    const ctx = context(); const next = { width: 200, height: 100 };
    pintarTransicion(ctx, source, next, { tipo, progreso: 0.5 }, 200, 100);
    expect(ctx.save).toHaveBeenCalledOnce(); expect(ctx.restore).toHaveBeenCalledOnce();
    if (tipo === "barrido") { expect(ctx.rect).toHaveBeenCalledWith(0, 0, 100, 100); expect(ctx.clip).toHaveBeenCalledOnce(); }
    if (tipo === "acercar") expect(ctx.scale).toHaveBeenCalledWith(1.075, 1.075);
    if (["negro", "blanco"].includes(tipo)) expect(ctx.globalAlpha).toBe(0);
    else expect(ctx.drawImage.mock.lastCall[0]).toBe(next);
  });
}
test("exporta medidas pares, sin ampliar y con el recorte/calidad elegidos", () => {
  expect(medidasExportacion(3840, 2160, "original", "alta")).toEqual({ width: 1920, height: 1080 });
  expect(medidasExportacion(1920, 1080, "1:1", "ligera")).toEqual({ width: 540, height: 540 });
  expect(medidasExportacion(101, 103, "original", "alta")).toEqual({ width: 100, height: 102 });
});
test("compone filtro, viñeta y texto literal después del video sin heredar el filtro", () => {
  const ctx = context(); const gradient = { addColorStop: vi.fn() }; ctx.createRadialGradient = vi.fn(() => gradient); ctx.measureText = text => ({ width: text.length * 9 });
  pintarCuadroExportado(ctx, source, null, null, { medida: "original", filtro: { id: "noir", intensidad: 1 }, ajustes: { vineta: 0.5 }, texto: { contenido: "<script>literal</script>\nSegunda línea", posicion: "arriba", color: "#ffffff", fondo: true, tamano: 1 } }, 400, 300);
  expect(ctx.drawImage).toHaveBeenCalled(); expect(gradient.addColorStop).toHaveBeenCalledTimes(2);
  expect(ctx.filter).toBe("none"); expect(ctx.fillText.mock.calls[0][0]).toBe("<script>literal</script>"); expect(ctx.fillText.mock.calls[1][0]).toBe("Segunda línea");
});
test("no promete un formato ni inicia exportación si falta soporte real", async () => {
  expect(formatoExportacion()).toBe("");
  await expect(exportarVideo({ clips: [], receta: {} })).rejects.toThrow(/navegador no permite/);
});

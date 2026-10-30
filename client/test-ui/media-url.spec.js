import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { mediaUrl } from "../src/services/mediaUrl";

/**
 * KRONOS-MEDIA-URL — `/uploads/` pertenece al backend, no a quien mira la foto.
 *
 * La función tenía una reserva `http://localhost:3000` para cuando no hay
 * `window`. El resultado era una URL que solo carga en la máquina de quien
 * programa: en el móvil de la red local, en el preview o en producción salía
 * una imagen rota con un origen inventado dentro. Aquí se fija el orden real
 * (API absoluta → origen del documento → dejar la ruta tal cual) y se bloquea
 * que la reserva vuelva.
 */

// Vitest no siempre expone `import.meta.url` como `file://` dentro del worker,
// así que la fuente se busca desde el directorio de trabajo (client, o la raíz
// del monorepo si alguien corre el binario desde ahí).
const RUTA_FUENTE = ["src/services/mediaUrl.js", "client/src/services/mediaUrl.js"]
  .map((relativo) => path.join(process.cwd(), relativo))
  .find((candidate) => fs.existsSync(candidate));

const FUENTE = RUTA_FUENTE ? fs.readFileSync(RUTA_FUENTE, "utf8") : "";

describe("mediaUrl", () => {
  it("con API absoluta, la base es la API y no el documento", () => {
    expect(mediaUrl("/uploads/a.png", "https://api.kronos-space.com/api", "https://kronos-space.com")).toBe(
      "https://api.kronos-space.com/uploads/a.png"
    );
  });

  it("con API relativa, la base es el origen desde el que se sirve la app", () => {
    expect(mediaUrl("/uploads/a.png", "/api", "http://192.168.1.24:3000")).toBe(
      "http://192.168.1.24:3000/uploads/a.png"
    );
  });

  it("sin origen y con API relativa devuelve la ruta, no un host inventado", () => {
    expect(mediaUrl("/uploads/a.png", "/api", "")).toBe("/uploads/a.png");
    expect(mediaUrl("/uploads/a.png", "", "")).toBe("/uploads/a.png");
  });

  it("lo que no es /uploads/ pasa intacto", () => {
    expect(mediaUrl("https://cdn.ejemplo.com/v.mp4", "/api", "")).toBe("https://cdn.ejemplo.com/v.mp4");
    expect(mediaUrl("/videos/a.mp4", "/api", "")).toBe("/videos/a.mp4");
    expect(mediaUrl("", "/api", "")).toBe("");
    expect(mediaUrl(undefined, "/api", "")).toBe("");
    expect(mediaUrl(null, "/api", "")).toBe("");
  });

  it("los valores por defecto usan el origen del documento, no uno inventado", () => {
    const resuelto = mediaUrl("/uploads/a.png");

    // En jsdom el documento tiene origen, así que la base sale de ahí. Lo que
    // se comprueba es el vínculo: origen del documento + /uploads/, nada más.
    expect(resuelto).toBe(`${window.location.origin}/uploads/a.png`);
  });

  it("el archivo ya no contiene la reserva localhost", () => {
    expect(RUTA_FUENTE, "el guard no encontró src/services/mediaUrl.js desde el cwd").toBeTruthy();

    // Se mira el código, no los comentarios: la explicación de por qué la
    // reserva se fue menciona la URL que reemplazó, y eso no puede contar.
    const codigo = FUENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    expect(codigo).not.toMatch(/localhost/);
    expect(codigo).not.toMatch(/origin\s*=\s*["'`]?https?:/);
  });
});

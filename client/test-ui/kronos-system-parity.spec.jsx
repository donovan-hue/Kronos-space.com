import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { KronosBrand } from "../src/components/brand/KronosBrand.jsx";

/**
 * PARIDAD CON EL SISTEMA VISUAL FIEL
 *
 * El lenguaje visual de Kronos vive en src/styles/kronos-system/, derivado
 * de Kronos-space-react y kronos.html. Conserva geometría y orden;
 * la paleta compartida es negro profundo y cromo espejo neutro. Estas pruebas vigilan tres cosas que se
 * rompen con facilidad y que nadie nota hasta que la interfaz se ve
 * distinta:
 *
 *   1. que el orden de carga del sistema no se altere (la cascada depende
 *      de él),
 *   2. que el puente del tema use los valores del sistema y no copias
 *      aproximadas que se van separando con el tiempo,
 *   3. que la marca se dibuje con sus cuatro capas.
 */

const raiz = process.cwd();
const sistema = path.join(raiz, "src/styles/kronos-system");
const leer = (rel) => fs.readFileSync(path.join(raiz, rel), "utf-8");

const archivosSistema = [
  "01-tokens.css",
  "02-theme.css",
  "03-buttons.css",
  "04-components.css",
  "05-layout.css",
  "06-cards.css",
  "07-states.css",
  "08-overlays.css",
  "09-splash.css",
  "10-utilities.css",
  "11-responsive.css",
];

describe("Paridad con el sistema visual fiel (Kronos-space-react)", () => {
  it("el sistema trae los once archivos del port, en orden", () => {
    expect(fs.existsSync(sistema)).toBe(true);
    for (const f of archivosSistema) {
      expect(fs.existsSync(path.join(sistema, f)), `falta ${f}`).toBe(true);
    }

    const indice = leer("src/styles/kronos-system/index.css");
    const posiciones = archivosSistema.map((f) => indice.indexOf(`./${f}`));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    // El índice los importa en el mismo orden en que los importaba kronos.html.
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });

  it("el punto de entrada carga el sistema antes del puente del tema", async () => {
    const main = leer("src/main.jsx");
    expect(main).toContain('import "./styles/app.css"');
    const entry = leer("src/styles/app.css");
    const sistemaEnMain = entry.indexOf("kronos-system/index.css");
    const puente = entry.indexOf("kronos-html-theme.css");
    expect(sistemaEnMain).toBeGreaterThan(-1);
    expect(puente).toBeGreaterThan(sistemaEnMain);
  });

  it("los tokens del puente son alias del sistema, no copias", () => {
    const puente = leer("src/styles/kronos-html-theme.css");
    for (const [alias, destino] of [
      ["--k-html-bg", "--bg"],
      ["--k-html-panel", "--panel"],
      ["--k-html-line", "--line"],
      ["--k-html-line-strong", "--line-2"],
      ["--k-html-silver", "--silver"],
      ["--k-html-dim", "--dim"],
      ["--k-html-dimmer", "--dimmer"],
      ["--k-html-chrome", "--chrome"],
      ["--k-html-soft-silver", "--soft-silver"],
      ["--k-html-ring", "--ks-ring"],
    ]) {
      expect(puente, `${alias} dejó de apuntar a ${destino}`).toContain(`${alias}: var(${destino})`);
    }
    // La geometría del port sigue; su paleta ya no es otra copia independiente.
    const tokens = leer("src/styles/kronos-system/01-tokens.css");
    for (const [alias, destino] of [
      ["--bg", "--k-bg"], ["--panel", "--k-surface"],
      ["--chrome", "--k-material-chrome"], ["--soft-silver", "--k-material-chrome-soft"],
      ["--ks-ring", "--k-material-chrome-ring"], ["--dim", "--k-muted"]
    ]) {
      expect(tokens).toContain(`${alias}:var(${destino})`);
    }
  });

  it("el puente ya no redefine las clases del sistema", () => {
    // Si alguna vuelve a aparecer aquí, vuelve a competir con el port y las
    // dos versiones se separan: el puente sólo describe clases propias (k-*).
    const puente = leer("src/styles/kronos-html-theme.css");
    for (const clase of [
      ".btn",
      ".card",
      ".tile",
      ".chip",
      ".badge",
      ".story",
      ".state",
      ".toast",
      ".sheet-bg",
      ".appbar",
      ".icon-btn",
      ".actions-row",
      ".splash",
      ".lockup",
      ".input-ring",
      ".silver",
      ".chrome",
      ".page-title",
      ".auth-wrap",
      ".avatar",
    ]) {
      const re = new RegExp(`^\\s*${clase.replace(".", "\\.")}\\s*[,{]`, "m");
      expect(re.test(puente), `el puente volvió a definir ${clase}`).toBe(false);
    }
  });

  it("el sistema define los elementos del lenguaje visual", () => {
    const todo = archivosSistema.map((f) => leer(`src/styles/kronos-system/${f}`)).join("\n");
    for (const clase of [
      ".brand",
      ".b-extrude",
      ".b-bevel",
      ".b-rim",
      ".b-face",
      ".btn",
      ".card",
      ".tile",
      ".chip",
      ".badge",
      ".state",
      ".toast",
      ".sheet",
      ".appbar",
      ".icon-btn",
      ".tabbar",
      ".seg",
      ".composer",
      ".reel",
      ".skel",
      ".splash",
      ".lockup",
      ".k-chevron",
    ]) {
      expect(todo, `el sistema no define ${clase}`).toContain(clase);
    }
    // Utilidades del port y protección de movimiento reducido.
    expect(todo).toContain("@media (prefers-reduced-motion:reduce)");
  });
});

describe("Marca KRONOS — sello cromado", () => {
  it("dibuja las cuatro capas y una sola copia accesible del texto", () => {
    const { container } = render(<KronosBrand />);
    const marca = container.querySelector(".brand");
    expect(marca).toBeTruthy();
    expect(marca.querySelectorAll(".lay").length).toBe(4);
    for (const capa of ["b-extrude", "b-bevel", "b-rim", "b-face"]) {
      expect(marca.querySelector(`.${capa}`)).toBeTruthy();
    }
    // Las tres capas decorativas están ocultas para lectores de pantalla.
    expect(marca.querySelectorAll('.lay[aria-hidden="true"]').length).toBe(3);
    expect(marca.querySelector(".b-face").textContent).toBe("KRONOS");
  });

  it("acepta un sello suelto y un tamaño concreto", () => {
    const { container } = render(<KronosBrand text="K" className="k-app-topbar-mark" size={0.95} />);
    const marca = container.querySelector(".brand.k-app-topbar-mark");
    expect(marca).toBeTruthy();
    expect(marca.querySelector(".b-face").textContent).toBe("K");
    expect(marca.style.fontSize).toBe("0.95rem");
  });

  it("la navegación, la barra superior y el panel usan la marca del sistema", () => {
    expect(leer("src/components/FanNav.jsx")).toContain("KronosBrand");
    expect(leer("src/layouts/AppLayout.jsx")).toContain("KronosBrand");
    expect(leer("src/components/navigation/MenuDrawer.jsx")).toContain("KronosBrand");
  });
});

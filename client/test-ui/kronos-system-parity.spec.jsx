import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { KronosBrand } from "../src/components/brand/KronosBrand.jsx";

/**
 * PARIDAD CON LA IDENTIDAD ÚNICA
 *
 * El lenguaje visual de Kronos vive hoy en UNA sola hoja: `src/styles/kronos.css`
 * (negro profundo + cromo líquido + reloj 3D en movimiento constante).
 * Antes esas reglas vivían repartidas entre `kronos-system/`,
 * `kronos-html-theme.css` y otras hojas por pantalla; hoy están fusionadas
 * y el bloque de identidad va al final para que sea lo último que manda.
 *
 * Estas pruebas vigilan tres cosas que se rompen con facilidad y que nadie
 * nota hasta que la interfaz se ve distinta:
 *
 *   1. que la cascada siga siendo una sola entrada y una sola hoja de
 *      producto (nada de capas que se tapen entre sí),
 *   2. que el puente del tema use los valores del sistema y no copias
 *      aproximadas que se van separando con el tiempo,
 *   3. que la marca se dibuje con sus cuatro capas.
 */

const raiz = process.cwd();
const leer = (rel) => fs.readFileSync(path.join(raiz, rel), "utf-8");
const hoja = leer("src/styles/kronos.css");

describe("Identidad única (negro profundo + cromo líquido)", () => {
  it("la app carga una sola entrada y una sola hoja de producto", () => {
    const main = leer("src/main.jsx");
    expect(main).toContain('import "./styles/app.css"');

    const entry = leer("src/styles/app.css");
    const imports = [...entry.matchAll(/@import\s+"([^"]+)"/g)].map((m) => m[1]);
    // Motor, vocabulario y producto. Nada más.
    expect(imports).toEqual(["./tailwind.css", "./design-tokens.css", "./kronos.css"]);

    // No queda ninguna hoja por pantalla ni capa de prioridades.
    const hojas = fs.readdirSync(path.join(raiz, "src/styles")).filter((f) => f.endsWith(".css"));
    expect(hojas.sort()).toEqual(["app.css", "design-tokens.css", "kronos.css", "tailwind.css"]);
    expect(fs.existsSync(path.join(raiz, "src/styles/priority.css"))).toBe(false);
    expect(fs.existsSync(path.join(raiz, "src/styles.css"))).toBe(false);
  });

  it("los tokens del puente son alias del sistema, no copias", () => {
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
      expect(hoja, `${alias} dejó de apuntar a ${destino}`).toContain(`${alias}: var(${destino})`);
    }
    // La geometría del port sigue; su paleta ya no es otra copia independiente.
    for (const [alias, destino] of [
      ["--bg", "--k-bg"],
      ["--panel", "--k-surface"],
      ["--chrome", "--k-material-chrome"],
      ["--soft-silver", "--k-material-chrome-soft"],
      ["--ks-ring", "--k-material-chrome-ring"],
      ["--dim", "--k-muted"],
    ]) {
      expect(hoja).toContain(`${alias}: var(${destino})`);
    }
  });

  it("la hoja define los elementos del lenguaje visual", () => {
    for (const clase of [
      ".brand",
      ".b-extrude",
      ".b-bevel",
      ".b-rim",
      ".b-face",
      ".chrome",
      ".silver",
      ".k-app-topbar",
      ".k-navigation-item",
      ".k-live-clock",
      ".k-clock-svg",
    ]) {
      expect(hoja, `la identidad no define ${clase}`).toContain(clase);
    }
    // Utilidades del port y protección de movimiento reducido.
    expect(hoja).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("el bloque de identidad va al final: es lo último que manda", () => {
    const puente = hoja.indexOf("--k-html-bg: var(--bg)");
    const cromo = hoja.lastIndexOf("--k-material-chrome");
    expect(puente).toBeGreaterThan(-1);
    // Los alias del puente y los materiales del cromo se resuelven antes de
    // que la identidad tenga su última palabra.
    expect(cromo).toBeGreaterThan(0);
  });

  it("el reloj 3D sigue en movimiento constante", () => {
    // El reloj es SVG + JS (KronosClock.jsx); su CSS sólo lo Dimensiona y
    // respeta el movimiento reducido. Ninguna regla lo congela.
    expect(hoja).toContain(".k-live-clock");
    expect(hoja).toContain(".k-clock-svg");
    expect(leer("src/components/brand/KronosClock.jsx")).toContain("requestAnimationFrame");
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

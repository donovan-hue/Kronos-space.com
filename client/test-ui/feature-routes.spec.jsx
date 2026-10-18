import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, matchPath } from "react-router-dom";
import { ALIAS, MAPA_PANTALLAS, completarRuta, destinoPantalla } from "../src/lib/screenIndex";
import FeatureDetail from "../src/features/system/FeatureDetail";
import AdminRoute from "../src/routes/AdminRoute";

const pantallas = MAPA_PANTALLAS.flatMap((area) => area.pantallas);
const appSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/App.jsx"), "utf8");
const rutas = [...appSource.matchAll(/<Route\s+(?:[^>]*\s)?path="([^"]+)"/g)].map((match) => match[1]).filter((ruta) => ruta !== "*");

afterEach(cleanup);

function ficha(id, user = { role: "user" }) {
  return render(<MemoryRouter initialEntries={[`/funciones/${id}`]}><Routes>
    <Route path="/funciones/:featureId" element={<FeatureDetail user={user} />} />
    <Route path="/post/:id" element={<p>Publicación seleccionada</p>} />
  </Routes></MemoryRouter>);
}

test("cada función tiene id único, dirección y destino resoluble sin recurrir al 404", () => {
  expect(new Set(pantallas.map((p) => p.id)).size).toBe(pantallas.length);
  pantallas.forEach((pantalla) => {
    expect(pantalla.ruta).toBeTruthy();
    const destino = destinoPantalla(pantalla);
    expect(destino).not.toMatch(/[:*]/);
    expect(rutas.some((ruta) => matchPath({ path: ruta, end: true }, destino)), destino).toBe(true);
    expect(rutas.some((ruta) => matchPath({ path: ruta, end: true }, pantalla.rutaFicha))).toBe(true);
  });
});

test("el directorio cubre todas las pantallas y alias declarados en el router", () => {
  const indexadas = new Set([
    ...pantallas.map((p) => p.ruta),
    ...pantallas.flatMap((p) => p.alias || []),
    ...Object.keys(ALIAS),
    "/funciones", "/funciones/:featureId"
  ]);
  rutas.forEach((ruta) => expect(indexadas.has(ruta), `Falta ${ruta} en el directorio`).toBe(true));
  for (const alias of pantallas.flatMap((p) => p.alias || [])) expect(rutas).toContain(alias);
});

test("la ficha de una ruta dinámica exige identificador y abre el recurso elegido", () => {
  ficha("publicacion");
  expect(screen.queryByRole("link", { name: "Abrir función" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Identificador de publicación"), { target: { value: "post-prueba" } });
  fireEvent.click(screen.getByRole("button", { name: "Abrir función" }));
  expect(screen.getByText("Publicación seleccionada")).toBeTruthy();
});

test("los parámetros no permiten escapar de su segmento ni rutas vacías", () => {
  ["", "..", ".", "../admin", "otra/ruta", "con espacio", "x?y", "x#y", "x\\y"].forEach((id) => {
    expect(() => completarRuta("/post/:id", { id })).toThrow();
  });
  expect(completarRuta("/profile/:username", { username: "hola.mundo" })).toBe("/profile/hola.mundo");
});

test("una función pendiente no tiene un botón que prometa servicio operativo", () => {
  ficha("proyectos");
  expect(screen.getByRole("heading", { name: "Proyectos" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("todavía no tiene una herramienta construida");
  expect(screen.queryByRole("link", { name: "Abrir función" })).toBeNull();
});

test("una ficha desconocida conserva el estado no encontrado", () => {
  ficha("inventada");
  expect(screen.getByRole("region", { name: "Página no encontrada" })).toBeTruthy();
});

test("Administración es visible como restringida y no monta herramientas para usuarios comunes", () => {
  ficha("administracion");
  expect(screen.getByRole("status").textContent).toContain("Solo administradores");
  expect(screen.queryByRole("link", { name: "Abrir función" })).toBeNull();
});

test("la guarda administrativa no monta sus hijos sin rol y sí los monta con rol admin", () => {
  const herramienta = vi.fn(() => <p>Controles administrativos</p>);
  const Herramienta = herramienta;
  const ui = (role) => <MemoryRouter><AdminRoute user={{ role }}><Herramienta /></AdminRoute></MemoryRouter>;
  const view = render(ui("user"));
  expect(herramienta).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Acceso restringido" })).toBeTruthy();
  view.rerender(ui("admin"));
  expect(screen.getByText("Controles administrativos")).toBeTruthy();
});


test("la documentación de rutas coincide con el catálogo", () => {
  expect(() => execFileSync(process.execPath, [resolve(dirname(fileURLToPath(import.meta.url)), "../../scripts/ci/generate-route-docs.mjs"), "--check"], { encoding: "utf8" })).not.toThrow();
});

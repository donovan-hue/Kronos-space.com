import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CreateHub from "../src/features/social/CreateHub";
import TabBar from "../src/components/navigation/TabBar";

test("centro de creación conecta solo destinos funcionales", () => {
  render(
    <MemoryRouter>
      <CreateHub />
    </MemoryRouter>
  );

  expect(screen.getByRole("heading", { name: "Tu espacio para crear" })).toBeTruthy();
  expect(screen.getAllByRole("link", { name: /Nueva publicación/ }).length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: /Crear con Kairos/ }).getAttribute("href")).toBe("/kairos");
  expect(screen.getByRole("link", { name: /Biblioteca multimedia/ }).getAttribute("href")).toBe("/library");
  expect(screen.getByRole("link", { name: /Guardados y colecciones/ }).getAttribute("href")).toBe("/saved");
  expect(screen.queryByText(/próximamente|llegará pronto/i)).toBeNull();
});

test("la barra inferior fija cinco destinos; los de bandeja suben a la barra superior", () => {
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <TabBar />
    </MemoryRouter>
  );

  const barra = screen.getByRole("navigation", { name: "Navegación principal" });
  expect(barra.querySelectorAll("a")).toHaveLength(5);
  for (const path of ["/home", "/explore", "/create", "/kairos", "/profile"]) {
    expect(barra.querySelector(`a[href="${path}"]`), `${path} debe estar en la barra`).toBeTruthy();
  }
  // Mensajes y Notificaciones no se duplican abajo: viven en los accesos superiores.
  expect(barra.querySelector("a[href=\"/notifications\"]")).toBeNull();
  expect(barra.querySelector("a[href=\"/messages\"]")).toBeNull();
});

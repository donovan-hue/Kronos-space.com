import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CreateHub from "../src/features/social/CreateHub";
import FanNav from "../src/components/FanNav";

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

test("navegación móvil mantiene cinco destinos y deja notificaciones en el acceso superior", () => {
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <FanNav />
    </MemoryRouter>
  );

  const mobileNavigation = screen.getByRole("navigation", { name: "Navegación social móvil" });
  expect(mobileNavigation.querySelectorAll("a")).toHaveLength(5);
  expect(mobileNavigation.querySelector("a[href=\"/create\"]")).toBeTruthy();
  expect(mobileNavigation.querySelector("a[href=\"/profile\"]")).toBeTruthy();
  expect(mobileNavigation.querySelector("a[href=\"/notifications\"]")).toBeNull();
});

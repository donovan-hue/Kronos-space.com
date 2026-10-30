import { describe, expect, it } from "vitest";

import {
  NAV_GROUPS,
  SECTION_LABELS,
  SECCIONES_RESUELTAS,
  TABLA_DE_SECCIONES,
  TAB_ITEM_IDS,
  getCurrentSection
} from "../src/navigation/model.jsx";

/**
 * KRONOS-NAV-SECCIONES — la sección activa se deriva, no se recuerda.
 *
 * `getCurrentSection` decidía su respuesta en una cadena de diecinueve `if` con
 * prefijos escritos a mano, mientras el modelo de navegación (`NAV_GROUPS`)
 * vivía en el mismo archivo con sus rutas. Dos listas contando lo mismo: la
 * segunda siempre se olvida de alguien. Aquí se bloquea que vuelva a pasar: si
 * un destino entra en el menú, su sección funciona sola; si alguien añade una
 * sección sin etiqueta o una etiqueta sin rutas, esta prueba lo dice.
 */

const destinosDelMenu = () => {
  const pares = [];

  for (const grupo of NAV_GROUPS) {
    for (const item of grupo.items ?? []) {
      pares.push({ id: item.id, to: item.to });

      for (const hijo of item.children ?? []) pares.push({ id: item.id, to: hijo.to });
    }
  }

  return pares;
};

describe("la tabla de secciones se deriva del modelo de navegación", () => {
  it("cada destino del menú marca su propia sección", () => {
    const malos = destinosDelMenu()
      .map(({ id, to }) => ({ id, to, obtenido: getCurrentSection(to) }))
      .filter((par) => par.obtenido !== par.id);

    expect(malos).toEqual([]);
  });

  it("cada destino del menú es también un prefijo de la tabla", () => {
    const rutas = new Set(TABLA_DE_SECCIONES.prefijos.map((p) => p.ruta));

    for (const { to } of destinosDelMenu()) expect(rutas.has(to)).toBe(true);
  });

  it("ninguna sección que la tabla produce se queda sin etiqueta", () => {
    const sinEtiqueta = SECCIONES_RESUELTAS.filter((id) => !SECTION_LABELS[id]);

    expect(sinEtiqueta).toEqual([]);
  });

  it("no hay etiquetas huérfanas: toda etiqueta sale de la tabla", () => {
    const inventadas = Object.keys(SECTION_LABELS).filter((id) => !SECCIONES_RESUELTAS.includes(id));

    expect(inventadas).toEqual([]);
  });

  it("los cinco destinos de la barra inferior tienen etiqueta", () => {
    for (const id of TAB_ITEM_IDS) expect(typeof SECTION_LABELS[id]).toBe("string");
  });
});

describe("comportamiento observado, ruta por ruta", () => {
  // Corpus intencionalmente igual a lo que devolvía la cadena de `if`: así se
  // puede afirmar que derivar la tabla no cambió ni una respuesta conocida.
  const ESPERADO = {
    "/home": "home",
    "/feed": "home",
    "/social": "home",
    "/pulse": "pulse",
    "/pulse/2026-10-29": "pulse",
    "/vertical": "vertical",
    "/explore": "explore",
    "/search": "explore",
    "/users": "explore",
    "/create": "create",
    "/create/video": "create",
    "/messages": "messages",
    "/messages/hilo-1": "messages",
    "/conversations": "groups",
    "/conversations/grupo7": "groups",
    "/live": "live",
    "/live/sala-1": "live",
    "/circles": "circles",
    "/capsules": "capsules",
    "/capsules/c-1": "capsules",
    "/analytics": "analytics",
    "/saved": "saved",
    "/profile": "profile",
    "/profile/ana": "profile",
    "/users/ana": "profile",
    "/support": "profile",
    "/support/123": "profile",
    "/post/abc123": "post",
    "/kairos": "kairos",
    "/kairos/studio": "kairos",
    "/ai": "kairos",
    "/projects": "kairos",
    "/library": "kairos",
    "/settings": "settings",
    "/settings/privacy": "settings",
    "/admin": "settings",
    "/admin/moderacion": "settings",
    "/moderation": "moderation"
  };

  for (const [ruta, seccion] of Object.entries(ESPERADO)) {
    it(`${ruta} → ${seccion}`, () => {
      expect(getCurrentSection(ruta)).toBe(seccion);
    });
  }

  it("la raíz y lo desconocido no eligen sección", () => {
    expect(getCurrentSection("/")).toBe("");
    expect(getCurrentSection("")).toBe("");
    expect(getCurrentSection(undefined)).toBe("");
    expect(getCurrentSection("/no-existe")).toBe("");
  });

  it("un prefijo no se traga a los vecinos que empiezan igual", () => {
    expect(getCurrentSection("/homepage")).toBe("");
    expect(getCurrentSection("/profilex")).toBe("");
    expect(getCurrentSection("/post")).toBe("");
    expect(getCurrentSection("/userfiles/ana")).toBe("");
  });
});

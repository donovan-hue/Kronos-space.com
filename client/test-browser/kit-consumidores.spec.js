// KRONOS-NO-MOCK — datos y /api del helper kit: mide cómo se planta el kit (skeleton, capas, anchos) con respuestas fijas; ningún dato viene del backend.

import { test, expect } from '@playwright/test';
import { OTRA, IMAGEN, fixture, abrirApp, asentar, medir, caja } from './helpers/kit.js';

/*
 * CONSUMIDORES DEL KIT — geometria y tipografia medidas en navegador real.
 *
 * El proyecto escribe clases de Tailwind en su kit (dialogos, menus,
 * recortador) y, hasta el 2026-10-13, no tenia motor que las convirtiera en
 * CSS: geometrias enteras dependian de parches escritos a mano. Con el motor
 * encendido quedan dos formas de que una clase no haga lo que dice:
 *
 *   1. la utilidad no compila (clase inerte), o
 *   2. la utilidad compila pero otra regla le gana la cascada.
 *
 * El caso 1 lo vigila `scripts/ci/barrido-utilidades.mjs` contra el CSS
 * construido. El caso 2 solo se ve midiendo: por eso esta spec abre cada
 * consumidor y comprueba el valor efectivo que pide el codigo. Los dos casos
 * ya ocurrieron de verdad: `gap-3` rendia 12.8px por un `.grid` del tema y el
 * reseteo `*{margin:0}` anulaba todo margen declarado con utilidad.
 *
 * La antesala (cuenta de prueba, rutas simuladas, ayudantes de medida) vive
 * en `helpers/kit.js`, compartida con `kit-accesibilidad.spec.js`.
 */

test('el estado de carga de una ruta diferida conserva su geometria', async ({ page }) => {
  // La ruta diferida tarda a proposito: asi se puede medir el estado de carga.
  await page.route(/(assets|src)\/.*Capsules/i, async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    return route.continue();
  });
  await fixture(page);
  await abrirApp(page, '/home');

  // Se viaja a una ruta diferida: mientras su trozo baja, la app muestra el
  // estado de carga. Ese instante es el que se mide, y se mide TODO de una vez:
  // entre una consulta y la siguiente el trozo puede llegar y la pantalla
  // cambiar (medirlo por partes dio valores vacios en el CI).
  await page.getByRole('link', { name: /Cápsulas/ }).first().click();
  const contenedor = 'div[role="status"][aria-busy="true"]:has(> span[aria-hidden="true"])';
  await expect(page.locator(contenedor)).toBeVisible({ timeout: 15000 });
  // La transicion de ruta escala el plano entrante: medir a media transicion da
  // el giro a 45px en vez de 32. Se espera a que asiente.
  await asentar(page);

  const medida = await page.evaluate((sel) => {
    const caja = document.querySelector(sel);
    const cs = getComputedStyle(caja);
    const giro = caja.querySelector(':scope > span[aria-hidden="true"]');
    const csGiro = getComputedStyle(giro);
    const r = caja.getBoundingClientRect();
    const g = giro.getBoundingClientRect();
    const etiqueta = caja.querySelector(':scope > span.sr-only');
    return {
      display: cs.display,
      alignItems: cs.alignItems,
      justifyContent: cs.justifyContent,
      minAlto: parseFloat(cs.minHeight),
      caja: { x: r.x, y: r.y, ancho: r.width, alto: r.height },
      giro: {
        x: g.x, y: g.y, ancho: g.width, alto: g.height,
        // El tamano medido por estilo computado no lo altera el escalado de la
        // transicion de ruta; el rectangulo si. El tamano se afirma con este.
        anchoCalculado: parseFloat(csGiro.width),
        altoCalculado: parseFloat(csGiro.height),
        radio: parseFloat(csGiro.borderTopLeftRadius),
        animacion: csGiro.animationName
      },
      etiquetaAncho: etiqueta ? etiqueta.getBoundingClientRect().width : null
    };
  }, contenedor);

  const altura = page.viewportSize().height;
  expect(medida.display).toBe('flex');
  expect(medida.alignItems).toBe('center');
  expect(medida.justifyContent).toBe('center');
  expect(medida.minAlto).toBeCloseTo(altura / 2, 0);
  expect(medida.caja.alto).toBeGreaterThanOrEqual(altura / 2 - 40);

  // El giro: 32px, redondo y girando.
  expect(medida.giro.anchoCalculado).toBeCloseTo(32, 0);
  expect(medida.giro.altoCalculado).toBeCloseTo(32, 0);
  expect(medida.giro.radio).toBeGreaterThanOrEqual(16);
  expect(medida.giro.animacion).not.toBe('none');

  // Queda centrado en su contenedor (el margen es amplio porque comparte la
  // fila con la etiqueta para lectores de pantalla, que mide 1px).
  expect(Math.abs(medida.giro.x + medida.giro.ancho / 2 - (medida.caja.x + medida.caja.ancho / 2))).toBeLessThanOrEqual(60);
  expect(Math.abs(medida.giro.y + medida.giro.alto / 2 - (medida.caja.y + medida.caja.alto / 2))).toBeLessThanOrEqual(2);

  // La etiqueta para lectores de pantalla sigue existiendo y sigue oculta.
  expect(medida.etiquetaAncho).not.toBeNull();
  expect(medida.etiquetaAncho).toBeLessThanOrEqual(1);
});

test('el panel de atajos toma el ancho, el hueco y el centrado que pide', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/home');
  await page.keyboard.press('?');
  await asentar(page);

  const cajaDialogo = '[data-slot="dialog-content"]';
  const rect = await caja(page, cajaDialogo);
  const ancho = page.viewportSize().width;
  const alto = page.viewportSize().height;

  expect(await medir(page, cajaDialogo, 'position')).toBe('fixed');
  expect(await medir(page, cajaDialogo, 'z-index')).toBe((await medir(page, 'html', '--k-z-modal')).trim());
  expect(rect.ancho).toBe(Math.min(520, ancho - 40));
  expect(Math.abs(rect.x + rect.ancho / 2 - ancho / 2)).toBeLessThanOrEqual(2);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.y + rect.alto).toBeLessThanOrEqual(alto);

  // `gap-3` del kit: 12px en la escala del proyecto.
  expect(parseFloat(await medir(page, cajaDialogo, 'row-gap'))).toBeCloseTo(12, 0);
  expect(await medir(page, cajaDialogo, 'padding-top')).toBe('24px');
  expect(await medir(page, '[data-slot="dialog-title"]', 'font-size')).toBe('18px');

  const fondo = await caja(page, '[data-slot="dialog-overlay"]');
  expect(fondo.ancho).toBe(ancho);
  expect(fondo.alto).toBe(alto);
  expect(await medir(page, '[data-slot="dialog-overlay"]', 'z-index')).toBe((await medir(page, 'html', '--k-z-overlay')).trim());
});

test('el dialogo de reporte conserva su formulario en rejilla', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/home');
  await page.getByLabel('Más opciones de la publicación').first().click();
  await page.getByRole('menuitem', { name: 'Reportar' }).first().click();
  await asentar(page);

  const cajaDialogo = '[data-slot="dialog-content"]';
  const rect = await caja(page, cajaDialogo);
  expect(await medir(page, cajaDialogo, 'position')).toBe('fixed');
  expect(rect.ancho).toBe(Math.min(520, page.viewportSize().width - 40));
  expect(await medir(page, `${cajaDialogo} form`, 'display')).toBe('grid');
  // `gap-4` del kit: 16px, no el 12.8px que rendia con la cascada vieja.
  expect(parseFloat(await medir(page, `${cajaDialogo} form`, 'row-gap'))).toBeCloseTo(16, 0);
  expect(rect.y + rect.alto).toBeLessThanOrEqual(page.viewportSize().height);
});

test('el dialogo de seguidores respeta el ancho y el hueco que pide la pantalla', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/profile');
  await page.locator('.k-profile-stat-button').first().click();
  await asentar(page);

  const cajaDialogo = '[data-slot="dialog-content"]';
  const rect = await caja(page, cajaDialogo);
  const pedido = Math.min(620, page.viewportSize().width - 40);
  expect(rect.ancho).toBe(pedido);
  expect(Math.abs(rect.x + rect.ancho / 2 - page.viewportSize().width / 2)).toBeLessThanOrEqual(2);
  expect(parseFloat(await medir(page, cajaDialogo, 'row-gap'))).toBeCloseTo(16, 0);
  expect(await medir(page, cajaDialogo, 'overflow-y')).toBe('auto');
  // Su tope de alto queda utilizable en la pantalla.
  expect(rect.y + rect.alto).toBeLessThanOrEqual(page.viewportSize().height);
});

test('el dialogo de apoyo del perfil ajeno conserva ancho y pie', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, `/users/${OTRA._id}`);
  await page.getByRole('button', { name: 'Apoyar' }).first().click();
  await asentar(page);

  const cajaDialogo = '[data-slot="dialog-content"]';
  const rect = await caja(page, cajaDialogo);
  expect(await medir(page, cajaDialogo, 'position')).toBe('fixed');
  expect(rect.ancho).toBe(Math.min(440, page.viewportSize().width - 32));
  expect(Math.abs(rect.x + rect.ancho / 2 - page.viewportSize().width / 2)).toBeLessThanOrEqual(2);

  const pie = `${cajaDialogo} [data-slot="dialog-footer"]`;
  expect(await medir(page, pie, 'justify-content')).toBe('flex-end');
  // `mt-1` del pie: el reseteo global lo anulaba en silencio antes del arreglo.
  expect(parseFloat(await medir(page, pie, 'margin-top'))).toBeCloseTo(4, 0);
});

test('el recortador centra su caja una sola vez', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/profile');
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'portada.png',
    mimeType: 'image/png',
    buffer: IMAGEN
  });

  await asentar(page);
  const cajaEditor = '.k-image-editor-dialog';
  const rect = await caja(page, cajaEditor);
  expect(rect.ancho).toBeGreaterThan(300);
  // Centrado único en el CSS del diálogo, sin una segunda traslación del motor.
  expect(await medir(page, cajaEditor, 'translate')).toBe('none');
  expect(Math.abs(rect.x + rect.ancho / 2 - page.viewportSize().width / 2)).toBeLessThanOrEqual(2);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.y + rect.alto).toBeLessThanOrEqual(page.viewportSize().height + 1);
});

test('el cajon de secciones del telefono conserva su ancho declarado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await abrirApp(page, '/home');
  await page.getByLabel('Abrir más secciones').first().click();
  await asentar(page);

  const panel = await caja(page, '.k-drawer-panel');
  expect(await medir(page, '.k-drawer-panel', 'position')).toBe('fixed');
  expect(panel.x).toBe(0);
  expect(panel.ancho).toBe(Math.round(Math.min(340, 390 * 0.86)));
  expect(panel.alto).toBeLessThanOrEqual(845);
});


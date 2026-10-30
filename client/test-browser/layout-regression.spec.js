// KRONOS-NO-MOCK — /api sustituido por helpers/layout.js para congelar el contenido: el contrato que se comprueba es de capas y desbordamiento, no de datos.

import { test, expect } from '@playwright/test';
import { layoutFixture } from './helpers/layout.js';
import { IMAGEN } from './helpers/kit.js';

const routes = [
  ['/home', '.k-post-poll-option'], ['/create', '.k-create-hub-hero'],
  ['/create/post', '.k-composer-publish-actions'],
  ['/circles', '.k-circle-card'],
  ['/capsules', '.k-capsules-layout'], ['/kairos', '.k-kairos-tool'],
  ['/kairos/image', '.k-history-item'], ['/kairos/video', '.k-ai-form'],
  ['/kairos/script', '.k-ai-form'], ['/kairos/history', '.k-history-row'],
  ['/kairos/studio', '.k-composer'], ['/kairos/video/jobs', '.video-job'],
  ['/library', '.media-library-item'], ['/projects', '.k-projects-create'],
  ['/projects/plantillas', '.k-templates-grid'], ['/settings', '.k-settings-section'],
  ['/profile', '.profile-info'], ['/saved', '.k-collections-panel'],
  ['/vertical', '.k-vertical-header'], ['/stories/archive', '.k-story-archive-card'],
  ['/notifications', '.k-page-header'], ['/post/post-layout', '.post-detail-page'],
  ['/explore', '.k-filter-row'],
];
const sizes = [320, 375, 390, 768, 834, 1024, 1280, 1440, 1920];

async function open(page, route, selector) {
  await page.goto(route);
  await expect(page.locator(selector).first()).toBeVisible();
  // La transición de ruta dura 200 ms. Medir en reposo, no a mitad del zoom.
  await page.waitForTimeout(250);
}
async function noOverflow(page) {
  const data = await page.locator('.k-route-view > .page').evaluate(el => {
    const r = el.getBoundingClientRect();
    return { x: r.x, right: r.right, client: el.clientWidth, scroll: el.scrollWidth, viewport: innerWidth, document: document.documentElement.scrollWidth };
  });
  expect(data.x).toBeGreaterThanOrEqual(0);
  expect(data.right).toBeLessThanOrEqual(data.viewport + 1);
  expect(data.scroll).toBeLessThanOrEqual(data.client + 2);
  expect(data.document).toBeLessThanOrEqual(data.viewport + 2);
}

for (const width of sizes) {
  test(`23 rutas sin desbordamiento y un h1 · ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 844 });
    await layoutFixture(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [route, selector] of routes) {
      await test.step(route, async () => {
        await open(page, route, selector);
        await noOverflow(page);
        await expect(page.locator('.k-route-view > .page h1')).toHaveCount(1);
      });
    }
    expect(errors).toEqual([]);
  });
}

for (const width of [320, 768, 1440]) {
  test(`capas abiertas y acciones alcanzables · ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await layoutFixture(page);
    await open(page, '/home', '.k-post-poll-option');
    // El mapa orbital 3D se retiró: la tecla G ya no abre ninguna capa.
    await page.keyboard.press('g');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: /Ver en pantalla completa:/ }).first().click();
    const viewer = page.locator('body > .k-media-viewer');
    await expect(viewer).toBeVisible();
    const box = await viewer.boundingBox();
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.y)).toBe(0);
    expect(Math.round(box.width)).toBe(width);
    expect(Math.round(box.height)).toBe(844);
    await page.getByRole('button', { name: 'Cerrar visor' }).click();

    await open(page, '/create/post', '.k-composer');
    await page.getByRole('button', { name: 'Añadir encuesta', exact: true }).click();
    await page.getByRole('button', { name: 'Añadir evento', exact: true }).click();
    await noOverflow(page);
    const publish = page.getByRole('button', { name: 'Publicar', exact: true });
    await publish.scrollIntoViewIfNeeded();
    const position = await publish.boundingBox();
    // La barra inferior se pinta a cualquier ancho: nunca debe tapar Publicar.
    const nav = await page.locator('.k-app-tabbar').boundingBox();
    expect(position.y + position.height).toBeLessThanOrEqual(nav.y);
    // Edición de una foto: la pantalla completa no queda anclada al compositor.
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'prueba.png', mimeType: 'image/png', buffer: IMAGEN });
    await expect(page.locator('body > .k-studio')).toBeVisible();
    const studio = await page.locator('body > .k-studio').boundingBox();
    expect(Math.round(studio.width)).toBe(width);
    expect(Math.round(studio.height)).toBe(844);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).last().click();
  });
}

test('recuperación y verificación caben en 320 px y en tablet', async ({ page }) => {
  for (const width of [320, 834]) {
    await page.setViewportSize({ width, height: 600 });
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    for (const route of ['/forgot-password', '/reset-password', '/verify-email']) {
      await open(page, route, '.k-auth-page');
      await expect(page.locator('h1')).toHaveCount(1);
      const data = await page.locator('.k-auth-page').evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      expect(data.scroll).toBeLessThanOrEqual(data.client + 1);
      await expect(page.locator('.k-exact-landing-root')).toHaveCount(0);
    }
  }
});

test('aviso sin conexión comparte cabecera, no tapa los accesos', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await layoutFixture(page);
  await open(page, '/home', '.k-feed-page');
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('.k-app-topbar > .k-offline-notice')).toBeVisible();
  await page.getByRole('button', { name: /Abrir búsqueda global/ }).click();
  await expect(page.getByRole('dialog', { name: 'Búsqueda global' })).toBeVisible();
});

for (const width of [320, 768, 1024]) {
  test(`paneles secundarios y anchos por familia · ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await layoutFixture(page, { admin: true });
    for (const [route, selector] of [
      ['/analytics', '.analytics-grid'], ['/admin', '.k-session-item'],
      ['/messages/other', '.k-message-composer'], ['/conversations/group-layout', '.k-message-composer'],
      ['/moderation', '.k-tabs'], ['/saved', '.k-collections-panel'],
    ]) {
      await open(page, route, selector);
      await noOverflow(page);
    }
    // El máximo de cada familia se aplica también en el DOM real animado.
    for (const [route, selector, max] of [['/home', '.k-feed-page', 660], ['/create', '.k-create-hub', 1040], ['/create/post', '.k-create-page', 720]]) {
      await open(page, route, selector);
      const measured = await page.locator(selector).evaluate(el => ({ width: el.getBoundingClientRect().width, main: el.closest('.k-main-content').clientWidth }));
      const gutter = width <= 700 ? 24 : width <= 1024 ? 32 : 48;
      expect(measured.width).toBeCloseTo(Math.min(max, measured.main - gutter), 0);
    }
  });
}

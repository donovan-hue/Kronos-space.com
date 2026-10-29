// KRONOS-NO-MOCK — sesión y /api simulados: se observan ciclo de vida, resize e historial de las capas de navegación, con el backend fuera de la foto.

import { test, expect } from '@playwright/test';

// Real browser + production components/CSS; deterministic API fixtures.
// This suite validates UI interaction, not backend integration/authentication.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: {
    user: { _id: 'audit', username: 'audit' }, posts: [], users: [], stories: [],
    flags: {}, notifications: [], items: [], topics: [],
  } }));
  await page.route('**/socket.io/**', route => route.fulfill({
    body: '0{"sid":"audit","upgrades":[],"pingInterval":1000000,"pingTimeout":1000000}',
  }));
  await page.addInitScript(() => {
    localStorage.setItem('kronos_token', `e30.${btoa(JSON.stringify({ exp: 2000000000 }))}.test`);
    localStorage.setItem('kronos_user', JSON.stringify({ _id: 'audit', username: 'audit' }));
  });
});

async function restored(page) {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-slot="dialog-overlay"], .k-search-modal-backdrop')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveAttribute('data-scroll-locked');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).pointerEvents)).not.toBe('none');
}

for (const width of [320, 390, 700, 768, 900, 1440]) {
  test(`navigation lifecycle at ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => {
      // Chromium software-GPU diagnostic, not a React/application warning.
      if (msg.type() === 'warning' && msg.text().includes('GPU stall due to ReadPixels')) return;
      // @react-three/fiber still constructs THREE.Clock; tracked in audit.md.
      if (msg.type() === 'warning' && msg.text() === 'THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.') return;
      if (['error', 'warning'].includes(msg.type())) errors.push(msg.text());
    });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/home');
    const menu = page.getByRole('button', { name: 'Abrir más secciones', exact: true });
    await expect(menu).toHaveCount(1);
    await expect(page.locator('a[href="/explore"]:visible')).toHaveCount(1);
    await expect(page.locator('.k-topbar-search-trigger')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    {
    for (const close of ['button', 'escape', 'backdrop']) {
      await menu.click();
      const drawer = page.getByRole('dialog', { name: 'Secciones' });
      await expect(drawer).toBeVisible();
      for (const path of ['/home', '/explore', '/create', '/kairos', '/profile']) {
        await expect(drawer.locator(`a[href="${path}"]`)).toHaveCount(0);
      }
      // El centro de IA está fijado en la barra; sus herramientas se heredan al cajón.
      await expect(drawer.locator('a[href="/kairos/image"]')).toHaveCount(1);
      await expect(drawer).toHaveCSS('position', 'fixed');
      await page.keyboard.press('Tab');
      await expect.poll(() => drawer.evaluate(e => e.contains(document.activeElement))).toBe(true);
      await expect.poll(async () => Math.round((await drawer.boundingBox()).x)).toBe(0);
      if (close === 'button') await page.screenshot({ path: testInfo.outputPath('drawer.png') });
      const box = await drawer.boundingBox();
      expect(box.y).toBe(0);
      expect(box.height).toBeLessThanOrEqual(844);
      // Hit testing catches visible-but-covered panels, unlike jsdom.
      await expect(page.getByRole('button', { name: 'Cerrar menú' })).toBeInViewport();
      await page.keyboard.press('Control+k');
      await expect(page.getByRole('dialog')).toHaveCount(1);
      if (close === 'button') await page.getByRole('button', { name: 'Cerrar menú' }).click();
      if (close === 'escape') await page.keyboard.press('Escape');
      if (close === 'backdrop') await page.mouse.click(width - 5, 400);
      await restored(page);
      await expect(menu).toBeFocused();
    }
    await menu.click();
    await page.getByRole('dialog').getByRole('link', { name: 'Notificaciones', exact: true }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await restored(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/home$/);
    await menu.click();
    await page.keyboard.press('Escape');
    await restored(page);

    }
    const search = page.locator('.k-topbar-search-trigger');
    await search.click();
    await expect(page.getByRole('dialog', { name: 'Búsqueda global' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Escribe para buscar' }).fill('audit');
    await page.getByRole('button', { name: 'Cerrar búsqueda' }).click();
    await restored(page);
    await expect(search).toBeFocused();

    // El mapa orbital 3D se retiró: la tecla G ya no abre ninguna capa.
    await expect(page.locator('.k-topbar-orbit-btn')).toHaveCount(0);
    await page.keyboard.press('g');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('.k-topbar-shortcut-btn').click();
    await expect(page.getByRole('dialog', { name: 'Atajos de teclado' })).toBeVisible();
    await page.keyboard.press('Escape');
    await restored(page);
    expect(errors).toEqual([]);
  });
}

test('resize and history while open never strand an overlay', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/home');
  await page.locator('.k-app-tabbar a[href="/explore"]').click();
  await page.locator('.k-topbar-menu-btn').click();
  for (const width of [1440, 768, 320, 390]) {
    await page.setViewportSize({ width, height: 600 });
    await expect(page.getByRole('dialog', { name: 'Secciones' })).toBeVisible();
    await page.keyboard.press('Escape');
    await restored(page);
  }
  await page.locator('.k-topbar-menu-btn').click();
  await page.goBack();
  await restored(page);
  await page.locator('.k-topbar-menu-btn').click();
  await page.getByRole('dialog').getByRole('link', { name: 'Configuración', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await restored(page);
});


test('la barra fija los cinco destinos y la superior los de bandeja', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/home');
    const barra = page.locator('.k-app-tabbar');
    for (const path of ['/explore', '/kairos', '/profile', '/home']) {
      await barra.locator(`a[href="${path}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator('#main-content')).toBeVisible();
      await restored(page);
    }
    const accesos = page.locator('.k-app-topbar-actions');
    for (const [label, path] of [['Notificaciones', '/notifications'], ['Mensajes', '/messages']]) {
      await accesos.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await restored(page);
    }
  }
});

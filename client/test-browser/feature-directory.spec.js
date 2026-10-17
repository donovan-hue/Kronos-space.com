import { test, expect } from '@playwright/test';
import { fixture, abrirApp } from './helpers/kit.js';

for (const width of [320, 390, 1280]) {
  test(`directorio accesible y sin parámetros literales a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await fixture(page);
    await abrirApp(page, '/pantallas');
    await expect(page.getByRole('heading', { name: 'Todas las pantallas' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver todas las funciones' })).toBeVisible();
    await expect(page.locator('.k-indice-enlace')).toHaveCount(59);
    const links = await page.locator('.k-indice-enlace').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
    expect(links.every((href) => href && !/[:*]/.test(href))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByLabel('Buscar una pantalla').fill('proyectos');
    await page.getByRole('link', { name: /Proyectos/ }).click();
    await expect(page).toHaveURL(/\/funciones\/proyectos$/);
    await expect(page.getByRole('status')).toContainText('todavía no tiene una herramienta construida');
    await expect(page.getByRole('link', { name: 'Abrir función' })).toHaveCount(0);
  });
}

for (const [path, title] of [['/atajos', 'Atajos de teclado'], ['/mapa', 'Mapa'], ['/busqueda', 'Búsqueda']]) {
  test(`acceso directo a la herramienta ${path}`, async ({ page }) => {
    await fixture(page);
    await abrirApp(page, path);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: new RegExp(title, 'i') })).toBeVisible();
  });
}

test('la ficha completa una ruta con el recurso elegido, no con :id', async ({ page }) => {
  await fixture(page);
  await abrirApp(page, '/funciones/publicacion');
  await page.getByLabel('Identificador de publicación', { exact: true }).fill('post-ajeno');
  await page.getByRole('button', { name: 'Abrir función' }).click();
  await expect(page).toHaveURL(/\/post\/post-ajeno$/);
});

test('administración restringida no solicita datos privilegiados', async ({ page }) => {
  await fixture(page);
  let solicitudes = 0;
  await page.route('**/api/admin/**', (route) => { solicitudes++; return route.fulfill({ status: 403, json: {} }); });
  await abrirApp(page, '/admin');
  await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible();
  expect(solicitudes).toBe(0);
});

test('las rutas nuevas siguen exigiendo sesión', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { enabled: false } }));
  await page.goto('/kairos/audio');
  await expect(page).toHaveURL(/\/login$/);
});

// KRONOS-NO-MOCK — /api simulado: «se abre sin sesión y no redirige» vale para el enrutado del cliente; la disponibilidad real de esas páginas se mide en el E2E del servidor.

import { test, expect } from '@playwright/test';

/**
 * PÁGINAS PÚBLICAS EN NAVEGADOR REAL.
 *
 * Cinco rutas viven fuera del árbol protegido y se tienen que poder leer sin
 * cuenta: los tres documentos legales, el estado del servicio y el centro de
 * ayuda. En jsdom (test-ui) se comprueba el enrutado; aquí se comprueba lo que
 * solo un navegador puede decir: que el texto no desborda un teléfono, que la
 * navegación de ida y vuelta funciona y que la página de estado refleja lo que
 * responde el endpoint de salud — incluido el caso de API caída, que es justo el
 * momento en que alguien la busca.
 */

const DOCUMENTOS = [
  ['/terminos', 'Términos del servicio'],
  ['/privacidad', 'Aviso de privacidad'],
  ['/cookies', 'Cookies y almacenamiento local'],
  ['/estado', 'Estado del servicio'],
  ['/ayuda', 'Centro de ayuda']
];

const abrir = (page, ruta) => page.goto(ruta, { waitUntil: 'domcontentloaded' });

for (const [ruta, titulo] of DOCUMENTOS) {
  test(`${ruta} se abre sin sesión y no redirige al acceso`, async ({ page }) => {
    await abrir(page, ruta);

    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible({ timeout: 30000 });
    expect(page.url()).not.toContain('/login');
  });
}

test('los cinco textos no desbordan un viewport de 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 });

  for (const [ruta] of DOCUMENTOS) {
    await abrir(page, ruta);
    await expect(page.locator('h1')).toBeVisible({ timeout: 30000 });
    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    expect(desborda, `${ruta} provoca scroll horizontal a 320 px`).toBe(false);
  }
});

test('el acceso enlaza los documentos y el documento devuelve al acceso', async ({ page }) => {
  await abrir(page, '/login');

  for (const etiqueta of ['Términos', 'Privacidad', 'Cookies', 'Estado del servicio', 'Ayuda']) {
    const enlace = page.getByRole('link', { name: etiqueta, exact: true });
    await expect(enlace.first(), `el acceso no enlaza ${etiqueta}`).toBeVisible();
  }

  await page.getByRole('link', { name: 'Privacidad', exact: true }).click();
  await expect(page).toHaveURL(/\/privacidad$/);

  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page).toHaveURL(/\/(login|home)$/);
});

test('la ayuda lleva al acceso y el acceso puede volver a la ayuda', async ({ page }) => {
  await abrir(page, '/ayuda');
  await expect(page.getByRole('heading', { level: 1, name: 'Centro de ayuda' })).toBeVisible({ timeout: 30000 });

  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole('link', { name: 'Ayuda', exact: true }).click();
  await expect(page).toHaveURL(/\/ayuda$/);
  // El índice de la ayuda es interno: una ancla muerta sería un enlace roto.
  await page.getByRole('link', { name: 'Privacidad, datos y borrado' }).click();
  await expect(page.locator('#privacidad')).toBeVisible();
});

test('estado refleja el health real y el botón vuelve a consultar', async ({ page }) => {
  let consultas = 0;
  await page.route('**/api/health', (route) => {
    consultas += 1;
    return route.fulfill({
      json: {
        ok: true,
        database: 'connected',
        realtime: true,
        build: { commitShort: 'cafe123', branch: 'main' },
        startedAt: '2026-10-29T10:00:00.000Z'
      }
    });
  });

  await abrir(page, '/estado');

  // `exact`: cada tarjeta del servicio escribe su estado en minúscula («sin
  // respuesta»), y getByText es de subcadena e insensible a mayúsculas, así que
  // el banner competía con las tarjetas y el modo estricto elegía un momento
  // distinto de la carrera según el reloj del runner.
  await expect(page.getByText('Funcionando', { exact: true })).toBeVisible({ timeout: 30000 });
  expect(await page.getByText('connected').count()).toBeGreaterThan(0);
  expect(consultas).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Volver a comprobar' }).click();
  await expect.poll(() => consultas, { timeout: 10000 }).toBeGreaterThan(1);
});

test('estado dice «sin respuesta» cuando la API no contesta', async ({ page }) => {
  await page.route('**/api/health', (route) => route.abort());
  await abrir(page, '/estado');

  await expect(page.getByText('Sin respuesta', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Funcionando', { exact: true })).toHaveCount(0);
});

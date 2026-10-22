import { test, expect } from '@playwright/test';
import { fixture, abrirApp, CUENTA, IMAGEN } from './helpers/kit.js';

test.use({ timezoneId: 'America/Mexico_City' });

async function pause(page) {
  await page.addInitScript(() => localStorage.setItem('kronos.motion-preference', 'reduced'));
}
async function anonymous(page, withoutWebGL = false, paused = true) {
  if (paused) await pause(page);
  await page.route('**/api/**', (route) => route.fulfill({ json: { enabled: false } }));
  if (withoutWebGL) await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/i.test(type) ? null : original.call(this, type, ...args);
    };
  });
}

for (const width of [320, 390, 1440]) {
  test(`negro real y paleta renderizada neutra a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await pause(page);
    await fixture(page);
    await abrirApp(page, '/pantallas');
    await expect(page.getByRole('heading', { name: 'Todas las pantallas' })).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    const chromatic = await page.evaluate(() => {
      const result = [];
      for (const element of document.querySelectorAll('.k-app-shell *')) {
        const style = getComputedStyle(element);
        if (!element.getClientRects().length || style.visibility === 'hidden') continue;
        // Valores CSS del UI, nunca los píxeles de imágenes/video/canvas.
        for (const property of ['color', 'backgroundColor', 'borderTopColor', 'backgroundImage']) {
          for (const match of style[property].matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) {
            if (!(match[1] === match[2] && match[2] === match[3])) {
              result.push(`${element.tagName}.${element.className}: ${property} ${match[0]}`);
            }
          }
        }
      }
      return result;
    });
    expect(chromatic).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

for (const width of [390, 1440]) {
  test(`el espejo sigue visible sin WebGL a ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 });
    await anonymous(page, true);
    await page.goto('/login');
    const logo = page.getByRole('heading', { name: 'KRONOS-SPACE', exact: true });
    await expect(logo).toBeVisible();
    await expect(page.locator(".k-exact-landing-root .subtitle")).toHaveText("Tu tiempo Tu espacio Tu dominio");
    await expect(logo.locator("svg text").last()).toHaveText("KRONOS-SPACE");
    await expect(logo).toHaveCSS('text-shadow', 'none');
    await expect(logo.locator('svg feSpecularLighting')).toHaveCount(1);
    await expect(logo.locator('svg text').last()).toHaveAttribute('fill', /url\(#wordmark/);
    await expect(page.locator('.k-clock-svg')).toBeVisible();
    await expect(page.locator('.k-live-clock time')).toHaveAttribute('datetime', /T/);
    await expect(page.locator('.k-scene, .k-void-liquid, canvas, img')).toHaveCount(0);
    expect(await logo.evaluate((el) => el.getBoundingClientRect().width <= innerWidth)).toBe(true);
    const enter = page.getByRole('button', { name: 'Iniciar sesión', exact: true });
    await expect(enter).toHaveCSS('color', 'rgb(5, 5, 5)');
    await enter.focus();
    await expect(enter).toHaveCSS('outline-style', 'solid');
    await expect(enter).toHaveCSS('outline-width', '2px');
    await page.screenshot({ path: info.outputPath('espejo-sin-webgl.png') });
  });
}

test('reloj sincronizado y movimiento activo sin botón; se conserva la preferencia guardada anterior', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-17T16:08:30.500Z') });
  await page.clock.pauseAt(new Date('2026-10-17T16:08:30.500Z'));
  await anonymous(page, true, false);
  await page.goto('/login');
  await page.clock.runFor(100);
  const hour = page.locator('[data-clock-hand="hour"]');
  const minute = page.locator('[data-clock-hand="minute"]');
  const second = page.locator('[data-clock-hand="second"]');
  const angle = async hand => Number(await hand.getAttribute('data-angle'));
  expect(await angle(hour)).toBeCloseTo(304.255, 1);
  expect(await angle(minute)).toBeCloseTo(51.06, 1);
  expect(await angle(second)).toBeCloseTo(183.6, 0);
  await expect(page.getByRole('button', { name: /Movimiento en bucle/ })).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-k-motion', 'full');

  const planet = page.locator('[data-planet-front="true"]');
  const moving = await planet.getAttribute('transform');
  const previous = await angle(second);
  await page.clock.runFor(1000);
  expect(await angle(second)).toBeGreaterThan(previous + 5);
  expect(await planet.getAttribute('transform')).not.toBe(moving);

  // Usuarios anteriores pueden conservar esta preferencia en su navegador.
  // La recarga ejercita el arranque real, sin reintroducir el botón retirado
  // ni importar módulos de desarrollo en una prueba del build de producción.
  await page.evaluate(() => localStorage.setItem('kronos.motion-preference', 'reduced'));
  await page.reload();
  await page.clock.runFor(100);
  await expect(page.locator('html')).toHaveAttribute('data-k-motion', 'reduced');
  const stopped = await planet.getAttribute('transform');
  const beforePause = await angle(second);
  await page.clock.runFor(1000);
  expect(await planet.getAttribute('transform')).toBe(stopped);
  expect(await angle(second)).toBeGreaterThan(beforePause + 5);
  // Un ajuste del reloj del sistema se refleja aunque el planeta esté quieto.
  await page.clock.setSystemTime(new Date('2026-10-17T18:11:05.000Z'));
  await page.clock.runFor(50);
  expect(await angle(hour)).toBeCloseTo(5.543, 1);
  expect(await angle(minute)).toBeCloseTo(66.505, 1);

  await page.evaluate(() => localStorage.removeItem('kronos.motion-preference'));
  await page.reload();
  await page.clock.runFor(100);
  await expect(page.locator('html')).toHaveAttribute('data-k-motion', 'full');
  const resumed = await planet.getAttribute('transform');
  await page.clock.runFor(1000);
  expect(await planet.getAttribute('transform')).not.toBe(resumed);
  await expect(page.getByRole('button', { name: /Movimiento en bucle/ })).toHaveCount(0);
});

test('los colores forzados no dejan el logotipo ni el botón transparentes', async ({ page }) => {
  await anonymous(page, true);
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/login');
  const logo = page.getByRole('heading', { name: 'KRONOS-SPACE', exact: true });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveCSS('background-image', 'none');
  const transparent = ['transparent', 'rgba(0, 0, 0, 0)'];
  expect(await logo.locator('text').last().evaluate((el) => getComputedStyle(el).fill)).not.toContain('url(');
  const enter = page.getByRole('button', { name: 'Iniciar sesión', exact: true });
  expect(transparent).not.toContain(await enter.evaluate((el) => getComputedStyle(el).webkitTextFillColor));
});

test('el avatar conserva el color: no se aplica un filtro global a las fotos', async ({ page }) => {
  await fixture(page);
  await pause(page);
  const user = { ...CUENTA, avatar: '/uploads/palette.png' };
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/api/users/me', (route) => route.fulfill({ json: user }));
  await page.route('**/uploads/palette.png', (route) => route.fulfill({ body: IMAGEN, contentType: 'image/png' }));
  await abrirApp(page, '/profile');
  const photo = page.locator('img[src$="/uploads/palette.png"]').first();
  await expect(photo).toBeVisible();
  const filters = await photo.evaluate((el) => {
    const result = [];
    for (let parent = el; parent; parent = parent.parentElement) {
      const filter = getComputedStyle(parent).filter;
      if (filter !== 'none') result.push(filter);
    }
    return result;
  });
  expect(filters).toEqual([]);
});

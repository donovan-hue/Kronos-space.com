import { test, expect } from '@playwright/test';
import { layoutFixture } from './helpers/layout.js';
import { OTRA } from './helpers/kit.js';

async function fits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
}

for (const width of [320, 390, 834]) {
  test(`bienvenida: cuatro pasos, pie accesible y guardado sin falso éxito · ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await layoutFixture(page);
    let attempts = 0;
    await page.route('**/api/users/me/preferences', route => {
      attempts++;
      return route.fulfill(attempts === 1 ? { status: 500, json: { error: 'No se guardaron las preferencias' } } : { json: { preferences: { onboarded: true } } });
    });
    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    for (const name of [/Cielo/, /Música/, /Foto/]) await page.getByRole('button', { name }).click();
    for (let step = 1; step < 4; step++) {
      await fits(page);
      const next = page.getByRole('button', { name: 'Continuar →' });
      await next.scrollIntoViewIfNeeded();
      const box = await next.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(640);
      await next.click();
      await expect(page.getByText(`Paso ${step + 1} de 4`, { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Finalizar e ir a Inicio' }).click();
    await expect(page.getByRole('alert')).toContainText('No se guardaron');
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByRole('button', { name: 'Finalizar e ir a Inicio' }).click();
    await expect(page).toHaveURL(/\/home$/);
    expect(attempts).toBe(2);
  });

  test(`apoyos, privacidad, fichas y 404 tienen caminos de ida y salida · ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await layoutFixture(page);
    await page.route('**/api/support/**', route => route.fulfill({ json: { creator: OTRA, transactions: [] } }));
    await page.goto('/profile');
    await page.getByRole('link', { name: 'Mis apoyos' }).click();
    await expect(page).toHaveURL(/\/support$/);
    await expect(page.getByRole('heading', { name: 'Apoyos recibidos y enviados' })).toBeVisible();
    await page.goto('/profile/other');
    await page.getByRole('link', { name: 'Página de apoyo' }).click();
    await expect(page).toHaveURL(/\/support\/other$/);
    await expect(page.getByRole('heading', { name: 'Apoyar a un creador' })).toBeVisible();
    await page.getByRole('button', { name: 'Elegir apoyo simbólico' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const footer = page.locator('[data-slot="dialog-footer"]');
    const spacing = await footer.evaluate(el => ({ actual: parseFloat(getComputedStyle(el).marginTop), expected: parseFloat(getComputedStyle(document.documentElement).fontSize) / 4 }));
    expect(spacing.actual).toBe(spacing.expected);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await fits(page);

    await page.goto('/settings/profile');
    await expect(page).toHaveURL(/\/settings#privacy$/);
    await expect(page.locator('#privacy')).toHaveAttribute('open', '');
    await page.goto('/pantallas');
    await page.locator('a[href="/funciones/apoyar-a-un-creador"]').click();
    await expect(page.getByRole('heading', { name: 'Apoyar a un creador' })).toBeVisible();
    await page.getByRole('link', { name: 'Todas las funciones', exact: true }).click();
    await expect(page).toHaveURL(/\/pantallas$/);
    await page.goto('/ruta-inexistente-de-prueba');
    await expect(page.getByRole('heading', { level: 1, name: 'Esta órbita no existe' })).toBeVisible();
    await page.getByRole('link', { name: 'Volver al inicio' }).click();
    await expect(page).toHaveURL(/\/home$/);
  });
}

test('capas CSS: el reset no anula utilidades y la identidad mantiene filtros y foco', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await layoutFixture(page);
  await page.goto('/explore');
  await expect(page.locator('.k-filter-row')).toBeVisible();
  const button = page.locator('.k-filter-row button').first();
  expect(await button.evaluate(el => getComputedStyle(el).paddingLeft)).toBe('16px');
  expect(await page.locator('.k-app-topbar').evaluate(el => getComputedStyle(el).backdropFilter)).toBe('blur(14px)');
  expect(await page.locator('.k-mobile-navigation').evaluate(el => getComputedStyle(el).backdropFilter)).toBe('blur(18px) saturate(0)');
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  const heading = page.locator('.page h1');
  // CDP confirma la emulación antes de que el renderer necesariamente haya
  // recalculado los estilos. Mantener la exigencia, pero esperar al cambio real.
  await expect.poll(() => page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  await expect(heading).toHaveCSS('background-image', 'none');
  await expect(heading).not.toHaveCSS('-webkit-text-fill-color', 'rgba(0, 0, 0, 0)');
});

// Transporte Socket.IO mínimo de prueba: una entrada se confirma realmente
// por el mismo evento que espera el cliente. No añade atajos al producto.
async function liveTransport(page) {
  const packets = [];
  let pending = null;
  const flush = () => {
    if (!pending || !packets.length) return;
    const route = pending; pending = null;
    void route.fulfill({ body: packets.splice(0).join('\x1e'), contentType: 'text/plain' }).catch(() => {});
  };
  await page.route('**/socket.io/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      for (const packet of (request.postData() || '').split('\x1e')) {
        if (packet.startsWith('40')) packets.push('40{"sid":"completion"}');
        if (packet.startsWith('42')) {
          const [event, data] = JSON.parse(packet.slice(2));
          if (event === 'live:join') packets.push(`42${JSON.stringify(['live:joined', { roomId: data.roomId }])}`);
        }
      }
      await route.fulfill({ body: 'ok', contentType: 'text/plain' });
      flush();
    } else if (!url.searchParams.has('sid')) {
      await route.fulfill({ body: '0{"sid":"completion","upgrades":[],"pingInterval":1000000,"pingTimeout":1000000}', contentType: 'text/plain' });
    } else {
      pending = route;
      flush();
    }
  });
}

for (const width of [320, 834]) {
  test(`en vivo: pantalla y micrófono reales del navegador, con cierre seguro · ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await layoutFixture(page);
    await liveTransport(page);
    await page.addInitScript(() => {
      const tracks = [];
      window.__liveTracks = tracks;
      const video = () => {
        const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
        const track = canvas.captureStream(1).getVideoTracks()[0]; tracks.push(track); return track;
      };
      const audio = () => {
        const context = new AudioContext();
        const track = context.createMediaStreamDestination().stream.getAudioTracks()[0]; tracks.push(track); return track;
      };
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
        getDisplayMedia: async () => new MediaStream([video()]),
        getUserMedia: async constraints => new MediaStream(constraints.video ? [audio(), video()] : [audio()])
      } });
    });
    const room = { _id: 'live-layout', title: 'Pantalla de prueba', type: 'screen', host: 'owner', isPublic: true };
    const calls = [];
    await page.route('**/api/live/**', route => {
      calls.push([route.request().method(), new URL(route.request().url()).pathname]);
      return route.fulfill({ json: { room, rooms: [], ok: true } });
    });
    await page.goto('/live');
    await page.getByLabel('Título', { exact: true }).fill('Pantalla de prueba');
    await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('screen');
    await page.getByRole('button', { name: 'Empezar', exact: true }).click();
    await expect(page.getByLabel('Tu pantalla compartida')).toBeVisible();
    await fits(page);
    expect(await page.evaluate(() => window.__liveTracks.map(t => t.kind).sort())).toEqual(['audio', 'video']);
    await page.getByRole('button', { name: 'Silenciar micrófono' }).click();
    expect(await page.evaluate(() => window.__liveTracks.filter(t => t.kind === 'audio').every(t => !t.enabled))).toBe(true);
    await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
    await expect(page.getByLabel('Tu pantalla compartida')).toHaveCount(0);
    expect(await page.evaluate(() => window.__liveTracks.every(t => t.readyState === 'ended'))).toBe(true);
    expect(calls).toContainEqual(['PATCH', '/api/live/rooms/live-layout/end']);
  });
}

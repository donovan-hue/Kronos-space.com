import { test, expect } from '@playwright/test';
import { fixture } from './helpers/kit.js';

async function abrirEstudio(page, horizontal = false) {
  await fixture(page);
  await page.goto('/create/post');
  const image = await page.evaluate(horizontal => {
    const canvas = document.createElement('canvas');
    canvas.width = horizontal ? 900 : 600;
    canvas.height = horizontal ? 600 : 900;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#6491b2'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  }, horizontal);
  await page.getByLabel('Seleccionar imagen o video').setInputFiles({
    name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64')
  });
  const studio = page.getByRole('dialog', { name: 'Estudio de la foto' });
  await expect(studio).toBeVisible();
  await studio.evaluate(async el => {
    await document.fonts.ready;
    await Promise.all(el.getAnimations({ subtree: true })
      .filter(a => a.effect?.getTiming().iterations !== Infinity)
      .map(a => a.finished.catch(() => {})));
  });
  return studio;
}

async function siguienteFotograma(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test.describe('Filtros con entrada táctil', () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [412, 760]]) {
    for (const horizontal of [false, true]) {
      test(`últimas filas sin salto ni cambio de destino · ${width}x${height} · foto ${horizontal ? 'horizontal' : 'vertical'}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        const studio = await abrirEstudio(page, horizontal);
        const content = studio.locator('.k-studio-contenido');
        await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
        for (const nombre of ['Chispa', 'Vintage', 'Bruma', 'Chispa']) {
          const filtro = studio.getByRole('listitem', { name: nombre, exact: true });
          await filtro.evaluate(el => el.scrollIntoView({ block: 'nearest' }));
          await siguienteFotograma(page);
          const box = await filtro.boundingBox();
          const before = await content.evaluate(el => ({ scroll: el.scrollTop, height: el.clientHeight, y: el.getBoundingClientRect().top }));
          expect(box.y).toBeGreaterThanOrEqual(before.y - 1);
          expect(box.y + box.height).toBeLessThanOrEqual(before.y + before.height + 1);
          // Coordenadas reales: locator.click/tap podría recolocar el elemento
          // y ocultar que Chromium cambia de destino entre pointerup y click.
          await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
          await expect(filtro).toHaveAttribute('aria-pressed', 'true');
          await expect(studio.locator('.k-studio-filtro[aria-pressed="true"]')).toHaveCount(1);
          await siguienteFotograma(page);
          expect(Math.abs(await content.evaluate(el => el.scrollTop) - before.scroll)).toBeLessThanOrEqual(1);
        }
        await expect(studio.getByRole('button', { name: 'Aplicar a la foto', exact: true })).toBeInViewport();
        await studio.getByRole('button', { name: 'Cancelar', exact: true }).tap();
        await expect(studio).toHaveCount(0);
      });
    }
  }
});

test('último filtro sigue accesible con teclado y ratón', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const studio = await abrirEstudio(page);
  const ultimo = studio.getByRole('listitem', { name: 'Chispa', exact: true });
  await ultimo.focus();
  await page.keyboard.press('Enter');
  await expect(ultimo).toHaveAttribute('aria-pressed', 'true');
  await studio.getByRole('listitem', { name: 'Vintage', exact: true }).click();
  await expect(studio.getByRole('listitem', { name: 'Vintage', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await ultimo.focus();
  await page.keyboard.press('Space');
  await expect(ultimo).toHaveAttribute('aria-pressed', 'true');
});

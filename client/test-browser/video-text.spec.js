import { test, expect } from '@playwright/test';
import { fixture, PUBLICACION_AJENA } from './helpers/kit.js';

// Solo comprueba la presentación de una receta guardada; la API es controlada.
async function reproducirEnMemoria(video) {
  await video.evaluate(async el => {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 108;
    canvas.getContext('2d').fillRect(0, 0, 192, 108);
    el.muted = true;
    el.srcObject = canvas.captureStream(1);
    await el.play();
  });
}

async function comprobarTexto(root, posicion, fondo) {
  const texto = root.locator('.k-video-overlay-text');
  await expect(texto).toHaveText('Texto del video\nSegunda línea');
  await expect(texto).toBeVisible();
  await expect(texto).toHaveCSS('color', 'rgb(255, 136, 0)');
  await expect(texto).toHaveCSS('font-size', '17.28px');
  await expect(texto).toHaveCSS('background-color', fondo ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0)');
  await expect(texto).toHaveCSS('pointer-events', 'none');
  await expect(texto).toHaveCSS('white-space', 'pre-wrap');
  expect(await texto.evaluate(el => Boolean(el.closest('[aria-hidden="true"]')))).toBe(false);
  await expect.poll(() => texto.evaluate((el, posicion) => {
    const box = el.getBoundingClientRect();
    const area = el.parentElement.getBoundingClientRect();
    const horizontal = Math.abs((box.left + box.right) / 2 - (area.left + area.right) / 2);
    const vertical = posicion === 'arriba' ? Math.abs(box.top - area.top - 12)
      : posicion === 'abajo' ? Math.abs(area.bottom - box.bottom - 12)
        : Math.abs((box.top + box.bottom) / 2 - (area.top + area.bottom) / 2);
    return horizontal < 1 && vertical < 1 && box.width <= area.width * 0.84 + 1 && box.height <= area.height;
  }, posicion)).toBe(true);
}

for (const width of [390, 1280]) {
  for (const posicion of ['arriba', 'centro', 'abajo']) {
    for (const ruta of ['/home', '/vertical']) {
      test(`texto ${posicion} en ${ruta} · ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await fixture(page);
        const fondo = posicion !== 'centro';
        const posts = [{
          ...PUBLICACION_AJENA, _id: 'video-texto', content: 'Publicación con texto',
          media: { type: 'video', url: '/uploads/text-test.mp4', edit: {
            texto: { contenido: 'Texto del video\nSegunda línea', posicion, tamano: 1.2, color: '#ff8800', fondo }
          } }
        }];
        await page.route('**/uploads/text-test.mp4', route => route.fulfill({ status: 204 }));
        await page.route('**/api/posts**', route => route.fulfill({ json: { posts, hasMore: false, page: 1 } }));
        await page.goto(ruta);
        const stage = page.locator(ruta === '/home' ? '.k-post-media-frame' : '.k-vertical-stage').first();
        await expect(stage.locator('video')).toBeVisible();
        await reproducirEnMemoria(stage.locator('video'));
        await comprobarTexto(stage, posicion, fondo);
        await page.setViewportSize({ width: width === 390 ? 430 : 1024, height: 700 });
        await comprobarTexto(stage, posicion, fondo);
        if (ruta === '/home') {
          await page.getByRole('button', { name: 'Ver video en pantalla completa' }).click();
          const dialog = page.getByRole('dialog');
          await reproducirEnMemoria(dialog.locator('video'));
          await comprobarTexto(dialog, posicion, fondo);
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0);
        }
      });
    }
  }
}

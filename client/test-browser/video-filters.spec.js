// KRONOS-NO-MOCK — respuestas controladas: se comprueba el filtro CSS efectivo en el reproductor, no la generación ni la persistencia del backend.

import { test, expect } from '@playwright/test';
import { fixture, PUBLICACION_AJENA } from './helpers/kit.js';

// Comprueba el filtro CSS efectivo del reproductor, no solo la receta guardada.
// Las respuestas controladas no validan generación ni persistencia del backend.
const posts = [
  { ...PUBLICACION_AJENA, _id: 'video-noir', content: 'Video Noir', media: {
    type: 'video', url: '/uploads/filter-test.mp4',
    edit: { filtro: { id: 'negro', intensidad: 0.5, css: 'blur(100px)' } }
  } },
  { ...PUBLICACION_AJENA, _id: 'video-original', content: 'Video original', media: {
    type: 'video', url: '/uploads/filter-test.mp4'
  } }
];

for (const width of [390, 1280]) {
  test(`filtro guardado en Inicio y al ampliar · ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await fixture(page);
    await page.route('**/uploads/filter-test.mp4', route => route.fulfill({ status: 204 }));
    await page.route('**/api/posts**', route => route.fulfill({ json: { posts, hasMore: false, page: 1 } }));
    await page.goto('/home');
    await expect(page.locator('video[aria-label="Video Noir"]')).toHaveCSS('filter', 'grayscale(0.5) contrast(1.09)');
    await expect(page.locator('video[aria-label="Video original"]')).toHaveCSS('filter', 'none');
    await page.getByRole('button', { name: 'Ver video en pantalla completa' }).first().click();
    await expect(page.getByRole('dialog').locator('video')).toHaveCSS('filter', 'grayscale(0.5) contrast(1.09)');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test(`filtro guardado en Vertical · ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await fixture(page);
    await page.route('**/uploads/filter-test.mp4', route => route.fulfill({ status: 204 }));
    await page.route('**/api/posts/vertical**', route => route.fulfill({ json: { posts, hasMore: false, page: 1 } }));
    await page.goto('/vertical');
    await expect(page.locator('video[aria-label="Video Noir"]')).toHaveCSS('filter', 'grayscale(0.5) contrast(1.09)');
    await expect(page.locator('video[aria-label="Video original"]')).toHaveCSS('filter', 'none');
  });
}

const tono = {
  ...posts[0], _id: 'video-tono', content: 'Video con tono',
  media: { type: 'video', url: '/uploads/filter-test.mp4', edit: {
    filtro: { id: 'negro', intensidad: 0.5, css: 'blur(100px)' },
    ajustes: { brillo: 1.1, exposicion: 0.2, contraste: 1.2, saturacion: 0.8, calidez: 0.2, desenfoque: 1.5, vineta: 0.6, grano: 0.4 }
  } }
};
const tonoCss = 'grayscale(0.5) contrast(1.09) brightness(1.32) contrast(1.2) saturate(0.8) sepia(0.2) hue-rotate(-8deg) blur(1.5px)';

async function comprobarTono(contenedor) {
  await expect(contenedor.locator('video').first()).toHaveCSS('filter', tonoCss);
  await expect(contenedor.locator('.k-video-tone-vineta')).toHaveCSS('opacity', '0.6');
  await expect(contenedor.locator('.k-video-tone-grano')).toHaveCSS('opacity', '0.14');
  for (const selector of ['.k-video-tone-overlays', '.k-video-tone-vineta', '.k-video-tone-grano']) {
    await expect(contenedor.locator(selector)).toHaveCSS('pointer-events', 'none');
  }
  await expect(contenedor.locator('.k-video-tone-vineta')).toHaveCSS('background-image', /radial-gradient/);
  await expect(contenedor.locator('.k-video-tone-grano')).toHaveCSS('background-image', /feTurbulence/);
}

for (const width of [390, 1280]) {
  test(`tono y efectos en Inicio y visor sin bloquear controles · ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await fixture(page);
    await page.route('**/uploads/filter-test.mp4', route => route.fulfill({ status: 204 }));
    await page.route('**/api/posts**', route => route.fulfill({ json: { posts: [tono, posts[1]], hasMore: false, page: 1 } }));
    await page.goto('/home');
    await comprobarTono(page.locator('.k-post-media-frame').first());
    await expect(page.locator('video[aria-label="Video original"]')).toHaveCSS('filter', 'none');
    await page.getByRole('button', { name: 'Ver video en pantalla completa' }).first().click();
    await comprobarTono(page.getByRole('dialog'));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test(`tono y efectos en Vertical, ajustados al área del video · ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await fixture(page);
    await page.route('**/uploads/filter-test.mp4', route => route.fulfill({ status: 204 }));
    await page.route('**/api/posts/vertical**', route => route.fulfill({ json: { posts: [tono], hasMore: false, page: 1 } }));
    await page.goto('/vertical');
    const stage = page.locator('.k-vertical-stage');
    await comprobarTono(stage);
    // Video horizontal generado en memoria: permite medir sus márgenes
    // sin descargar ni incorporar archivos binarios de prueba al repositorio.
    await stage.locator('video').evaluate(async video => {
      const canvas = document.createElement('canvas');
      canvas.width = 192;
      canvas.height = 108;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#da5030';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      video.muted = true;
      const stream = canvas.captureStream(1);
      video.srcObject = stream;
      video.__toneTestStream = stream;
      await video.play();
    });
    const medir = () => stage.evaluate(el => {
      const video = el.querySelector('video');
      const capa = el.querySelector('.k-video-tone-overlays');
      const box = video.getBoundingClientRect();
      const overlay = capa.getBoundingClientRect();
      const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
      return {
        errorAncho: Math.abs(overlay.width - video.videoWidth * scale),
        errorAlto: Math.abs(overlay.height - video.videoHeight * scale),
        errorCentro: Math.abs((overlay.top + overlay.bottom) / 2 - (box.top + box.bottom) / 2)
      };
    });
    await expect.poll(async () => Object.values(await medir()).every(error => error < 1)).toBe(true);
    await page.setViewportSize({ width: width === 390 ? 430 : 1024, height: 700 });
    await expect.poll(async () => Object.values(await medir()).every(error => error < 1)).toBe(true);
    await stage.locator('video').evaluate(video => video.__toneTestStream.getTracks().forEach(track => track.stop()));
  });
}

// KRONOS-NO-MOCK — /api simulado: mide que la velocidad de las tomas no arrastre la de música o voz en el reproductor; nada se persiste de verdad.

import { test, expect } from '@playwright/test';
import { fixture, PUBLICACION_AJENA } from './helpers/kit.js';

let webm;
function wav() {
  const rate = 8000; const samples = rate * 20;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 220 / rate) * 400), 44 + i * 2);
  return buffer;
}

// Los archivos se crean en memoria, sin guardar grabaciones en el repositorio.
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  webm = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 108;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const parts = [];
    recorder.ondataavailable = e => parts.push(e.data);
    const done = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();
    let frame = 0;
    const timer = setInterval(() => { ctx.fillStyle = frame++ % 2 ? '#345699' : '#779955'; ctx.fillRect(0, 0, 192, 108); }, 70);
    await new Promise(resolve => setTimeout(resolve, 4200));
    recorder.stop(); await done; clearInterval(timer); stream.getTracks().forEach(track => track.stop());
    return Array.from(new Uint8Array(await new Blob(parts, { type: 'video/webm' }).arrayBuffer()));
  }));
  await page.close();
});

async function preparar(page, ruta, single, rate = 2) {
  await fixture(page);
  const first = { tipo: 'video', url: '/uploads/speed-source.webm', duracion: 4.2, inicio: 0.6, fin: 3.6, velocidad: rate };
  const media = { type: 'video', url: '/uploads/speed-source.webm', duration: 4.2,
    music: { url: '/uploads/music/test.wav', inicio: 1, fin: 19, volumen: 0.3 },
    edit: { voz: { url: '/uploads/voices/test.wav', inicio: 0, fin: 19, volumen: 0.6 },
      clips: single ? [first] : [first,
        { tipo: 'image', url: '/uploads/speed-image.svg', duracion: 1, velocidad: 4 },
        { ...first, inicio: 1.6, velocidad: 0.5 }
      ] }
  };
  const posts = [{ ...PUBLICACION_AJENA, _id: 'speed-post', content: 'Velocidad de cada toma', media }];
  await page.route('**/api/posts**', r => r.fulfill({ json: { posts, hasMore: false, page: 1 } }));
  await page.route('**/uploads/speed-source.webm', r => fulfillRange(r, webm, 'video/webm'));
  await page.route('**/uploads/speed-image.svg', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="108"><rect width="192" height="108" fill="#bb3344"/></svg>' }));
  await page.route(/\/uploads\/(voices|music)\/test\.wav/, r => fulfillRange(r, wav(), 'audio/wav'));
  await page.goto(ruta);
  const stage = page.locator(ruta === '/home' ? '.k-post-media-frame' : '.k-vertical-stage').first();
  await expect(stage.locator('video')).toBeVisible();
  if (await stage.getByRole('button', { name: 'Pausar secuencia' }).count()) await stage.getByRole('button', { name: 'Pausar secuencia' }).click();
  await page.locator('.page h1').click();
  await stage.locator('video').evaluate(el => { el.muted = false; el.currentTime = 0.6; });
  await expect.poll(() => stage.locator('video').evaluate(el => !el.seeking && el.currentTime >= 0.59)).toBe(true);
  return stage;
}
function fulfillRange(route, bytes, contentType) {
  const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
  return route.fulfill({ status: range ? 206 : 200, contentType, body: bytes.subarray(start, end + 1),
    headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) } });
}
async function comprobarAudio(stage, inicio, offset, speed) {
  await expect.poll(() => stage.evaluate((el, { inicio, offset, speed }) => {
    const v = el.querySelector('video'); const m = el.querySelector('.k-video-music audio'); const a = el.querySelector('.k-video-voice audio');
    const global = offset + (v.currentTime - inicio) / speed;
    return !v.paused && !m.paused && !a.paused && !v.seeking && m.playbackRate === 1 && a.playbackRate === 1
      && Math.abs(m.currentTime - global - 1) < 0.25 && Math.abs(a.currentTime - global) < 0.25;
  }, { inicio, offset, speed })).toBe(true);
}

for (const width of [390, 1280]) {
  for (const ruta of ['/home', '/vertical']) {
    test(`rápido, imagen y lento sin cambiar velocidad de la música o voz en ${ruta} · ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const stage = await preparar(page, ruta, false);
      const video = stage.locator('video');
      expect(await video.evaluate(el => el.playbackRate)).toBe(2);
      expect(Number(await stage.getByRole('progressbar', { name: 'Progreso de la secuencia' }).getAttribute('max'))).toBeCloseTo(6.5, 1);
      await stage.getByRole('button', { name: 'Continuar secuencia' }).click();
      await comprobarAudio(stage, 0.6, 0, 2);
      await expect(stage.getByAltText('Imagen del clip 2')).toBeVisible();
      expect(await video.evaluate(el => el.playbackRate)).toBe(1);
      await stage.getByRole('button', { name: 'Pausar secuencia' }).click();
      await expect.poll(() => stage.locator('.k-video-music audio').evaluate(el => el.paused)).toBe(true);
      const progress = stage.getByRole('progressbar', { name: 'Progreso de la secuencia' });
      const before = Number(await progress.getAttribute('value'));
      expect(before).toBeGreaterThanOrEqual(1.49); expect(before).toBeLessThan(2.51);
      await page.waitForTimeout(250);
      expect(Number(await progress.getAttribute('value'))).toBe(before);
      await stage.getByRole('button', { name: 'Continuar secuencia' }).click();
      await expect(stage.getByText('Clip 3 de 3', { exact: true })).toBeVisible();
      await expect(video).toBeVisible();
      expect(await video.evaluate(el => el.playbackRate)).toBe(0.5);
      await comprobarAudio(stage, 1.6, 2.5, 0.5);
      if (ruta === '/home') {
        await expect(stage.getByRole('button', { name: 'Continuar secuencia' })).toBeVisible();
        expect(Number(await progress.getAttribute('value'))).toBeCloseTo(6.5, 1);
        await page.getByRole('button', { name: 'Ver video en pantalla completa' }).click();
        const dialog = page.getByRole('dialog');
        await expect.poll(() => dialog.locator('video').evaluate(el => !el.seeking && el.currentTime >= 0.59)).toBe(true);
        expect(await dialog.locator('video').evaluate(el => el.playbackRate)).toBe(2);
        await dialog.locator('video').evaluate(el => { el.muted = false; });
        await dialog.getByRole('button', { name: 'Continuar secuencia' }).click();
        await comprobarAudio(dialog, 0.6, 0, 2);
        const audio = await dialog.locator('.k-video-music audio').elementHandle();
        await page.keyboard.press('Escape'); expect(await audio.evaluate(el => el.paused)).toBe(true);
      } else {
        await expect(stage.getByText('Clip 1 de 3', { exact: true })).toBeVisible();
        await expect.poll(() => video.evaluate(el => el.playbackRate)).toBe(2);
        await comprobarAudio(stage, 0.6, 0, 2);
      }
    });

    test(`una sola toma a ${width === 390 ? '0.25' : '4'}x conserva duración, entrada y salida en ${ruta} · ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const rate = width === 390 ? 0.25 : 4;
      const stage = await preparar(page, ruta, true, rate);
      const video = stage.locator('video');
      expect(await video.evaluate(el => el.playbackRate)).toBe(rate);
      const progress = stage.getByRole('progressbar', { name: 'Progreso de la secuencia' });
      expect(Number(await progress.getAttribute('max'))).toBeCloseTo(3 / rate, 1);
      await stage.getByRole('button', { name: 'Continuar secuencia' }).click();
      await comprobarAudio(stage, 0.6, 0, rate);
      if (ruta === '/home') {
        await expect(stage.getByRole('button', { name: 'Continuar secuencia' })).toBeVisible({ timeout: 16000 });
        expect(Number(await progress.getAttribute('value'))).toBeCloseTo(3 / rate, 1);
        expect(await video.evaluate(el => el.currentTime)).toBeLessThan(3.9);
      } else {
        await stage.getByRole('button', { name: 'Pausar secuencia' }).click();
        await expect.poll(() => stage.locator('.k-video-voice audio').evaluate(el => el.paused)).toBe(true);
      }
    });
  }
}

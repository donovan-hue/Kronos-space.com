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

async function preparar(page, ruta, single, legacy) {
  await fixture(page);
  const base = { inicio: 0.6, fin: 1.8 };
  const media = { type: 'video', url: '/uploads/cut-source.webm', duration: 4.2,
    music: { url: '/uploads/music/test.wav', inicio: 1, fin: 18, volumen: 0.3 },
    edit: { voz: { url: '/uploads/voices/test.wav', inicio: 0, fin: 18, volumen: 0.6 },
      ...(single ? (legacy ? {} : { corte: base }) : { corte: { inicio: 0, fin: 4.2 }, clips: [
        { tipo: 'video', url: '/uploads/cut-source.webm', duracion: 4.2, ...base, velocidad: 1 },
        { tipo: 'video', url: '/uploads/cut-source.webm', duracion: 4.2, inicio: 2.4, fin: 3.6, velocidad: 1 }
      ] }) },
    ...(single && legacy ? { trim: { start: 0.6, end: 1.8 } } : {})
  };
  const posts = [{ ...PUBLICACION_AJENA, _id: 'trim-post', content: 'Video recortado', media }];
  await page.route('**/api/posts**', r => r.fulfill({ json: { posts, hasMore: false, page: 1 } }));
  await page.route('**/uploads/cut-source.webm', r => fulfillRange(r, webm, 'video/webm'));
  await page.route(/\/uploads\/(voices|music)\/test\.wav/, r => fulfillRange(r, wav(), 'audio/wav'));
  await page.goto(ruta);
  const stage = page.locator(ruta === '/home' ? '.k-post-media-frame' : '.k-vertical-stage').first();
  await expect(stage.locator('video')).toBeVisible();
  if (await stage.getByRole('button', { name: 'Pausar secuencia' }).count()) await stage.getByRole('button', { name: 'Pausar secuencia' }).click();
  await page.locator('.page h1').click();
  await stage.locator('video').evaluate(el => { el.muted = false; el.currentTime = 0; });
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
async function comprobarAudio(stage, inicio, offset) {
  await expect.poll(() => stage.evaluate((el, { inicio, offset }) => {
    const v = el.querySelector('video'); const m = el.querySelector('.k-video-music audio'); const a = el.querySelector('.k-video-voice audio');
    const global = offset + v.currentTime - inicio;
    return !v.paused && !m.paused && !a.paused && !v.seeking && Math.abs(m.currentTime - global - 1) < 0.25 && Math.abs(a.currentTime - global) < 0.25;
  }, { inicio, offset })).toBe(true);
}

for (const width of [390, 1280]) {
  for (const ruta of ['/home', '/vertical']) {
    for (const single of [false, true]) {
      test(`recorte ${single ? 'de una toma' : 'de clips repetidos'} en ${ruta} · ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        const stage = await preparar(page, ruta, single, width === 390);
        const video = stage.locator('video');
        expect(await video.evaluate(el => el.paused)).toBe(true);
        expect(await video.evaluate(el => el.currentTime)).toBeCloseTo(0.6, 1);
        // Este caso comprueba recortes a velocidad normal.
        expect(await video.evaluate(el => el.playbackRate)).toBe(1);
        await stage.getByRole('button', { name: 'Continuar secuencia' }).click();
        await comprobarAudio(stage, 0.6, 0);
        if (!single) {
          await expect(stage.getByText('Clip 2 de 2', { exact: true })).toBeVisible();
          await expect.poll(() => video.evaluate(el => !el.seeking && el.currentTime >= 2.39)).toBe(true);
          await comprobarAudio(stage, 2.4, 1.2);
        }
        if (ruta === '/home') {
          await expect(stage.getByRole('button', { name: 'Continuar secuencia' })).toBeVisible();
          await expect.poll(() => video.evaluate(el => el.paused)).toBe(true);
          const end = await video.evaluate(el => el.currentTime);
          expect(end).toBeGreaterThanOrEqual(single ? 1.79 : 3.59);
          expect(end).toBeLessThan(single ? 1.95 : 3.75);
          const progress = stage.getByRole('progressbar', { name: 'Progreso de la secuencia' });
          expect(Number(await progress.getAttribute('value'))).toBeCloseTo(single ? 1.2 : 2.4, 1);
          await page.getByRole('button', { name: 'Ver video en pantalla completa' }).click();
          const dialog = page.getByRole('dialog');
          await expect.poll(() => dialog.locator('video').evaluate(el => !el.seeking && el.currentTime >= 0.59)).toBe(true);
          await dialog.locator('video').evaluate(el => { el.muted = false; });
          await dialog.getByRole('button', { name: 'Continuar secuencia' }).click();
          await comprobarAudio(dialog, 0.6, 0);
          const audio = await dialog.locator('.k-video-music audio').elementHandle();
          await page.keyboard.press('Escape'); expect(await audio.evaluate(el => el.paused)).toBe(true);
        } else {
          if (!single) await expect(stage.getByText('Clip 1 de 2', { exact: true })).toBeVisible();
          else await expect.poll(() => video.evaluate(el => !el.paused && el.currentTime < 1)).toBe(true);
          await comprobarAudio(stage, 0.6, 0);
        }
      });
    }
  }
}

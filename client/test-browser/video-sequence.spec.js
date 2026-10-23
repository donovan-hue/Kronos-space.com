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
    await new Promise(resolve => setTimeout(resolve, 2000));
    recorder.stop(); await done; clearInterval(timer); stream.getTracks().forEach(track => track.stop());
    return Array.from(new Uint8Array(await new Blob(parts, { type: 'video/webm' }).arrayBuffer()));
  }));
  await page.close();
});

async function preparar(page, ruta) {
  await fixture(page);
  const media = { type: 'video', url: '/uploads/not-the-first.webm',
    music: { url: '/uploads/music/test.wav', volumen: 0.3 },
    edit: { texto: { contenido: 'Secuencia del estudio', posicion: 'arriba' },
      voz: { url: '/uploads/voices/test.wav', inicio: 2, fin: 15, volumen: 0.6 },
      clips: [
        { tipo: 'video', url: '/uploads/clip-one.webm', duracion: 2 },
        { tipo: 'image', url: '/uploads/clip-two.svg', duracion: 2 },
        { tipo: 'video', url: '/uploads/clip-three.webm', duracion: 2 }
      ] } };
  const posts = [{ ...PUBLICACION_AJENA, _id: 'sequence-post', content: 'Video en secuencia', media }];
  await page.route('**/api/posts**', r => r.fulfill({ json: { posts, hasMore: false, page: 1 } }));
  await page.route('**/uploads/*.webm', r => r.fulfill({ contentType: 'video/webm', body: webm }));
  await page.route('**/uploads/clip-two.svg', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="108"><rect width="192" height="108" fill="#bb3344"/></svg>' }));
  await page.route(/\/uploads\/(voices|music)\/test\.wav/, r => {
    const bytes = wav(); const range = r.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    return r.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', body: bytes.subarray(start, end + 1),
      headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) } });
  });
  await page.goto(ruta);
  const stage = page.locator(ruta === '/home' ? '.k-post-media-frame' : '.k-vertical-stage').first();
  await expect(stage.locator('video')).toHaveAttribute('src', /clip-one/);
  await expect.poll(() => stage.locator('video').evaluate(el => el.readyState)).toBeGreaterThanOrEqual(1);
  await page.locator('.page h1').click();
  await stage.locator('video').evaluate(el => { el.muted = false; });
  if (await stage.getByRole('button', { name: 'Continuar secuencia' }).count()) await stage.getByRole('button', { name: 'Continuar secuencia' }).click();
  return stage;
}

for (const width of [390, 1280]) {
  for (const ruta of ['/home', '/vertical']) {
    test(`secuencia completa con imagen elegida y audio global en ${ruta} · ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const stage = await preparar(page, ruta);
      const video = stage.locator('video');
      const music = stage.locator('.k-video-music audio');
      const voice = stage.locator('.k-video-voice audio');
      await expect(stage.getByAltText('Imagen del clip 2')).toBeVisible();
      await expect(stage.locator('.k-video-overlay-text')).toBeVisible();
      await expect.poll(() => music.evaluate(el => !el.paused && el.currentTime > 2.2)).toBe(true);
      await expect.poll(() => voice.evaluate(el => !el.paused && el.currentTime > 0.2)).toBe(true);
      const difference = await stage.evaluate(el => el.querySelector('.k-video-music audio').currentTime - el.querySelector('.k-video-voice audio').currentTime);
      expect(difference).toBeCloseTo(2, 0);
      await stage.getByRole('button', { name: 'Pausar secuencia' }).click();
      await expect.poll(() => music.evaluate(el => el.paused)).toBe(true);
      await expect.poll(() => voice.evaluate(el => el.paused)).toBe(true);
      const before = await stage.getByRole('progressbar', { name: 'Progreso de la secuencia' }).getAttribute('value');
      // Comprueba que el tiempo de pantalla no se consume mientras está pausada.
      await page.waitForTimeout(300);
      expect(await stage.getByRole('progressbar', { name: 'Progreso de la secuencia' }).getAttribute('value')).toBe(before);
      await stage.getByRole('button', { name: 'Continuar secuencia' }).click();
      await expect(video).toHaveAttribute('src', /clip-three/);
      await expect(video).toBeVisible();
      await expect.poll(() => music.evaluate(el => !el.paused && el.currentTime > 4)).toBe(true);
      if (ruta === '/home') {
        await expect(stage.getByRole('button', { name: 'Continuar secuencia' })).toBeVisible();
        await expect.poll(() => music.evaluate(el => el.paused)).toBe(true);
        await page.getByRole('button', { name: 'Ver video en pantalla completa' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.locator('video')).toHaveAttribute('src', /clip-one/);
        await dialog.locator('video').evaluate(el => { el.muted = false; });
        await dialog.getByRole('button', { name: 'Continuar secuencia' }).click();
        await expect(dialog.getByAltText('Imagen del clip 2')).toBeVisible();
        const audio = await dialog.locator('.k-video-music audio').elementHandle();
        await page.keyboard.press('Escape');
        expect(await audio.evaluate(el => el.paused)).toBe(true);
      } else {
        await expect(video).toHaveAttribute('src', /clip-one/);
      }
      const audio = await music.elementHandle();
      if (width === 390) await page.getByRole('button', { name: 'Abrir más secciones' }).click();
      await page.locator('a[href="/kairos"]:visible').first().click();
      await expect(page.locator('.k-video-sequence')).toHaveCount(0);
      expect(await audio.evaluate(el => el.paused)).toBe(true);
    });
  }
}

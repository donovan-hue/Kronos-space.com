import { test, expect } from '@playwright/test';
import { fixture, PUBLICACION_AJENA } from './helpers/kit.js';

// Archivos reales generados en memoria: se ejercen los decodificadores y
// relojes del navegador sin añadir binarios al repositorio ni acceder a producción.
let webm;
function wav() {
  const rate = 8000;
  const samples = rate * 12;
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

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  const bytes = await page.evaluate(async () => {
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
  });
  webm = Buffer.from(bytes);
  await page.close();
});

async function preparar(page, ruta, legacy = false) {
  await fixture(page);
  const track = { inicio: 1, fin: 9, volumen: 0.6, fundidoEntrada: 0.2, fundidoSalida: 0.5,
    ...(legacy ? { trackId: '507f1f77bcf86cd799439011' } : { url: '/uploads/music/test.wav' }) };
  const posts = [{ ...PUBLICACION_AJENA, _id: 'music-post', content: 'Video musical', media: { type: 'video', url: '/uploads/music-test.webm', music: track } }];
  await page.route('**/api/posts**', r => r.fulfill({ json: { posts, hasMore: false, page: 1 } }));
  await page.route('**/api/music/507f1f77bcf86cd799439011', r => r.fulfill({ json: { pista: { url: '/uploads/music/test.wav' } } }));
  await page.route('**/uploads/music-test.webm', r => r.fulfill({ contentType: 'video/webm', body: webm }));
  await page.route('**/uploads/music/test.wav', r => {
    const bytes = wav();
    const range = r.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    return r.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', body: bytes.subarray(start, end + 1),
      headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) } });
  });
  await page.goto(ruta);
  const stage = page.locator(ruta === '/home' ? '.k-post-media-frame' : '.k-vertical-stage').first();
  await expect(stage.locator('video')).toBeVisible();
  await expect.poll(() => stage.locator('audio').evaluate(el => el.readyState)).toBeGreaterThanOrEqual(1);
  await page.locator('.page h1').click();
  await stage.locator('video').evaluate(async el => { el.loop = true; el.muted = false; await el.play(); });
  return stage;
}

async function suena(stage) {
  await expect.poll(() => stage.evaluate(el => {
    const video = el.querySelector('video'); const audio = el.querySelector('audio');
    return !video.paused && !audio.paused && !audio.muted && audio.currentTime > 1 && Math.abs(audio.currentTime - video.currentTime - 1) < 0.3;
  })).toBe(true);
}

for (const width of [390, 1280]) {
  for (const ruta of ['/home', '/vertical']) {
    test(`música sincronizada con pausa, silencio y volumen en ${ruta} · ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const stage = await preparar(page, ruta, width === 390);
      await suena(stage);
      await stage.locator('video').evaluate(el => el.pause());
      await expect.poll(() => stage.locator('audio').evaluate(el => el.paused)).toBe(true);
      await stage.locator('video').evaluate(async el => { el.volume = 0.5; el.playbackRate = 1.5; await el.play(); });
      await suena(stage);
      await expect.poll(() => stage.locator('audio').evaluate(el => el.playbackRate)).toBe(1.5);
      await expect.poll(() => stage.locator('audio').evaluate(el => el.volume)).toBeCloseTo(0.3, 1);
      await stage.locator('video').evaluate(el => { el.muted = true; });
      await expect.poll(() => stage.locator('audio').evaluate(el => el.muted && el.paused)).toBe(true);
      await stage.locator('video').evaluate(el => { el.muted = false; });
      await suena(stage);
      if (ruta === '/home') {
        await page.getByRole('button', { name: 'Ver video en pantalla completa' }).click();
        await expect.poll(() => stage.locator('audio').evaluate(el => el.paused)).toBe(true);
        const dialog = page.getByRole('dialog');
        await dialog.locator('video').evaluate(async el => { el.loop = true; await el.play(); });
        await suena(dialog);
        const audio = await dialog.locator('audio').elementHandle();
        await page.keyboard.press('Escape');
        expect(await audio.evaluate(el => el.paused)).toBe(true);
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
      await page.goto('/kairos');
      await expect(page.locator('audio')).toHaveCount(0);
    });
  }
}

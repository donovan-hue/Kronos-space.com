import { test, expect } from '@playwright/test';
import { fixture, PUBLICACION_AJENA } from './helpers/kit.js';

let webm;
function wav() {
  const rate = 8000; const samples = rate * 5;
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
  const media = {
    type: 'video', url: '/uploads/voice-test.webm',
    music: { url: '/uploads/music/test.wav', volumen: 0.25 },
    edit: { voz: { url: '/uploads/voices/test.wav', inicio: 0.4, fin: 1.6, volumen: 0.8, fundidoEntrada: 0.1, fundidoSalida: 0.1 } }
  };
  const posts = [{ ...PUBLICACION_AJENA, _id: 'voice-post', content: 'Video con voz', media }];
  await page.route('**/api/posts**', r => r.fulfill({ json: { posts, hasMore: false, page: 1 } }));
  await page.route('**/uploads/voice-test.webm', r => r.fulfill({ contentType: 'video/webm', body: webm }));
  await page.route(/\/uploads\/(voices|music)\/test\.wav/, r => {
    const bytes = wav(); const range = r.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    return r.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', body: bytes.subarray(start, end + 1),
      headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) } });
  });
  await page.goto(ruta);
  const stage = page.locator(ruta === '/home' ? '.k-post-media-frame' : '.k-vertical-stage').first();
  await expect(stage.locator('video')).toBeVisible();
  await expect.poll(() => stage.locator('.k-video-voice audio').evaluate(el => el.readyState)).toBeGreaterThanOrEqual(1);
  await stage.locator('video').evaluate(el => { el.pause(); el.currentTime = 0; el.muted = false; el.loop = true; });
  await expect.poll(() => stage.locator('video').evaluate(el => el.seeking)).toBe(false);
  await page.locator('.page h1').click();
  return stage;
}

async function reproducirDesde(stage, time = 0.8) {
  await stage.locator('video').evaluate(async (el, time) => {
    el.currentTime = time; el.muted = false; await el.play();
  }, time);
}
async function suena(stage) {
  await expect.poll(() => stage.evaluate(el => {
    const video = el.querySelector('video'); const audio = el.querySelector('.k-video-voice audio');
    return !video.paused && !audio.paused && !audio.muted && audio.currentTime > 0.2 && Math.abs(audio.currentTime - (video.currentTime - 0.4)) < 0.25;
  })).toBe(true);
}

for (const width of [390, 1280]) {
  for (const ruta of ['/home', '/vertical']) {
    test(`voz con entrada propia, controles y música simultánea en ${ruta} · ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const stage = await preparar(page, ruta);
      const voiceAudio = stage.locator('.k-video-voice audio');
      const musicAudio = stage.locator('.k-video-music audio');
      await expect.poll(() => voiceAudio.evaluate(el => el.paused)).toBe(true);
      await stage.locator('video').evaluate(el => el.play());
      await expect.poll(() => stage.evaluate(el => {
        const v = el.querySelector('video'); const a = el.querySelector('.k-video-voice audio');
        return v.currentTime >= 0.4 && !a.paused;
      })).toBe(true);
      await suena(stage);
      await stage.locator('video').evaluate(el => el.pause());
      await expect.poll(() => voiceAudio.evaluate(el => el.paused)).toBe(true);
      await expect.poll(() => musicAudio.evaluate(el => el.paused)).toBe(true);
      await stage.locator('video').evaluate(el => { el.volume = 0.5; el.playbackRate = 1.25; });
      await reproducirDesde(stage);
      await suena(stage);
      await expect.poll(() => voiceAudio.evaluate(el => el.playbackRate)).toBe(1.25);
      await expect.poll(() => voiceAudio.evaluate(el => el.volume)).toBeCloseTo(0.4, 1);
      await expect.poll(() => musicAudio.evaluate(el => el.volume)).toBeCloseTo(0.125, 2);
      await stage.locator('video').evaluate(el => { el.muted = true; });
      await expect.poll(() => voiceAudio.evaluate(el => el.paused && el.muted)).toBe(true);
      await expect.poll(() => musicAudio.evaluate(el => el.paused && el.muted)).toBe(true);
      await reproducirDesde(stage);
      await suena(stage);
      // Salto fuera del tramo: no continúa la toma ni se repite sola.
      await stage.locator('video').evaluate(async el => { el.loop = false; el.currentTime = 1.7; await el.play(); });
      await expect.poll(() => voiceAudio.evaluate(el => el.paused)).toBe(true);
      await reproducirDesde(stage);
      await suena(stage);
      if (ruta === '/home') {
        await page.getByRole('button', { name: 'Ver video en pantalla completa' }).click();
        await expect.poll(() => voiceAudio.evaluate(el => el.paused)).toBe(true);
        await expect.poll(() => musicAudio.evaluate(el => el.paused)).toBe(true);
        const dialog = page.getByRole('dialog');
        await reproducirDesde(dialog);
        await suena(dialog);
        const audio = await dialog.locator('.k-video-voice audio').elementHandle();
        await page.keyboard.press('Escape');
        expect(await audio.evaluate(el => el.paused)).toBe(true);
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
      const audio = await voiceAudio.elementHandle();
      if (width === 390) await page.getByRole('button', { name: 'Abrir más secciones' }).click();
      await page.locator('a[href="/kairos"]:visible').first().click();
      await expect(page.locator('.k-video-voice')).toHaveCount(0);
      expect(await audio.evaluate(el => el.paused)).toBe(true);
    });
  }
}

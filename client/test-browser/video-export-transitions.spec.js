// KRONOS-NO-MOCK — reproductor y /api con material local y respuestas fijas: mide fundido, pausa y limpieza de recursos; «publicar la receta» se comprueba en la petición, no en la base.

import { test, expect } from '@playwright/test';
import fixWebmDuration from 'fix-webm-duration';
import { fixture, PUBLICACION_AJENA } from './helpers/kit.js';

let webm;
function wav(hz) {
  const rate = 16000; const count = rate * 5; const b = Buffer.alloc(44 + count * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) b.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * hz / rate) * 3000), 44 + i * 2);
  return b;
}
function range(route, bytes, contentType) {
  const match = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
  const a = match ? Number(match[1]) : 0; const z = match?.[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
  return route.fulfill({ status: match ? 206 : 200, contentType, body: bytes.subarray(a, z + 1), headers: { 'Accept-Ranges': 'bytes', ...(match ? { 'Content-Range': `bytes ${a}-${z}/${bytes.length}` } : {}) } });
}
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.setContent('<button>Activar audio de prueba</button>'); await page.getByRole('button').click();
  webm = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 108; const ctx = canvas.getContext('2d');
    const audio = new AudioContext(); await audio.resume(); const dest = audio.createMediaStreamDestination(); const tone = audio.createOscillator(); const gain = audio.createGain();
    tone.frequency.value = 440; gain.gain.value = 0.08; tone.connect(gain); gain.connect(dest); tone.start();
    const stream = canvas.captureStream(20); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' }); const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data); const done = new Promise(resolve => { recorder.onstop = resolve; });
    const draw = () => { ctx.fillStyle = '#ee1111'; ctx.fillRect(0, 0, 192, 108); }; draw(); recorder.start();
    const timer = setInterval(draw, 50); await new Promise(resolve => setTimeout(resolve, 2200)); recorder.stop(); await done;
    clearInterval(timer); stream.getTracks().forEach(t => t.stop()); tone.stop(); await audio.close();
    return Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()));
  }));
  await page.close();
  const Reader = globalThis.FileReader;
  globalThis.FileReader = class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend(); }); } };
  try { webm = Buffer.from(await (await fixWebmDuration(new Blob([webm], { type: 'video/webm' }), 2200, { logger: false })).arrayBuffer()); }
  finally { if (Reader) globalThis.FileReader = Reader; else delete globalThis.FileReader; }
});
async function setup(page, ruta = '/home', engine = false) {
  await fixture(page);
  await page.route('**/uploads/export-source.webm', r => range(r, webm, 'video/webm'));
  await page.route('**/uploads/export-image.svg', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="108"><rect width="192" height="108" fill="#1111ee"/></svg>' }));
  await page.route('**/uploads/music/export.wav', r => range(r, wav(220), 'audio/wav'));
  await page.route('**/uploads/voices/export.wav', r => range(r, wav(880), 'audio/wav'));
  const media = { type: 'video', url: '/uploads/export-source.webm', duration: 2.2, edit: { clips: [
    { tipo: 'video', url: '/uploads/export-source.webm', duracion: 2.2, inicio: 0.2, fin: 1.4, velocidad: 1 },
    { tipo: 'image', url: '/uploads/export-image.svg', duracion: 2, transicion: { tipo: 'fundido', duracion: 0.6 } },
    { tipo: 'video', url: '/uploads/export-source.webm', duracion: 2.2, inicio: 0.2, fin: 1.4, velocidad: 1, transicion: { tipo: 'barrido', duracion: 0.5 } }
  ] } };
  const posts = [{ ...PUBLICACION_AJENA, _id: 'transition-post', content: 'Transiciones reales', media }];
  await page.route('**/api/posts**', r => r.fulfill({ json: { posts, hasMore: false, page: 1 } }));
  if (engine) {
    await page.route('**/__media-engine__', route => route.fulfill({ contentType: 'text/html', body: '<button>Activar audio de prueba</button>' }));
    await page.goto('/__media-engine__'); await page.getByRole('button', { name: 'Activar audio de prueba' }).click();
  } else { await page.goto(ruta); await page.locator('.page h1').click(); }
}
for (const width of [390, 1280]) for (const surface of ['home', 'vertical', 'viewer']) {
  test(`fundido real, pausa y limpieza en ${surface} · ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await setup(page, surface === 'vertical' ? '/vertical' : '/home');
    if (surface === 'viewer') await page.getByRole('button', { name: 'Ver video en pantalla completa' }).first().click();
    const stage = surface === 'viewer' ? page.getByRole('dialog') : page.locator(surface === 'home' ? '.k-post-media-frame' : '.k-vertical-stage').first();
    const canvas = stage.locator('.k-video-transition-canvas');
    await stage.getByRole('button', { name: 'Clip anterior' }).evaluate(button => { if (!button.disabled) button.click(); });
    await stage.evaluate(element => {
      // Observa el lienzo y pulsa el control público: también funciona con
      // el artefacto compilado, que no expone módulos /src ni relojes internos.
      const observe = () => {
        const canvas = element.querySelector('.k-video-transition-canvas');
        if (canvas && !canvas.hidden && element.querySelector('.k-video-sequence-image')?.complete) {
          const pixel = canvas.getContext('2d').getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
          if (pixel[0] > 65 && pixel[0] < 180 && pixel[2] > 65) {
            [...element.querySelectorAll('button')].find(button => button.textContent === 'Pausar secuencia')?.click(); element.dataset.transitionPaused = 'true'; return;
          }
        }
        requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });
    await stage.locator('video').evaluate(v => v.play());
    await expect(stage).toHaveAttribute('data-transition-paused', 'true');
    await expect(stage.getByRole('button', { name: 'Continuar secuencia' })).toBeVisible(); await expect(canvas).toBeVisible();
    const pixel = () => canvas.evaluate(c => Array.from(c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data));
    const mixed = await pixel(); expect(mixed[0]).toBeGreaterThan(40); expect(mixed[2]).toBeGreaterThan(25);
    await page.waitForTimeout(150); expect(await pixel()).toEqual(mixed);
    await stage.getByRole('button', { name: 'Continuar secuencia' }).click(); await expect(canvas).toBeHidden();
    if (surface === 'viewer') { await page.getByRole('button', { name: 'Cerrar visor' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); }
  });
}





for (const width of [390, 1280]) test(`exportar, descargar y publicar el archivo sin duplicar la receta · ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 }); await setup(page); await page.goto('/create/post');
  const editor = page.getByRole('textbox', { name: 'Contenido de la publicación' });
  await editor.fill('Video exportado desde el estudio');
  await page.getByLabel('Seleccionar imagen o video').setInputFiles({ name: 'original.webm', mimeType: 'video/webm', buffer: webm });
  await page.getByRole('button', { name: 'Abrir estudio', exact: true }).click();
  const studio = page.getByRole('dialog', { name: 'Estudio del video' });
  await studio.getByRole('tab', { name: 'Clips', exact: true }).click();
  await studio.getByRole('listitem', { name: 'Velocidad 2x', exact: true }).click();
  await studio.getByRole('tab', { name: 'Texto', exact: true }).click();
  await studio.getByPlaceholder('Escribe algo corto').fill('ARCHIVO EXPORTADO');
  await studio.getByRole('tab', { name: 'Salida', exact: true }).click();
  await studio.getByRole('combobox', { name: 'Medida', exact: true }).selectOption('1:1');
  await studio.getByRole('button', { name: 'Exportar video (WebM)' }).click();
  await expect(studio.getByRole('button', { name: 'Cancelar exportación' })).toBeVisible();
  await expect(studio.getByRole('link', { name: 'Descargar video exportado' })).toBeVisible({ timeout: 20000 });
  const [download] = await Promise.all([page.waitForEvent('download'), studio.getByRole('link', { name: 'Descargar video exportado' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^kronos-video-.*\.webm$/);
  await expect(studio.getByLabel('Vista previa del video exportado')).toBeVisible();
  await studio.getByRole('button', { name: 'Usar video exportado' }).click();
  await expect(studio).toHaveCount(0);
  let payload; let upload;
  await page.route('**/api/posts/media/upload', r => { upload = r.request().postDataBuffer(); return r.fulfill({ json: { url: '/uploads/rendered.webm', type: 'video' } }); });
  await page.route('**/api/posts', r => {
    if (r.request().method() !== 'POST') return r.fallback();
    payload = r.request().postDataJSON(); return r.fulfill({ json: { post: { ...PUBLICACION_AJENA, _id: 'exported-post', content: payload.content, media: payload.media } } });
  });
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect.poll(() => Boolean(payload)).toBe(true);
  expect(upload.toString('latin1')).toContain('filename="kronos-video-');
  expect(payload.media).toMatchObject({ type: 'video', width: 108, height: 108, music: null, edit: null });
  expect(payload.media.trim.start).toBe(0); expect(payload.media.trim.end).toBeCloseTo(1, 1);
});



test('publicar la receta conserva la velocidad, la imagen elegida, la transición, el filtro y el texto en HTTP', async ({ page }) => {
  await setup(page); await page.goto('/create/post');
  await page.getByRole('textbox', { name: 'Contenido de la publicación' }).fill('Receta sin recodificar');
  await page.getByLabel('Seleccionar imagen o video').setInputFiles({ name: 'original.webm', mimeType: 'video/webm', buffer: webm });
  await page.getByRole('button', { name: 'Abrir estudio', exact: true }).click();
  const studio = page.getByRole('dialog', { name: 'Estudio del video' });
  await studio.getByRole('tab', { name: 'Clips', exact: true }).click();
  await studio.getByRole('listitem', { name: 'Velocidad 2x', exact: true }).click();
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 108; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#1111ee'; ctx.fillRect(0, 0, 192, 108); return canvas.toDataURL().split(',')[1]; });
  await studio.getByLabel('Agregar un clip a la línea de tiempo').setInputFiles({ name: 'azul.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await studio.getByLabel('Duración de la imagen (segundos)').fill('1');
  await studio.getByRole('combobox', { name: 'Transición con la toma anterior' }).selectOption('fundido');
  await studio.getByRole('tab', { name: 'Filtros', exact: true }).click(); await studio.getByRole('listitem', { name: 'Noir', exact: true }).click();
  await studio.getByRole('tab', { name: 'Texto', exact: true }).click(); await studio.getByPlaceholder('Escribe algo corto').fill('RECETA GUARDADA');
  await studio.getByRole('button', { name: 'Aplicar edición', exact: true }).click(); await expect(studio).toHaveCount(0);
  let payload; let uploads = 0;
  await page.route('**/api/posts/media/upload', r => r.fulfill({ json: uploads++ === 0 ? { url: '/uploads/main.webm', type: 'video' } : { url: '/uploads/azul.png', type: 'image' } }));
  await page.route('**/api/posts', r => { if (r.request().method() !== 'POST') return r.fallback(); payload = r.request().postDataJSON(); return r.fulfill({ json: { post: { ...PUBLICACION_AJENA, _id: 'recipe-post', media: payload.media } } }); });
  await page.getByRole('button', { name: 'Publicar', exact: true }).click(); await expect.poll(() => Boolean(payload)).toBe(true);
  expect(uploads).toBe(2); expect(payload.media.edit.filtro.id).toBe('negro'); expect(payload.media.edit.texto.contenido).toBe('RECETA GUARDADA');
  expect(payload.media.edit.clips).toMatchObject([{ url: '/uploads/main.webm', tipo: 'video', velocidad: 2 }, { url: '/uploads/azul.png', tipo: 'image', duracion: 1, transicion: { tipo: 'fundido', duracion: 0.25 } }]);
  expect(payload.media.edit.duracionTotal).toBe(2);
});

// El motor se ejercita directamente en Vite; los recorridos de exportar,
// descargar y publicar de arriba ejercitan el bundle de producción del app.
test.describe('Motor de exportación con archivos reales', () => {
  test.use({ baseURL: process.env.KRONOS_DESIGN_URL || 'http://localhost:3002' });
test('exporta video, imagen, cortes, velocidades, transición, tono, texto y mezcla de tres audios a un WebM reproducible', async ({ page }) => {
  await setup(page, '/home', true);
  const result = await page.evaluate(async () => {
    const { exportarVideo } = await import('/src/lib/videoExport.js');
    const out = await exportarVideo({ clips: [
      { tipo: 'video', url: '/uploads/export-source.webm', duracion: 2.2, inicio: 0.3, fin: 1.3, velocidad: 2 },
      { tipo: 'image', url: '/uploads/export-image.svg', duracion: 0.8, transicion: { tipo: 'fundido', duracion: 0.25 } },
      { tipo: 'video', url: '/uploads/export-source.webm', duracion: 2.2, inicio: 0.4, fin: 1.2, velocidad: 0.5, transicion: { tipo: 'barrido', duracion: 0.3 } }
    ], receta: { medida: 'original', corte: { silenciar: false }, ajustes: { brillo: 0.7, vineta: 0.2 }, texto: { contenido: 'EXPORTADO', posicion: 'arriba', color: '#ffffff', tamano: 1, fondo: true },
      musica: { trackId: 'music', url: '/uploads/music/export.wav', inicio: 0.2, fin: 4, volumen: 0.8, fundidoEntrada: 0, fundidoSalida: 0 },
      voz: { url: '/uploads/voices/export.wav', inicio: 0.6, fin: 2.5, volumen: 0.8, fundidoEntrada: 0, fundidoSalida: 0 }
    }, vozUrl: '/uploads/voices/export.wav' });
    const audio = new AudioContext(); const decoded = await audio.decodeAudioData(await out.file.arrayBuffer()); const samples = decoded.getChannelData(0);
    const energy = (hz, from, to) => {
      const a = Math.floor(from * decoded.sampleRate), b = Math.min(samples.length, Math.floor(to * decoded.sampleRate)); let x = 0, y = 0;
      for (let i = a; i < b; i++) { x += samples[i] * Math.cos(2 * Math.PI * hz * i / decoded.sampleRate); y += samples[i] * Math.sin(2 * Math.PI * hz * i / decoded.sampleRate); }
      return Math.sqrt(x * x + y * y) / (b - a);
    };
    const sound = { original: energy(440, 0.1, 0.4), music: energy(220, 0.8, 1.1), voice: energy(880, 0.8, 1.1), absentOriginal: energy(440, 0.8, 1.1), absentVoice: energy(880, 0.1, 0.4), lateOriginal: energy(440, 1.7, 2.1) }; await audio.close();
    const video = document.createElement('video'); video.muted = true; const url = URL.createObjectURL(out.file); video.src = url;
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
    const duration = video.duration;
    const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 108; const ctx = canvas.getContext('2d');
    const frame = async t => { video.currentTime = t; await new Promise(resolve => { video.onseeked = resolve; }); ctx.drawImage(video, 0, 0); return Array.from(ctx.getImageData(96, 70, 1, 1).data); };
    const red = await frame(0.2); const blue = await frame(1); const last = await frame(2.1);
    const textPixels = ctx.getImageData(15, 4, 165, 17).data; let white = 0;
    for (let i = 0; i < textPixels.length; i += 4) if (textPixels[i] > 195 && textPixels[i + 1] > 195 && textPixels[i + 2] > 195) white++;
    video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
    return { type: out.file.type, size: out.file.size, width: out.width, height: out.height, duration, red, blue, last, sound, white, hosts: document.querySelectorAll('[style*="-10000px"]').length };
  });
  expect(result.type).toBe('video/webm'); expect(result.size).toBeGreaterThan(3000); expect(result.duration).toBeCloseTo(2.9, 1);
  expect([result.width, result.height]).toEqual([192, 108]);
  expect(result.red[0]).toBeGreaterThan(95); expect(result.red[0]).toBeLessThan(210); expect(result.red[2]).toBeLessThan(40);
  expect(result.blue[2]).toBeGreaterThan(90); expect(result.blue[0]).toBeLessThan(40); expect(result.last[0]).toBeGreaterThan(95); expect(result.white).toBeGreaterThan(30);
  expect(result.sound.original).toBeGreaterThan(0.008); expect(result.sound.music).toBeGreaterThan(0.008); expect(result.sound.voice).toBeGreaterThan(0.008);
  expect(result.sound.absentOriginal).toBeLessThan(result.sound.original / 4); expect(result.sound.absentVoice).toBeLessThan(result.sound.voice / 4); expect(result.sound.lateOriginal).toBeGreaterThan(0.008);
  expect(result.hosts).toBe(0);
});

test('cancela y limpia la exportación y no invoca generación de voz', async ({ page }) => {
  await setup(page, '/home', true); const tts = []; page.on('request', r => { if (/voices.*generat|tts/i.test(r.url())) tts.push(r.url()); });
  const results = await page.evaluate(async () => {
    const { exportarVideo } = await import('/src/lib/videoExport.js'); const clips = [{ tipo: 'video', url: '/uploads/export-source.webm', duracion: 2.2, inicio: 0.2, fin: 1.4 }];
    const abort = new AbortController(); setTimeout(() => abort.abort(), 350);
    let canceled; try { await exportarVideo({ clips, receta: { medida: 'original' }, signal: abort.signal }); } catch (e) { canceled = e.name; }
    let voice; try { await exportarVideo({ clips, receta: { voz: { voiceId: 'provider-only' } } }); } catch (e) { voice = e.message; }
    return { canceled, voice, hosts: document.querySelectorAll('[style*="-10000px"]').length };
  });
  expect(results.canceled).toBe('AbortError'); expect(results.voice).toMatch(/Genera o graba/); expect(results.hosts).toBe(0); expect(tts).toEqual([]);
});

test('descarta exportaciones con archivos rotos y al ocultar la pestaña', async ({ page }) => {
  await setup(page, '/home', true);
  await page.route('**/uploads/broken.webm', r => r.fulfill({ status: 404, body: '' }));
  const result = await page.evaluate(async () => {
    const { exportarVideo } = await import('/src/lib/videoExport.js'); const receta = { medida: 'original' };
    let broken; try { await exportarVideo({ clips: [{ tipo: 'video', url: '/uploads/broken.webm', duracion: 2 }], receta }); } catch (e) { broken = e.message; }
    const timer = setTimeout(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); }, 350);
    let hidden; try { await exportarVideo({ clips: [{ tipo: 'video', url: '/uploads/export-source.webm', duracion: 2.2, fin: 1.8 }], receta }); } catch (e) { hidden = e.message; }
    finally { clearTimeout(timer); delete document.hidden; }
    return { broken, hidden, hosts: document.querySelectorAll('[style*="-10000px"]').length };
  });
  expect(result.broken).toMatch(/No se pudo cargar el clip 1/); expect(result.hidden).toMatch(/pestaña visible/); expect(result.hosts).toBe(0);
});
});

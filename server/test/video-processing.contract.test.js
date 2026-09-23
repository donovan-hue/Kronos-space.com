const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const postsRouter = require("../src/modules/posts/posts.routes");
const { parseMedia, parseSubtitles, parseTrim, parseVideoVariants } = postsRouter;

test("037: parseVideoVariants valida resoluciones permitidas y limpia campos", () => {
  const input = [
    { resolution: "1080p", url: "/uploads/media/vid-1080.mp4", size: 5000000 },
    { resolution: "720p", url: "/uploads/media/vid-720.mp4", size: 3000000 },
    { resolution: "240p", url: "/uploads/media/vid-240.mp4" } // invalido
  ];
  const variants = parseVideoVariants(input);
  assert.equal(variants.length, 2);
  assert.equal(variants[0].resolution, "1080p");
  assert.equal(variants[0].size, 5000000);
  assert.equal(variants[1].resolution, "720p");
});

test("038: parseSubtitles valida idiomas, texto VTT y aprobación del autor", () => {
  const input = [
    { lang: "es-MX", label: "Español (México)", approved: true, vttContent: "WEBVTT\n\n00:00.000 --> 00:04.000\nHola Kronos" },
    { lang: "en-US", label: "English", approved: false, url: "/uploads/subs/en.vtt" }
  ];
  const subs = parseSubtitles(input);
  assert.equal(subs.length, 2);
  assert.equal(subs[0].approved, true);
  assert.match(subs[0].vttContent, /WEBVTT/);
  assert.equal(subs[1].approved, false);
});

test("039: parseTrim valida inicio, fin y estado silenciado", () => {
  const valid = parseTrim({ start: 5, end: 25, muted: true });
  assert.deepEqual(valid, { start: 5, end: 25, muted: true });

  const invalid = parseTrim(null);
  assert.deepEqual(invalid, { start: 0, end: 0, muted: false });
});

test("040: parseMedia para video no fabrica variantes sin transcodificador real", () => {
  const parsed = parseMedia({
    url: "/uploads/media/test-video.mp4",
    type: "video",
    size: 4000000,
    width: 1080,
    height: 1920,
    variants: [
      { resolution: "720p", url: "/uploads/media/falsa-720.mp4" }
    ],
    processingStatus: "completed"
  });

  assert.equal(parsed.error, undefined);
  assert.equal(parsed.media.type, "video");
  assert.equal(parsed.media.orientation, "vertical");
  assert.equal(parsed.media.processingStatus, "ready");
  assert.deepEqual(parsed.media.variants, [], "no se anuncian salidas no transcodificadas");
});

test("041: rutas de subtítulos y recorte de video están montadas y exigen autenticación", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/posts", postsRouter);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const subRes = await fetch(`${baseUrl}/api/posts/64b5f5f0f0f0f0f0f0f0f0f0/subtitles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtitles: [] })
    });
    assert.equal(subRes.status, 401);

    const trimRes = await fetch(`${baseUrl}/api/posts/64b5f5f0f0f0f0f0f0f0f0f0/video-trim`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trim: { start: 0, end: 10 } })
    });
    assert.equal(trimRes.status, 401);
  } finally {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

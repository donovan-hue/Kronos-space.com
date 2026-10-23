import { beforeEach, expect, test, vi } from "vitest";
import { api } from "../src/services/apiClient";
import { createPost } from "../src/services/postsService";
vi.mock("../src/services/apiClient", () => ({ api: { post: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); api.post.mockResolvedValue({ data: { post: { _id: "created" } } }); });

test("el transporte conserva corte, velocidad, orden, transiciones y los ajustes de video", async () => {
  const edit = { version: 1, filtro: { id: "negro", intensidad: 0.7 }, ajustes: { brillo: 1.2 }, texto: { contenido: "Literal" }, corte: { inicio: 1, fin: 4, silenciar: true },
    clips: [{ url: "/uploads/a.webm", tipo: "video", inicio: 1, fin: 4, velocidad: 2 }, { url: "/uploads/b.png", tipo: "image", duracion: 3, transicion: { tipo: "barrido", duracion: 0.5 } }], voz: { url: "/uploads/voices/a.webm", inicio: 1, fin: 4 } };
  const media = { url: "/uploads/a.webm", type: "video", width: 1920, height: 1080, duration: 4.5, trim: { start: 1, end: 4, muted: true }, music: { url: "/uploads/music/a.mp3", inicio: 2, fin: 10 }, edit, ignored: "no viajar" };
  await createPost("Pieza del estudio", { media });
  const sent = api.post.mock.calls[0][1].media;
  expect(sent).toMatchObject({ width: 1920, height: 1080, duration: 4.5, trim: media.trim, music: media.music, edit });
  expect(sent).not.toHaveProperty("ignored");
});
test("el archivo ya compuesto se publica sin repetir filtros, clips, música o voz", async () => {
  await createPost("Exportado", { media: { url: "/uploads/render.webm", type: "video", width: 1080, height: 1920, duration: 3, trim: { start: 0, end: 3, muted: false } } });
  expect(api.post.mock.calls[0][1].media).toMatchObject({ width: 1080, height: 1920, duration: 3, trim: { start: 0, end: 3, muted: false }, music: null, edit: null });
});
test("no añade recetas ni metadatos de video a fotografías", async () => {
  await createPost("Foto", { media: { url: "/uploads/a.jpg", type: "image", edit: { version: 1 }, trim: { start: 4 } } });
  expect(api.post.mock.calls[0][1].media).not.toHaveProperty("edit"); expect(api.post.mock.calls[0][1].media).not.toHaveProperty("trim");
});

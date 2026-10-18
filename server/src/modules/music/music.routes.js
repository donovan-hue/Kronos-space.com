const express = require("express");

const MusicTrack = require("./MusicTrack");
const auth = require("../../middleware/auth");
const requireAdmin = require("../../middleware/requireAdmin");
const { requireUser } = require("../../middleware/permissions");
const { handleAudioUpload } = require("../../middleware/upload");
const { saveBuffer } = require("../../config/storage");

const router = express.Router();

/* ============================================================
   MÚSICA DEL ESTUDIO

   Lo que faltaba para que la pestaña Música del estudio sirviera: un
   catálogo real que el cliente pueda leer.

   - GET  /api/music   → lista de pistas publicadas (cualquiera con sesión)
   - POST /api/music   → publica una pista al catálogo (solo administración)

   Reglas:
   - solo se listan pistas publicadas;
   - las URLs solo pueden ser locales (/uploads/music/...): el catálogo no
     reenvía a servidores de terceros;
   - la duración se declara o queda en 0. Nunca se inventa.
   ============================================================ */

const LIMITE_POR_DEFECTO = 60;
const LIMITE_MAXIMO = 100;
const MAX_ETIQUETAS = 6;
const MAX_ETIQUETA = 32;

function esUrlLocalDeMusica(url) {
  return typeof url === "string" && url.startsWith("/uploads/music/");
}

function limpiarEtiquetas(raw) {
  const lista = Array.isArray(raw) ? raw : String(raw || "").split(",");
  return lista
    .map((etiqueta) => String(etiqueta || "").trim().toLowerCase().slice(0, MAX_ETIQUETA))
    .filter(Boolean)
    .filter((etiqueta, indice, todas) => todas.indexOf(etiqueta) === indice)
    .slice(0, MAX_ETIQUETAS);
}

function comoPista(documento) {
  return {
    _id: String(documento._id),
    titulo: documento.titulo,
    autor: documento.autor || "",
    duracion: documento.duracion || 0,
    etiquetas: Array.isArray(documento.etiquetas) ? documento.etiquetas : [],
    licencia: documento.licencia || "",
    url: documento.url,
    mimeType: documento.mimeType || "",
    portadaUrl: documento.portadaUrl || "",
    publicada: Boolean(documento.publicada),
    creada: documento.createdAt
  };
}

/**
 * GET /api/music
 * Catálogo del estudio: pistas publicadas, con búsqueda y filtro por
 * etiqueta. Devuelve `{ pistas, total, pagina, limite }`.
 */
router.get("/", auth, requireUser, async (req, res) => {
  try {
    const limiteBruto = Number.parseInt(String(req.query.limite ?? ""), 10);
    const limite = Number.isFinite(limiteBruto) && limiteBruto > 0
      ? Math.min(limiteBruto, LIMITE_MAXIMO)
      : LIMITE_POR_DEFECTO;
    const paginaBruta = Number.parseInt(String(req.query.pagina ?? ""), 10);
    const pagina = Number.isFinite(paginaBruta) && paginaBruta > 0 ? paginaBruta : 1;

    const filtro = { publicada: true };
    const etiqueta = String(req.query.etiqueta || "").trim().toLowerCase();
    if (etiqueta) filtro.etiquetas = etiqueta;
    const busqueda = String(req.query.q || "").trim();
    if (busqueda) {
      // Búsqueda por título o autor, sin distinguir mayúsculas. Se escapa el
      // texto para que un punto o un paréntesis no se vuelvan comodines.
      const seguro = busqueda.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 120);
      const expresion = new RegExp(seguro, "i");
      filtro.$or = [{ titulo: expresion }, { autor: expresion }];
    }

    const [pistas, total] = await Promise.all([
      MusicTrack.find(filtro).sort({ createdAt: -1 }).skip((pagina - 1) * limite).limit(limite),
      MusicTrack.countDocuments(filtro)
    ]);

    return res.json({
      pistas: pistas.map(comoPista),
      total,
      pagina,
      limite
    });
  } catch (error) {
    console.error("MUSIC_CATALOG_ERROR:", error);
    return res.status(500).json({ error: "No se pudo leer el catálogo de música" });
  }
});

/**
 * POST /api/music
 * Publica una pista al catálogo (solo administración).
 * Campo `audio` (MP3/M4A/AAC/WAV/OGG/WebM, hasta 15 MB) y los datos como
 * campos del formulario: titulo, autor, duracion, etiquetas, licencia,
 * portadaUrl y publicada.
 */
router.post("/", auth, requireUser, requireAdmin, handleAudioUpload("audio"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "No se recibió ningún archivo de audio" });
    }

    const titulo = String(req.body?.titulo || "").trim();
    if (!titulo) {
      return res.status(400).json({ error: "La pista necesita título" });
    }

    const duracionBruta = Number(req.body?.duracion);
    const duracion = Number.isFinite(duracionBruta) && duracionBruta > 0
      ? Math.min(duracionBruta, 60 * 60 * 6)
      : 0;

    const portadaUrl = String(req.body?.portadaUrl || "").trim();
    if (portadaUrl && !portadaUrl.startsWith("/uploads/") && !/^https?:\/\//i.test(portadaUrl)) {
      return res.status(400).json({ error: "La portada debe ser una URL válida" });
    }

    const { url, size } = await saveBuffer({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      subdir: "music",
      ownerId: req.user?.id || null
    });

    if (!esUrlLocalDeMusica(url)) {
      return res.status(500).json({ error: "La música debe guardarse en el almacén propio" });
    }

    const pista = await MusicTrack.create({
      titulo: titulo.slice(0, 160),
      autor: String(req.body?.autor || "").trim().slice(0, 160),
      url,
      mimeType: req.file.mimetype,
      size,
      duracion,
      portadaUrl,
      etiquetas: limpiarEtiquetas(req.body?.etiquetas),
      licencia: String(req.body?.licencia || "").trim().slice(0, 200),
      publicada: String(req.body?.publicada ?? "true") !== "false",
      subidaPor: req.user?.id || null
    });

    return res.status(201).json({ pista: comoPista(pista) });
  } catch (error) {
    console.error("MUSIC_PUBLISH_ERROR:", error);
    return res.status(500).json({ error: "No se pudo publicar la pista" });
  }
});

module.exports = router;
module.exports.comoPista = comoPista;
module.exports.limpiarEtiquetas = limpiarEtiquetas;
module.exports.esUrlLocalDeMusica = esUrlLocalDeMusica;
module.exports.LIMITE_POR_DEFECTO = LIMITE_POR_DEFECTO;
module.exports.LIMITE_MAXIMO = LIMITE_MAXIMO;

const express = require("express");

const MusicTrack = require("./MusicTrack");
const auth = require("../../middleware/auth");
const requireAdmin = require("../../middleware/requireAdmin");
const { requireUser } = require("../../middleware/permissions");
const { handleAudioUpload } = require("../../middleware/upload");
const { saveBuffer, respondUploadError } = require("../../config/storage");
const { purgeUnreferencedMedia } = require("../../config/mediaLifecycle");

const router = express.Router();

/* ============================================================
   MÚSICA DEL ESTUDIO

   Lo que faltaba para que la pestaña Música del estudio sirviera: un
   catálogo real que el cliente pueda leer.

   - GET    /api/music        → lista de pistas publicadas (cualquiera con sesión)
   - POST   /api/music        → publica una pista al catálogo (solo administración)
   - PATCH  /api/music/:id    → corrige los datos de una pista (administración)
   - DELETE /api/music/:id    → retira la pista del catálogo (administración)

   Corregir y retirar son parte de administrar un catálogo: sin ellas, subir una
   pista con el título mal escrito o una licencia equivocada era irreversible.

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

const ID_PISTA = /^[a-f0-9]{24}$/i;

/**
 * PATCH /api/music/:id — corrige los datos de una pista ya publicada.
 *
 * Solo los campos de texto se pueden tocar: el archivo de audio no se sustituye
 * (eso sería otra pista, con otra licencia y otro tamaño). `publicada` permite
 * retirar del catálogo sin perder la fila, que es reversible; `DELETE` es la
 * baja definitiva.
 */
router.patch("/:id", auth, requireUser, requireAdmin, async (req, res) => {
  if (!ID_PISTA.test(req.params.id)) {
    return res.status(400).json({ error: "Identificador de pista no válido" });
  }
  try {
    const pista = await MusicTrack.findById(req.params.id);
    if (!pista) return res.status(404).json({ error: "Pista no encontrada" });

    const cambios = {};

    if (req.body?.titulo !== undefined) {
      const titulo = String(req.body.titulo).trim();
      if (!titulo) return res.status(400).json({ error: "La pista necesita título" });
      cambios.titulo = titulo.slice(0, 160);
    }
    if (req.body?.autor !== undefined) {
      cambios.autor = String(req.body.autor || "").trim().slice(0, 160);
    }
    if (req.body?.licencia !== undefined) {
      cambios.licencia = String(req.body.licencia || "").trim().slice(0, 200);
    }
    if (req.body?.etiquetas !== undefined) {
      cambios.etiquetas = limpiarEtiquetas(req.body.etiquetas);
    }
    if (req.body?.duracion !== undefined) {
      const duracion = Number(req.body.duracion);
      // Se declara o queda en 0; nunca se inventa un valor.
      cambios.duracion = Number.isFinite(duracion) && duracion > 0
        ? Math.min(duracion, 60 * 60 * 6)
        : 0;
    }
    if (req.body?.portadaUrl !== undefined) {
      const portadaUrl = String(req.body.portadaUrl || "").trim();
      if (portadaUrl && !portadaUrl.startsWith("/uploads/") && !/^https?:\/\//i.test(portadaUrl)) {
        return res.status(400).json({ error: "La portada debe ser una URL válida" });
      }
      cambios.portadaUrl = portadaUrl;
    }
    if (req.body?.publicada !== undefined) {
      cambios.publicada = req.body.publicada !== false && String(req.body.publicada) !== "false";
    }

    if (!Object.keys(cambios).length) {
      return res.status(400).json({ error: "No hay nada que actualizar" });
    }

    Object.assign(pista, cambios);
    await pista.save();
    return res.json({ pista: comoPista(pista) });
  } catch (error) {
    console.error("MUSIC_PATCH_ERROR:", error);
    return res.status(500).json({ error: "No se pudo actualizar la pista" });
  }
});

/**
 * DELETE /api/music/:id — retira la pista del catálogo de forma definitiva.
 *
 * El archivo solo se borra si ya no lo referencia nada: una publicación
 * antigua puede seguir guardando esa URL. `purgeUnreferencedMedia` comprueba
 * las referencias antes de tocar disco o GridFS.
 */
router.delete("/:id", auth, requireUser, requireAdmin, async (req, res) => {
  if (!ID_PISTA.test(req.params.id)) {
    return res.status(400).json({ error: "Identificador de pista no válido" });
  }
  try {
    const pista = await MusicTrack.findById(req.params.id);
    if (!pista) return res.status(404).json({ error: "Pista no encontrada" });

    const url = pista.url;
    await pista.deleteOne();

    let archivoBorrado = false;
    try {
      const eliminadas = await purgeUnreferencedMedia([url]);
      archivoBorrado = eliminadas.length > 0;
    } catch (error) {
      // La fila ya no está: el catálogo queda correcto. Un archivo huérfano en
      // disco se recoge después con `npm run db:media-orphans`; no se miente
      // diciendo que el borrado falló.
      console.error("MUSIC_FILE_PURGE_ERROR:", error);
    }

    return res.json({ eliminada: true, archivoBorrado });
  } catch (error) {
    console.error("MUSIC_DELETE_ERROR:", error);
    return res.status(500).json({ error: "No se pudo retirar la pista" });
  }
});

// Lectura puntual para reproducir publicaciones antiguas que solo guardan
// trackId. Conserva la misma privacidad y filtro de publicación del catálogo.
router.get("/:trackId", auth, requireUser, async (req, res) => {
  if (!/^[a-f0-9]{24}$/i.test(req.params.trackId)) {
    return res.status(400).json({ error: "Identificador de pista no válido" });
  }
  try {
    const pista = await MusicTrack.findOne({ _id: req.params.trackId, publicada: true });
    if (!pista) return res.status(404).json({ error: "Pista no disponible" });
    return res.json({ pista: comoPista(pista) });
  } catch (error) {
    console.error("MUSIC_TRACK_ERROR:", error);
    return res.status(500).json({ error: "No se pudo leer la pista" });
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
    return respondUploadError(res, error, "No se pudo publicar la pista");
  }
});

module.exports = router;
module.exports.comoPista = comoPista;
module.exports.limpiarEtiquetas = limpiarEtiquetas;
module.exports.esUrlLocalDeMusica = esUrlLocalDeMusica;
module.exports.LIMITE_POR_DEFECTO = LIMITE_POR_DEFECTO;
module.exports.LIMITE_MAXIMO = LIMITE_MAXIMO;

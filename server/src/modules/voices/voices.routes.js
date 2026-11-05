const express = require("express");

const Voice = require("./Voice");
const auth = require("../../middleware/auth");
const requireAdmin = require("../../middleware/requireAdmin");
const { recordUsage } = require("../ai-core/aiUsage.service");
const { requireUser } = require("../../middleware/permissions");
const { handleAudioUpload } = require("../../middleware/upload");
const { saveBuffer, respondUploadError } = require("../../config/storage");
const { ajustesVoz } = require("./voiceSettings");
const { generarLocucion, LIMITE_TEXTO } = require("./tts.service");
const { getAIErrorResponse } = require("../../middleware/aiError");
const { aiLimiterFor } = require("../../middleware/aiLimiter");
const cuotaIA = require("../../middleware/cuotaIA");
const { purgeUnreferencedMedia } = require("../../config/mediaLifecycle");

const router = express.Router();

/* ============================================================
   VOCES DEL ESTUDIO

   El catálogo de voces para la voz en off. Misma forma que el catálogo de
   música, con una diferencia: una voz puede ser una grabación propia del
   usuario (sube su archivo y lo usa) o una voz del catálogo, que solo se
   puede usar si tiene modelo y credencial configurada.

   - GET    /api/voices      → voces listadas y, siempre, las del propio usuario
   - POST   /api/voices      → registra una voz al catálogo (solo administración)
   - PATCH  /api/voices/:id  → corrige una voz (administración o su dueño)
   - DELETE /api/voices/:id  → retira una voz (administración o su dueño)

   Una grabación propia es un dato personal: su dueño manda sobre ella aunque no
   sea administrador. El catálogo, en cambio, lo edita solo la administración.

   Reglas:
   - una voz de catálogo sin modelo se devuelve marcada `disponible: false`
     con el motivo; nunca se promete una voz que no se puede generar;
   - los archivos de voz solo pueden ser locales (/uploads/voices/...): el
     catálogo no reenvía a servidores de terceros;
   - la duración se declara o queda en 0. Nunca se inventa.
   ============================================================ */

const LIMITE_POR_DEFECTO = 60;
const LIMITE_MAXIMO = 100;
const IDIOMAS = ["es-MX", "es-ES", "en-US", "pt-BR"];
const GENEROS_VOZ = ["femenina", "masculina", "neutra", ""];
const GENERO_VOZ_POR_DEFECTO = "";
// Lo que el catálogo declara que se puede ajustar en una voz de catálogo.
const AJUSTES_VOZ = ["velocidad", "tono", "volumen"];
// La variable que tiene que existir para que una voz de catálogo se pueda
// usar. Mientras no exista, la voz se lista pero no se puede generar.
const VARIABLE_VOZ = ajustesVoz().variable;

function esUrlLocalDeVoz(url) {
  return typeof url === "string" && url.startsWith("/uploads/voices/");
}

/* Cuántas voces hay realmente disponibles para generar. La cuenta es la
   misma que hace la pantalla: una voz de catálogo sin modelo o sin la
   credencial configurada no cuenta. */
function vocesUsables(voces = [], credencial = Boolean(process.env[VARIABLE_VOZ])) {
  return voces.filter((voz) => (
    voz.tipo === "propia" ? Boolean(voz.url) : Boolean(voz.modelo) && credencial
  ));
}

function comoVoz(voz, { credencial = Boolean(process.env[VARIABLE_VOZ]) } = {}) {
  const propia = voz.tipo !== "catalogo";
  const motivo = propia
    ? (voz.url ? "" : "Esta voz propia todavía no tiene grabación.")
    : (!voz.modelo
      ? "Esta voz todavía no tiene modelo asignado."
      : (!credencial ? "Falta configurar el servicio de voz en el servidor." : ""));

  return {
    _id: String(voz._id),
    nombre: String(voz.nombre || ""),
    descripcion: String(voz.descripcion || ""),
    idioma: String(voz.idioma || ""),
    genero: String(voz.genero || ""),
    tipo: propia ? "propia" : "catalogo",
    url: String(voz.url || ""),
    duracion: Number(voz.duracion || 0),
    modelo: String(voz.modelo || ""),
    vozProveedor: String(voz.vozProveedor || ""),
    ajustes: Array.isArray(voz.configurables) ? voz.configurables : [],
    licencia: String(voz.licencia || ""),
    disponible: !motivo,
    motivo,
    creada: voz.createdAt || null
  };
}

router.get("/", auth, requireUser, async (req, res) => {
  try {
    const limite = Math.min(LIMITE_MAXIMO, Math.max(1, Number(req.query.limite) || LIMITE_POR_DEFECTO));
    // El propio usuario ve sus grabaciones aunque no estén listadas, más el
    // catálogo público. Nadie ve las grabaciones de otro.
    const consulta = {
      $or: [
        { lista: true },
        { registradaPor: req.user?.id || null }
      ]
    };
    if (req.query.idioma) consulta.idioma = String(req.query.idioma).slice(0, 20);
    if (req.query.genero) consulta.genero = String(req.query.genero).slice(0, 20);

    const voces = await Voice.find(consulta).sort({ createdAt: -1 }).limit(limite).lean();
    const ajustes = ajustesVoz();

    return res.json({
      voces: voces.map((voz) => comoVoz(voz, { credencial: ajustes.listo })),
      total: voces.length,
      limite,
      // Si el servicio de voz no está configurado, la verdad va aquí y no en
      // cada tarjeta: la pantalla puede explicarlo una sola vez.
      servicio: {
        listo: ajustes.listo,
        variable: ajustes.variable,
        modelo: ajustes.modelo,
        voz: ajustes.voz,
        limites: ajustes.limites,
        ajustes: AJUSTES_VOZ
      }
    });
  } catch (error) {
    console.error("VOICES_LIST_ERROR:", error);
    return res.status(500).json({ error: "No se pudo leer el catálogo de voces" });
  }
});

router.post("/", auth, requireUser, requireAdmin, handleAudioUpload("audio"), async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || "").trim();
    if (!nombre) {
      return res.status(400).json({ error: "La voz necesita un nombre" });
    }

    const tipo = req.body?.tipo === "propia" ? "propia" : "catalogo";
    const idioma = IDIOMAS.includes(String(req.body?.idioma || ""))
      ? String(req.body.idioma)
      : "es-MX";
    const genero = GENEROS_VOZ.includes(String(req.body?.genero ?? ""))
      ? String(req.body.genero ?? GENERO_VOZ_POR_DEFECTO)
      : GENERO_VOZ_POR_DEFECTO;

    let url = "";
    let mimeType = "";
    let size = 0;

    if (req.file?.buffer) {
      const guardado = await saveBuffer({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
        subdir: "voices",
        ownerId: req.user?.id || null
      });
      url = guardado.url;
      mimeType = req.file.mimetype;
      size = guardado.size;
    }

    const urlDeclarada = String(req.body?.url || "").trim().slice(0, 2000);
    if (!url && urlDeclarada) {
      if (!esUrlLocalDeVoz(urlDeclarada)) {
        return res.status(400).json({ error: "El archivo de voz debe guardarse en el almacén propio" });
      }
      url = urlDeclarada;
    }
    if (url && !esUrlLocalDeVoz(url)) {
      return res.status(500).json({ error: "El archivo de voz debe guardarse en el almacén propio" });
    }

    const voz = await Voice.create({
      nombre: nombre.slice(0, 120),
      descripcion: String(req.body?.descripcion || "").trim().slice(0, 300),
      idioma,
      genero,
      tipo,
      url,
      mimeType,
      size,
      duracion: Math.max(0, Number(req.body?.duracion) || 0),
      modelo: tipo === "catalogo" ? String(req.body?.modelo || "").trim().slice(0, 200) : "",
      vozProveedor: tipo === "catalogo" ? String(req.body?.vozProveedor || "").trim().slice(0, 120) : "",
      configurables: AJUSTES_VOZ,
      licencia: String(req.body?.licencia || "").trim().slice(0, 200),
      lista: Boolean(req.body?.lista),
      registradaPor: req.user?.id || null
    });

    return res.status(201).json({ voz: comoVoz(voz) });
  } catch (error) {
    console.error("VOICE_CREATE_ERROR:", error);
    return respondUploadError(res, error, "No se pudo registrar la voz");
  }
});

const ID_VOZ = /^[a-f0-9]{24}$/i;

/**
 * Una voz propia pertenece a quien la grabó; una del catálogo, a la
 * administración. Devuelve null si el usuario no puede tocarla.
 */
function puedeEditarVoz(voz, usuario) {
  if (usuario?.role === "admin") return true;
  const propia = voz.tipo !== "catalogo";
  return propia && Boolean(voz.registradaPor) && String(voz.registradaPor) === String(usuario?.id || "");
}

/**
 * PATCH /api/voices/:id — corrige los datos de una voz.
 *
 * El archivo de audio no se sustituye aquí: cambiar la grabación es registrar
 * otra voz, porque cambian la duración y el contenido. Lo que sí se corrige son
 * los datos que se equivocan al escribir: nombre, descripción, idioma, género,
 * licencia y, en las voces de catálogo, el modelo.
 */
router.patch("/:id", auth, requireUser, async (req, res) => {
  if (!ID_VOZ.test(req.params.id)) {
    return res.status(400).json({ error: "Identificador de voz no válido" });
  }
  try {
    const voz = await Voice.findById(req.params.id);
    if (!voz) return res.status(404).json({ error: "Voz no encontrada" });

    // 404 y no 403: no se confirma la existencia de una voz ajena.
    if (!puedeEditarVoz(voz, req.user)) {
      return res.status(404).json({ error: "Voz no encontrada" });
    }

    const cambios = {};

    if (req.body?.nombre !== undefined) {
      const nombre = String(req.body.nombre).trim();
      if (!nombre) return res.status(400).json({ error: "La voz necesita un nombre" });
      cambios.nombre = nombre.slice(0, 120);
    }
    if (req.body?.descripcion !== undefined) {
      cambios.descripcion = String(req.body.descripcion || "").trim().slice(0, 300);
    }
    if (req.body?.idioma !== undefined) {
      cambios.idioma = IDIOMAS.includes(String(req.body.idioma)) ? String(req.body.idioma) : voz.idioma;
    }
    if (req.body?.genero !== undefined) {
      const genero = String(req.body.genero ?? "");
      cambios.genero = GENEROS_VOZ.includes(genero) ? genero : GENERO_VOZ_POR_DEFECTO;
    }
    if (req.body?.licencia !== undefined) {
      cambios.licencia = String(req.body.licencia || "").trim().slice(0, 200);
    }
    if (req.body?.duracion !== undefined) {
      cambios.duracion = Math.max(0, Number(req.body.duracion) || 0);
    }

    // Solo la administración decide si una voz entra al catálogo o con qué
    // modelo se genera: son decisiones del estudio, no de quien grabó.
    const esAdmin = req.user?.role === "admin";
    if (esAdmin && req.body?.lista !== undefined) {
      cambios.lista = Boolean(req.body.lista);
    }
    if (esAdmin && voz.tipo === "catalogo" && req.body?.modelo !== undefined) {
      cambios.modelo = String(req.body.modelo || "").trim().slice(0, 200);
    }
    if (esAdmin && voz.tipo === "catalogo" && req.body?.vozProveedor !== undefined) {
      cambios.vozProveedor = String(req.body.vozProveedor || "").trim().slice(0, 120);
    }

    if (!Object.keys(cambios).length) {
      return res.status(400).json({ error: "No hay nada que actualizar" });
    }

    Object.assign(voz, cambios);
    await voz.save();
    return res.json({ voz: comoVoz(voz) });
  } catch (error) {
    console.error("VOICE_PATCH_ERROR:", error);
    return res.status(500).json({ error: "No se pudo actualizar la voz" });
  }
});

/**
 * DELETE /api/voices/:id — retira una voz.
 *
 * Borra la grabación solo si nada más la referencia (una publicación con esa
 * locución sigue guardando la URL). El archivo huérfano, si lo hay, se recoge
 * con `npm run db:media-orphans`.
 */
router.delete("/:id", auth, requireUser, async (req, res) => {
  if (!ID_VOZ.test(req.params.id)) {
    return res.status(400).json({ error: "Identificador de voz no válido" });
  }
  try {
    const voz = await Voice.findById(req.params.id);
    if (!voz) return res.status(404).json({ error: "Voz no encontrada" });

    if (!puedeEditarVoz(voz, req.user)) {
      return res.status(404).json({ error: "Voz no encontrada" });
    }

    const url = voz.url;
    await voz.deleteOne();

    let archivoBorrado = false;
    if (url) {
      try {
        archivoBorrado = (await purgeUnreferencedMedia([url])).length > 0;
      } catch (error) {
        console.error("VOICE_FILE_PURGE_ERROR:", error);
      }
    }

    return res.json({ eliminada: true, archivoBorrado });
  } catch (error) {
    console.error("VOICE_DELETE_ERROR:", error);
    return res.status(500).json({ error: "No se pudo retirar la voz" });
  }
});

/* POST /api/voices/locucion — convierte un texto en una toma de voz con el
   modelo configurado. Con `voiceId` usa el modelo y la voz de esa voz del
   catálogo; sin él, los ajustes del servidor. Devuelve la URL ya guardada en
   el almacén propio, lista para entrar en la receta de la publicación. */
router.post("/locucion", auth, requireUser, aiLimiterFor("voice"), cuotaIA("voice"), async (req, res) => {
  try {
    const texto = String(req.body?.texto || "").trim();
    if (!texto) {
      return res.status(400).json({ error: "El texto de la locución es obligatorio" });
    }
    if (texto.length > LIMITE_TEXTO) {
      return res.status(400).json({ error: `La locución no puede pasar de ${LIMITE_TEXTO} caracteres` });
    }

    let modelo = String(req.body?.modelo || "").trim();
    let vozProveedor = String(req.body?.voz || "").trim();
    const voiceId = String(req.body?.voiceId || "").trim();

    if (voiceId) {
      const registrada = await Voice.findById(voiceId).lean().catch(() => null);
      if (!registrada) {
        return res.status(404).json({ error: "Esa voz no está en el catálogo" });
      }
      if (registrada.tipo !== "catalogo") {
        return res.status(400).json({ error: "Una voz grabada no se genera: ya tiene su archivo" });
      }
      if (!registrada.modelo) {
        return res.status(409).json({ error: "Esta voz todavía no tiene modelo asignado" });
      }
      modelo = registrada.modelo;
      vozProveedor = registrada.vozProveedor || vozProveedor;
    }

    const toma = await generarLocucion({
      texto,
      modelo,
      voz: vozProveedor,
      ownerId: req.user?.id || null
    });

    // La unidad de la locución son los caracteres convertidos: es lo que
    // factura el proveedor de TTS y lo que distingue una toma corta de un
    // capítulo entero.
    await recordUsage({
      userId: req.user.id,
      capability: "voice",
      units: texto.length
    });

    return res.status(201).json({
      toma: {
        url: toma.url,
        mimeType: toma.mimeType,
        size: toma.size,
        modelo: toma.modelo,
        voz: toma.voz,
        tipo: "catalogo"
      }
    });
  } catch (error) {
    console.error("VOICE_TTS_ERROR:", error?.message || error);

    await recordUsage({
      userId: req.user?.id,
      capability: "voice",
      units: 0,
      estado: "error",
      error: error?.message || "VOICE_ERROR"
    });

    const aiError = getAIErrorResponse(error);
    return res.status(aiError.status).json({ error: aiError.message, code: aiError.code });
  }
});

module.exports = router;
module.exports.comoVoz = comoVoz;
module.exports.vocesUsables = vocesUsables;
module.exports.esUrlLocalDeVoz = esUrlLocalDeVoz;
module.exports.AJUSTES_VOZ = AJUSTES_VOZ;
module.exports.VARIABLE_VOZ = VARIABLE_VOZ;
module.exports.ajustesVoz = ajustesVoz;
module.exports.LIMITE_POR_DEFECTO = LIMITE_POR_DEFECTO;
module.exports.LIMITE_MAXIMO = LIMITE_MAXIMO;

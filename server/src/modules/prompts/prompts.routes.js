const express = require("express");
const mongoose = require("mongoose");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const PromptPreset = require("./PromptPreset");
const library = require("./promptLibrary");

const router = express.Router();

/**
 * Biblioteca de prompts y estilos propios.
 *
 * Dos cosas distintas bajo el mismo techo porque se usan juntas: el catálogo
 * de instrumentos (de solo lectura, igual para todos) y los presets de cada
 * persona. El catálogo se sirve desde código, sin base: no cambia con el
 * usuario y así no puede quedarse desincronizado entre instancias.
 *
 * Reglas que se ven en las rutas:
 * - Todo exige sesión y solo toca lo del usuario autenticado (nunca se acepta
 *   `user` en el cuerpo).
 * - Crear y editar comprueban el instrumento y sus campos contra el catálogo:
 *   un preset que no se puede renderizar no se guarda.
 * - El límite por persona es real (200) y se cuenta con `countDocuments`
 *   antes de crear; el índice único de nombre evita duplicados.
 */

function escaparRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Objeto público del preset: lo que consume el cliente, sin `user`. */
function serializar(preset) {
  const documento = preset?.toObject ? preset.toObject() : { ...preset };
  delete documento.user;
  delete documento.__v;

  const instrumento = documento.instrumento ? library.porCodigo(documento.instrumento) : null;
  const render = instrumento && documento.tipo === "preset"
    ? library.renderPrompt(documento.instrumento, documento.valores || {})
    : null;

  return {
    ...documento,
    instrumentoNombre: instrumento ? instrumento.nombre : "",
    // El prompt se arma al vuelo: si el catálogo mejora, el preset lo hereda.
    prompt: render && !render.error ? render.texto : "",
    renderError: render && render.error ? render.code : ""
  };
}

/** Valida lo que llega del cliente. Devuelve `{error, code}` o el preset limpio. */
function validarEntrada(cuerpo = {}) {
  const nombre = typeof cuerpo.nombre === "string" ? cuerpo.nombre.trim() : "";
  if (!nombre) return { error: "El preset necesita un nombre.", code: "NAME_REQUIRED" };
  if (nombre.length > PromptPreset.MAX_NOMBRE) {
    return { error: `El nombre no puede superar ${PromptPreset.MAX_NOMBRE} caracteres.`, code: "NAME_TOO_LONG" };
  }

  const tipo = cuerpo.tipo === undefined ? "preset" : String(cuerpo.tipo).trim();
  if (!["preset", "estilo"].includes(tipo)) {
    return { error: "El tipo debe ser preset o estilo.", code: "INVALID_TYPE" };
  }

  if (tipo === "estilo") {
    const resultado = library.estiloDesdePreset({ nombre, estiloVisual: cuerpo.estiloVisual });
    if (resultado.error) return { error: resultado.error, code: resultado.code };
    return {
      preset: {
        nombre,
        tipo,
        instrumento: "",
        valores: {},
        estiloVisual: resultado.estilo.texto
      }
    };
  }

  const instrumento = library.porCodigo(cuerpo.instrumento);
  if (!instrumento) {
    return { error: "Ese instrumento no existe.", code: "INSTRUMENT_NOT_FOUND" };
  }

  const valores = cuerpo.valores && typeof cuerpo.valores === "object" && !Array.isArray(cuerpo.valores)
    ? cuerpo.valores
    : null;
  if (!valores) return { error: "Los valores del preset deben ser un objeto.", code: "INVALID_VALUES" };

  // Solo se guardan los campos que el instrumento declara: colar claves
  // ajenas dejaría un preset que promete campos que no existen.
  const limpios = {};
  for (const campo of instrumento.campos) {
    const valor = valores[campo];
    if (typeof valor === "string" && valor.trim()) limpios[campo] = valor.trim().slice(0, 500);
  }

  const render = library.renderPrompt(instrumento.codigo, limpios);
  if (render.error) return { error: render.error, code: render.code };

  return {
    preset: {
      nombre,
      tipo,
      instrumento: instrumento.codigo,
      valores: limpios,
      estiloVisual: ""
    }
  };
}

/* ---------- Catálogo (solo lectura) ---------- */

router.get("/catalog", auth, requireUser, (req, res) => {
  const instrumentos = library.listarInstrumentos({
    grupo: typeof req.query.grupo === "string" ? req.query.grupo.trim() : "",
    q: typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : ""
  }).map((instrumento) => ({
    ...instrumento,
    campos: instrumento.campos.map((campo) => ({ clave: campo, ...library.CAMPOS[campo] }))
  }));

  return res.json({
    grupos: library.GRUPOS,
    instrumentos,
    estilos: library.ESTILOS,
    total: instrumentos.length
  });
});

/* ---------- Presets del usuario ---------- */

router.get("/presets", auth, requireUser, async (req, res) => {
  try {
    const tipo = typeof req.query.tipo === "string" ? req.query.tipo.trim() : "";
    const grupo = typeof req.query.grupo === "string" ? req.query.grupo.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";

    const filtro = { user: req.user.id };
    if (["preset", "estilo"].includes(tipo)) filtro.tipo = tipo;

    if (grupo) {
      const delGrupo = library.INSTRUMENTOS.filter((i) => i.grupo === grupo).map((i) => i.codigo);
      if (delGrupo.length === 0) {
        return res.status(400).json({ error: "Ese grupo no existe.", code: "INVALID_GROUP" });
      }
      filtro.instrumento = { $in: delGrupo };
    }

    if (q) {
      // Escape obligatorio: un paréntesis o un `+` del usuario, sin escapar,
      // rompe el regex o lo convierte en otra consulta.
      filtro.nombre = { $regex: escaparRegex(q), $options: "i" };
    }

    const presets = await PromptPreset.find(filtro)
      .sort({ favorito: -1, ultimoUso: -1, createdAt: -1 })
      .limit(PromptPreset.MAX_PRESETS)
      .lean();

    return res.json({ presets: presets.map(serializar), total: presets.length });
  } catch (error) {
    console.error("PROMPT_PRESETS_LIST_ERROR:", error.message);
    return res.status(500).json({ error: "No se pudieron cargar tus presets." });
  }
});

router.post("/presets", auth, requireUser, async (req, res) => {
  try {
    const validado = validarEntrada(req.body);
    if (validado.error) {
      return res.status(400).json({ error: validado.error, code: validado.code });
    }

    const total = await PromptPreset.countDocuments({ user: req.user.id });
    if (total >= PromptPreset.MAX_PRESETS) {
      return res.status(409).json({
        error: `Ya tienes ${PromptPreset.MAX_PRESETS} presets. Borra alguno para guardar otro.`,
        code: "PRESET_LIMIT"
      });
    }

    const preset = await PromptPreset.create({ ...validado.preset, user: req.user.id });
    return res.status(201).json({ preset: serializar(preset) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "Ya tienes un preset con ese nombre.", code: "NAME_TAKEN" });
    }
    console.error("PROMPT_PRESET_CREATE_ERROR:", error.message);
    return res.status(500).json({ error: "No se pudo guardar el preset." });
  }
});

router.patch("/presets/:id", auth, requireUser, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ error: "Ese preset no existe.", code: "PRESET_NOT_FOUND" });
  }

  try {
    const preset = await PromptPreset.findOne({ _id: req.params.id, user: req.user.id });
    if (!preset) return res.status(404).json({ error: "Ese preset no existe.", code: "PRESET_NOT_FOUND" });

    // Un parche puede cambiar el nombre, el favorito o el contenido; se aplica
    // encima de lo que ya había para no exigir el objeto completo.
    if (req.body?.favorito !== undefined && Object.keys(req.body).length === 1) {
      preset.favorito = Boolean(req.body.favorito);
      await preset.save();
      return res.json({ preset: serializar(preset) });
    }

    const validado = validarEntrada({
      ...preset.toObject(),
      ...req.body,
      tipo: req.body?.tipo ?? preset.tipo
    });
    if (validado.error) {
      return res.status(400).json({ error: validado.error, code: validado.code });
    }

    Object.assign(preset, validado.preset, {
      favorito: req.body?.favorito === undefined ? preset.favorito : Boolean(req.body.favorito)
    });
    await preset.save();
    return res.json({ preset: serializar(preset) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "Ya tienes un preset con ese nombre.", code: "NAME_TAKEN" });
    }
    console.error("PROMPT_PRESET_UPDATE_ERROR:", error.message);
    return res.status(500).json({ error: "No se pudo actualizar el preset." });
  }
});

router.delete("/presets/:id", auth, requireUser, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ error: "Ese preset no existe.", code: "PRESET_NOT_FOUND" });
  }

  try {
    const borrado = await PromptPreset.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!borrado) return res.status(404).json({ error: "Ese preset no existe.", code: "PRESET_NOT_FOUND" });
    return res.json({ success: true, id: String(borrado._id) });
  } catch (error) {
    console.error("PROMPT_PRESET_DELETE_ERROR:", error.message);
    return res.status(500).json({ error: "No se pudo borrar el preset." });
  }
});

/**
 * Aplicar un preset: devuelve el prompt armado y suma un uso.
 *
 * El contador no es decorativo: ordena la lista por lo que de verdad se usa.
 * El incremento se hace en la base (`$inc`) y no leyendo y guardando, para que
 * dos pestañas abiertas no se pisen el contador.
 */
router.post("/presets/:id/aplicar", auth, requireUser, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ error: "Ese preset no existe.", code: "PRESET_NOT_FOUND" });
  }

  try {
    const preset = await PromptPreset.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { $inc: { usos: 1 }, $set: { ultimoUso: new Date() } },
      { new: true }
    );

    if (!preset) return res.status(404).json({ error: "Ese preset no existe.", code: "PRESET_NOT_FOUND" });

    const serializado = serializar(preset);
    if (serializado.tipo === "preset" && !serializado.prompt) {
      return res.status(409).json({
        error: "Ese preset no se puede armar: cambió el catálogo desde que lo guardaste.",
        code: serializado.renderError || "PRESET_NOT_RENDERABLE"
      });
    }

    return res.json({
      preset: serializado,
      prompt: serializado.prompt,
      estilo: serializado.tipo === "estilo" ? serializado.estiloVisual : ""
    });
  } catch (error) {
    console.error("PROMPT_PRESET_APPLY_ERROR:", error.message);
    return res.status(500).json({ error: "No se pudo aplicar el preset." });
  }
});

module.exports = router;
module.exports.validarEntrada = validarEntrada;
module.exports.serializar = serializar;

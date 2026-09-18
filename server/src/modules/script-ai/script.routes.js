const express = require("express");
const Script = require("./Script");
const ScriptProject = require("./ScriptProject");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const aiLimiter = require("../../middleware/aiLimiter");
const {
  generateScript,
  normalizeScriptStructure,
  formatScriptResult
} = require("./script.service");
const {
  getAIErrorResponse
} = require("../../middleware/aiError");
const {
  getAIProviderConfig
} = require("../../config/aiProviders");

const router = express.Router();

function getProjectPayload(body) {
  const structure = normalizeScriptStructure(body?.structure);
  const validTypes = Script.schema.path("type").enumValues;
  const validGenres = Script.schema.path("genre").enumValues;
  const validFormats = Script.schema.path("format").enumValues;
  const title =
    typeof body?.title === "string" && body.title.trim()
      ? body.title.trim()
      : structure.title;

  if (title.length > 200) {
    throw new Error("PROJECT_TITLE_TOO_LONG");
  }

  if (
    typeof body?.type !== "string" ||
    !validTypes.includes(body.type) ||
    typeof body?.genre !== "string" ||
    !validGenres.includes(body.genre) ||
    typeof body?.format !== "string" ||
    !validFormats.includes(body.format) ||
    !Number.isInteger(body?.durationMinutes) ||
    body.durationMinutes < 1 ||
    body.durationMinutes > 180 ||
    typeof body?.tone !== "string" ||
    body.tone.length > 100 ||
    typeof body?.audience !== "string" ||
    body.audience.length > 200
  ) {
    throw new Error("PROJECT_METADATA_INVALID");
  }

  return {
    title,
    type: body.type,
    genre: body.genre,
    format: body.format,
    durationMinutes: body.durationMinutes,
    tone: body.tone.trim(),
    audience: body.audience.trim(),
    structure,
    result: formatScriptResult(structure)
  };
}

router.post("/generate", auth, requireUser, aiLimiter, async (req, res) => {
  let script;

  try {
    const {
      prompt,
      type = "custom",
      genre = "general",
      format = "standard",
      durationMinutes = 5,
      tone = "",
      audience = ""
    } = req.body;

    if (
      typeof prompt !== "string" ||
      !prompt.trim()
    ) {
      return res.status(400).json({
        error: "El prompt es obligatorio"
      });
    }

    if (prompt.trim().length > 10000) {
      return res.status(400).json({
        error: "El prompt no puede superar 10000 caracteres"
      });
    }

    const validTypes =
      Script.schema.path("type").enumValues;

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: "Tipo de script no válido"
      });
    }

    const validGenres =
      Script.schema.path("genre").enumValues;
    const validFormats =
      Script.schema.path("format").enumValues;

    if (!validGenres.includes(genre)) {
      return res.status(400).json({
        error: "Género no válido"
      });
    }

    if (!validFormats.includes(format)) {
      return res.status(400).json({
        error: "Formato no válido"
      });
    }

    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 180
    ) {
      return res.status(400).json({
        error: "La duración debe estar entre 1 y 180 minutos"
      });
    }

    if (
      typeof tone !== "string" ||
      tone.length > 100 ||
      typeof audience !== "string" ||
      audience.length > 200
    ) {
      return res.status(400).json({
        error: "Los parámetros profesionales no tienen un formato válido"
      });
    }

    const provider =
      getAIProviderConfig("script");

    script = await Script.create({
      user: req.user.id,
      prompt: prompt.trim(),
      type,
      genre,
      format,
      durationMinutes,
      tone: tone.trim(),
      audience: audience.trim(),
      provider: provider.provider,
      model: provider.model,
      status: "processing"
    });

    const result = await generateScript({
      prompt: prompt.trim(),
      type,
      genre,
      format,
      durationMinutes,
      tone: tone.trim(),
      audience: audience.trim()
    });

    script.result = result.result;
    script.structure = result.structure;
    script.status = "completed";
    script.error = "";
    await script.save();

    res.status(201).json({
      script
    });
  } catch (error) {
    console.error("SCRIPT_GENERATION_ERROR:", error);

    const aiError = getAIErrorResponse(error);

    if (script) {
      script.status = "failed";
      script.error = aiError.code;
      await script.save().catch((saveError) => {
        console.error("SCRIPT_GENERATION_SAVE_ERROR:", saveError);
      });
    }

    res.status(aiError.status).json({
      error: aiError.message,
      code: aiError.code
    });
  }
});

router.post("/projects", auth, requireUser, async (req, res) => {
  try {
    const payload = getProjectPayload(req.body);
    let sourceScript = null;

    if (req.body.sourceScript) {
      sourceScript = await Script.findOne({
        _id: req.body.sourceScript,
        user: req.user.id
      });

      if (!sourceScript) {
        return res.status(404).json({
          error: "Script de origen no encontrado"
        });
      }
    }

    const project = await ScriptProject.create({
      user: req.user.id,
      sourceScript: sourceScript?._id || null,
      ...payload
    });

    return res.status(201).json({
      project
    });
  } catch (error) {
    if (
      error?.message === "SCRIPT_INVALID_RESPONSE" ||
      error?.message === "PROJECT_TITLE_TOO_LONG" ||
      error?.message === "PROJECT_METADATA_INVALID"
    ) {
      return res.status(400).json({
        error: "Los datos del proyecto no son válidos"
      });
    }

    console.error("SCRIPT_PROJECT_CREATE_ERROR:", error);
    return res.status(500).json({
      error: "No se pudo guardar el proyecto"
    });
  }
});

router.get("/projects", auth, requireUser, async (req, res) => {
  try {
    const projects = await ScriptProject.find({
      user: req.user.id
    })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    return res.json({
      projects
    });
  } catch (error) {
    console.error("SCRIPT_PROJECT_HISTORY_ERROR:", error);
    return res.status(500).json({
      error: "No se pudo cargar el historial de proyectos"
    });
  }
});

router.delete("/projects/:id", auth, requireUser, async (req, res) => {
  try {
    const project = await ScriptProject.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id
    });

    if (!project) {
      return res.status(404).json({ error: "Proyecto no encontrado" });
    }

    return res.json({ deleted: true, projectId: req.params.id });
  } catch (error) {
    console.error("SCRIPT_PROJECT_DELETE_ERROR:", error);
    return res.status(500).json({ error: "No se pudo eliminar el proyecto" });
  }
});

router.get("/projects/:id/export", auth, requireUser, async (req, res) => {
  try {
    const format = req.query.format || "txt";

    if (!["txt", "json"].includes(format)) {
      return res.status(400).json({
        error: "Formato de exportación no soportado"
      });
    }

    const project = await ScriptProject.findOne({
      _id: req.params.id,
      user: req.user.id
    }).lean();

    if (!project) {
      return res.status(404).json({
        error: "Proyecto no encontrado"
      });
    }

    const safeTitle = project.title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "proyecto-guion";

    if (format === "json") {
      res.type("application/json");
      res.set(
        "Content-Disposition",
        `attachment; filename="${safeTitle}.json"`
      );
      return res.send(JSON.stringify({
        title: project.title,
        type: project.type,
        genre: project.genre,
        format: project.format,
        durationMinutes: project.durationMinutes,
        tone: project.tone,
        audience: project.audience,
        structure: project.structure,
        result: project.result
      }, null, 2));
    }

    res.type("text/plain");
    res.set(
      "Content-Disposition",
      `attachment; filename="${safeTitle}.txt"`
    );
    return res.send(project.result);
  } catch (error) {
    console.error("SCRIPT_PROJECT_EXPORT_ERROR:", error);
    return res.status(500).json({
      error: "No se pudo exportar el proyecto"
    });
  }
});

router.get("/projects/:id", auth, requireUser, async (req, res) => {
  try {
    const project = await ScriptProject.findOne({
      _id: req.params.id,
      user: req.user.id
    }).lean();

    if (!project) {
      return res.status(404).json({
        error: "Proyecto no encontrado"
      });
    }

    return res.json({
      project
    });
  } catch (error) {
    console.error("SCRIPT_PROJECT_GET_ERROR:", error);
    return res.status(500).json({
      error: "No se pudo cargar el proyecto"
    });
  }
});

router.get("/history", auth, requireUser, async (req, res) => {
  try {
    const scripts = await Script.find({
      user: req.user.id
    })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json({
      scripts
    });
  } catch (error) {
    console.error("SCRIPT_HISTORY_ERROR:", error);
    return res.status(500).json({
      error: "No se pudo cargar el historial de guiones"
    });
  }
});

router.put("/projects/:id", auth, requireUser, async (req, res) => {
  try {
    const project = await ScriptProject.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!project) {
      return res.status(404).json({
        error: "Proyecto no encontrado"
      });
    }

    const payload = getProjectPayload(req.body);
    Object.assign(project, payload);
    await project.save();

    return res.json({
      project
    });
  } catch (error) {
    if (
      error?.message === "SCRIPT_INVALID_RESPONSE" ||
      error?.message === "PROJECT_TITLE_TOO_LONG" ||
      error?.message === "PROJECT_METADATA_INVALID"
    ) {
      return res.status(400).json({
        error: "Los datos del proyecto no son válidos"
      });
    }

    console.error("SCRIPT_PROJECT_UPDATE_ERROR:", error);
    return res.status(500).json({
      error: "No se pudo actualizar el proyecto"
    });
  }
});

router.put("/:id", auth, requireUser, async (req, res) => {
  try {
    const script = await Script.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!script) {
      return res.status(404).json({
        error: "Script no encontrado"
      });
    }

    const structure = normalizeScriptStructure(
      req.body?.structure
    );

    script.structure = structure;
    script.result = formatScriptResult(structure);
    script.error = "";
    await script.save();

    return res.json({
      script
    });
  } catch (error) {
    if (error?.message === "SCRIPT_INVALID_RESPONSE") {
      return res.status(400).json({
        error: "La estructura del script no es válida",
        code: error.message
      });
    }

    console.error("SCRIPT_UPDATE_ERROR:", error);

    return res.status(500).json({
      error: "No se pudo actualizar el script"
    });
  }
});

router.get("/:id", auth, requireUser, async (req, res) => {
  const script = await Script.findOne({
    _id: req.params.id,
    user: req.user.id
  });

  if (!script) {
    return res.status(404).json({
      error: "Script no encontrado"
    });
  }

  res.json({
    script
  });
});

router.delete("/:id", auth, requireUser, async (req, res) => {
  const script = await Script.findOneAndDelete({
    _id: req.params.id,
    user: req.user.id
  });

  if (!script) {
    return res.status(404).json({
      error: "Script no encontrado"
    });
  }

  res.json({
    deleted: true
  });
});

module.exports = router;

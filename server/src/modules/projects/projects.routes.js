const express = require("express");

const Project = require("./Project");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { validId } = require("../../utils/queryHelpers");

const router = express.Router();

const {
  FORMATOS,
  MAX_TITLE,
  MAX_BRIEF,
  MAX_SCENES,
  MAX_SCENE_TITLE,
  MAX_SCRIPT,
  MAX_VERSIONS
} = Project;

function clamp(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Las escenas siempre llegan completas: se normaliza cada una. */
function parseScenes(raw) {
  if (!Array.isArray(raw)) return { scenes: [] };
  if (raw.length > MAX_SCENES) {
    return { error: `Un proyecto admite hasta ${MAX_SCENES} escenas` };
  }

  const scenes = raw.map((scene, index) => ({
    order: Number.isFinite(Number(scene?.order)) ? Number(scene.order) : index,
    title: clamp(scene?.title, MAX_SCENE_TITLE),
    script: clamp(scene?.script, MAX_SCRIPT),
    mediaUrl: typeof scene?.mediaUrl === "string" ? scene.mediaUrl.trim() : "",
    mediaType: ["image", "video", "audio"].includes(scene?.mediaType) ? scene.mediaType : ""
  }));

  return { scenes };
}

function parseFormat(value, fallback = "libre") {
  return FORMATOS.includes(value) ? value : fallback;
}

function presentScene(scene) {
  return {
    _id: scene._id,
    order: scene.order ?? 0,
    title: scene.title || "",
    script: scene.script || "",
    mediaUrl: scene.mediaUrl || "",
    mediaType: scene.mediaType || ""
  };
}

function presentVersion(version, { withSnapshot = false } = {}) {
  const base = {
    _id: version._id,
    label: version.label || "",
    createdAt: version.createdAt,
    scenesCount: version.snapshot?.scenes?.length || 0
  };
  if (!withSnapshot) return base;
  return {
    ...base,
    snapshot: {
      label: version.snapshot?.label || "",
      title: version.snapshot?.title || "",
      brief: version.snapshot?.brief || "",
      format: version.snapshot?.format || "libre",
      musicTitle: version.snapshot?.musicTitle || "",
      musicUrl: version.snapshot?.musicUrl || "",
      scenes: (version.snapshot?.scenes || []).map(presentScene)
    }
  };
}

function present(project, { withVersions = "summary" } = {}) {
  return {
    _id: project._id,
    title: project.title,
    brief: project.brief || "",
    format: project.format || "libre",
    scenes: (project.scenes || []).map(presentScene),
    musicTitle: project.musicTitle || "",
    musicUrl: project.musicUrl || "",
    archived: Boolean(project.archived),
    versions:
      withVersions === "full"
        ? (project.versions || []).map((version) => presentVersion(version, { withSnapshot: true }))
        : (project.versions || []).map((version) => presentVersion(version)),
    versionsCount: (project.versions || []).length,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

/** 404 uniforme: nunca se distingue «no existe» de «no es tuyo». */
function findOwned(projectId, ownerId, projection) {
  return Project.findOne({ _id: projectId, owner: ownerId }, projection);
}

// ---------------------------------------------------------------
// Lista
// ---------------------------------------------------------------
router.get("/", auth, requireUser, async (req, res) => {
  try {
    const archived = req.query.archived === "true";
    const projects = await Project.find({ owner: req.user.id, archived }, "-versions.snapshot")
      .sort({ updatedAt: -1 })
      .limit(80)
      .lean();

    return res.json({ projects: projects.map((project) => present(project)) });
  } catch (error) {
    console.error("LIST_PROJECTS_ERROR:", error);
    return res.status(500).json({ error: "No se pudieron cargar los proyectos" });
  }
});

// ---------------------------------------------------------------
// Crear
// ---------------------------------------------------------------
router.post("/", auth, requireUser, async (req, res) => {
  try {
    const title = clamp(req.body?.title, MAX_TITLE);
    if (!title) {
      return res.status(400).json({ error: "El proyecto necesita un nombre" });
    }

    const brief = clamp(req.body?.brief, MAX_BRIEF);
    const format = parseFormat(req.body?.format);
    const { scenes, error } = parseScenes(req.body?.scenes);
    if (error) return res.status(400).json({ error });

    const project = await Project.create({
      owner: req.user.id,
      title,
      brief,
      format,
      scenes,
      musicTitle: clamp(req.body?.musicTitle, 160),
      musicUrl: typeof req.body?.musicUrl === "string" ? req.body.musicUrl.trim() : ""
    });

    return res.status(201).json({ project: present(project) });
  } catch (error) {
    console.error("CREATE_PROJECT_ERROR:", error);
    return res.status(500).json({ error: "No se pudo crear el proyecto" });
  }
});

// ---------------------------------------------------------------
// Detalle (incluye versiones con su contenido, sin las escenas actuales
// duplicadas: el snapshot ya las trae)
// ---------------------------------------------------------------
router.get("/:projectId", auth, requireUser, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!validId(projectId)) return res.status(400).json({ error: "ID inválido" });

    const project = await findOwned(projectId, req.user.id).lean();
    if (!project) return res.status(404).json({ error: "Proyecto no encontrado" });

    return res.json({ project: present(project, { withVersions: "full" }) });
  } catch (error) {
    console.error("GET_PROJECT_ERROR:", error);
    return res.status(500).json({ error: "No se pudo cargar el proyecto" });
  }
});

// ---------------------------------------------------------------
// Editar
// ---------------------------------------------------------------
router.patch("/:projectId", auth, requireUser, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!validId(projectId)) return res.status(400).json({ error: "ID inválido" });

    const project = await findOwned(projectId, req.user.id);
    if (!project) return res.status(404).json({ error: "Proyecto no encontrado" });

    if (req.body?.title !== undefined) {
      const title = clamp(req.body.title, MAX_TITLE);
      if (!title) return res.status(400).json({ error: "El proyecto necesita un nombre" });
      project.title = title;
    }
    if (req.body?.brief !== undefined) project.brief = clamp(req.body.brief, MAX_BRIEF);
    if (req.body?.format !== undefined) project.format = parseFormat(req.body.format, project.format);
    if (req.body?.musicTitle !== undefined) project.musicTitle = clamp(req.body.musicTitle, 160);
    if (req.body?.musicUrl !== undefined) {
      project.musicUrl = typeof req.body.musicUrl === "string" ? req.body.musicUrl.trim() : "";
    }
    if (req.body?.archived !== undefined) project.archived = Boolean(req.body.archived);

    if (req.body?.scenes !== undefined) {
      const { scenes, error } = parseScenes(req.body.scenes);
      if (error) return res.status(400).json({ error });
      project.scenes = scenes;
    }

    await project.save();
    return res.json({ project: present(project) });
  } catch (error) {
    console.error("UPDATE_PROJECT_ERROR:", error);
    return res.status(500).json({ error: "No se pudo guardar el proyecto" });
  }
});

router.delete("/:projectId", auth, requireUser, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!validId(projectId)) return res.status(400).json({ error: "ID inválido" });

    const deleted = await Project.findOneAndDelete({ _id: projectId, owner: req.user.id }).lean();
    if (!deleted) return res.status(404).json({ error: "Proyecto no encontrado" });

    return res.json({ deleted: true });
  } catch (error) {
    console.error("DELETE_PROJECT_ERROR:", error);
    return res.status(500).json({ error: "No se pudo eliminar el proyecto" });
  }
});

// ---------------------------------------------------------------
// Versiones: congelar una copia y comparar
// ---------------------------------------------------------------
router.post("/:projectId/versions", auth, requireUser, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!validId(projectId)) return res.status(400).json({ error: "ID inválido" });

    const project = await findOwned(projectId, req.user.id);
    if (!project) return res.status(404).json({ error: "Proyecto no encontrado" });
    if (project.versions.length >= MAX_VERSIONS) {
      return res.status(400).json({ error: `Un proyecto guarda hasta ${MAX_VERSIONS} versiones` });
    }

    const label = clamp(req.body?.label, 80) || `Versión ${project.versions.length + 1}`;
    project.versions.push({
      label,
      snapshot: {
        label,
        title: project.title,
        brief: project.brief,
        format: project.format,
        musicTitle: project.musicTitle,
        musicUrl: project.musicUrl,
        scenes: project.scenes.map((scene) => scene.toObject())
      }
    });
    await project.save();

    const version = project.versions[project.versions.length - 1];
    return res.status(201).json({
      version: presentVersion(version, { withSnapshot: true }),
      versionsCount: project.versions.length
    });
  } catch (error) {
    console.error("CREATE_PROJECT_VERSION_ERROR:", error);
    return res.status(500).json({ error: "No se pudo guardar la versión" });
  }
});

router.delete("/:projectId/versions/:versionId", auth, requireUser, async (req, res) => {
  try {
    const { projectId, versionId } = req.params;
    if (!validId(projectId) || !validId(versionId)) return res.status(400).json({ error: "ID inválido" });

    const project = await findOwned(projectId, req.user.id);
    if (!project) return res.status(404).json({ error: "Proyecto no encontrado" });

    const before = project.versions.length;
    project.versions = project.versions.filter((version) => String(version._id) !== String(versionId));
    if (project.versions.length === before) {
      return res.status(404).json({ error: "Versión no encontrada" });
    }

    await project.save();
    return res.json({ deleted: true, versionsCount: project.versions.length });
  } catch (error) {
    console.error("DELETE_PROJECT_VERSION_ERROR:", error);
    return res.status(500).json({ error: "No se pudo eliminar la versión" });
  }
});

module.exports = router;

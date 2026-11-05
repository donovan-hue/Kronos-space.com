const path = require("node:path");
const { ROOT, requireServerModule, loadEnvironment } = require("./_bootstrap");

const mongoose = requireServerModule("mongoose");
const servidor = path.join(ROOT, "server", "src");
const Story = require(path.join(servidor, "modules", "stories", "Story"));
const User = require(path.join(servidor, "modules", "users", "User"));
const { mediaUrlsOf, purgeUnreferencedMedia } = require(path.join(servidor, "config", "mediaLifecycle"));

/**
 * Barrido de retención del archivo de historias.
 *
 * El archivo personal NO se borra con un índice TTL: un TTL destruye
 * documentos sin avisar y sin forma de recuperarlos, y el archivo es una
 * función del producto, no basura. Esta tarea hace el borrado en dos pasos,
 * y solo hacia adelante:
 *
 *   1. `--marcar`: pone `retentionFlaggedAt` en las historias que ya pasaron
 *      la retención. Desde ese momento el autor ve «se borra en N días».
 *   2. `--borrar`: borra las historias **marcadas** cuya fecha ya venció
 *      (retención + margen), y purga su media si nadie más la usa.
 *
 * Nunca borra una historia que no haya sido marcada antes, ni la de un
 * destacado: lo destacado es permanente por decisión del autor. Si un
 * destacado apunta a una historia, la historia se conserva (el destacado
 * necesita su media para verse).
 *
 * Uso:
 *   node scripts/db/stories-retention.js --dry-run
 *   node scripts/db/stories-retention.js --marcar
 *   node scripts/db/stories-retention.js --borrar
 *
 * Sin `MONGODB_URI` termina con código 1 sin tocar nada.
 */

const DIA_MS = 24 * 60 * 60 * 1000;
const RETENCION_DIAS = Story.ARCHIVE_RETENTION_DAYS;
const MARGEN_DIAS = Story.ARCHIVE_WARNING_DAYS;

function fechaCorte(dias) {
  return new Date(Date.now() - dias * DIA_MS);
}

async function historiasDestacadas() {
  const usuarios = await User.find({ "storyHighlights.0": { $exists: true } })
    .select("storyHighlights.storyIds")
    .lean();
  const ids = new Set();
  for (const usuario of usuarios) {
    for (const destacado of usuario.storyHighlights || []) {
      for (const id of destacado.storyIds || []) ids.add(String(id));
    }
  }
  return ids;
}

async function marcar({ dryRun = false } = {}) {
  const destacadas = await historiasDestacadas();
  const filtro = {
    createdAt: { $lte: fechaCorte(RETENCION_DIAS) },
    retentionFlaggedAt: null
  };
  if (destacadas.size) filtro._id = { $nin: [...destacadas].map((id) => new mongoose.Types.ObjectId(id)) };

  const candidatas = await Story.find(filtro).select("_id").lean();
  if (!dryRun && candidatas.length) {
    await Story.updateMany(
      { _id: { $in: candidatas.map((s) => s._id) } },
      { $set: { retentionFlaggedAt: new Date() } }
    );
  }
  return { marcadas: candidatas.length, protegidas: destacadas.size };
}

async function borrar({ dryRun = false } = {}) {
  const destacadas = await historiasDestacadas();
  const filtro = {
    retentionFlaggedAt: { $ne: null },
    createdAt: { $lte: fechaCorte(RETENCION_DIAS + MARGEN_DIAS) }
  };
  if (destacadas.size) filtro._id = { $nin: [...destacadas].map((id) => new mongoose.Types.ObjectId(id)) };

  const condenadas = await Story.find(filtro).lean();
  if (!dryRun) {
    for (const historia of condenadas) {
      await Story.deleteOne({ _id: historia._id });
      try {
        await purgeUnreferencedMedia(mediaUrlsOf(historia));
      } catch (error) {
        // La media huérfana la recoge `db:media-orphans`; no se detiene el
        // barrido por un archivo que no se pudo borrar.
        console.error("STORY_RETENTION_PURGE_ERROR", { id: String(historia._id), code: error?.code || "" });
      }
    }
  }
  return { borradas: condenadas.length };
}

async function main() {
  if (typeof loadEnvironment === "function") loadEnvironment();
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const modo = args.has("--borrar") ? "borrar" : args.has("--marcar") ? "marcar" : "";

  if (!modo) {
    console.error("Indica --marcar o --borrar (opcional --dry-run).");
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error("Falta MONGODB_URI: no se toca ninguna base.");
    process.exit(1);
  }

  // `autoIndex:false`: esta herramienta no debe crear índices mientras mide
  // ni mientras borra. Los índices los aplica `db:migrate`/`db:index-audit`.
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  try {
    const resultado = modo === "marcar" ? await marcar({ dryRun }) : await borrar({ dryRun });
    console.log(JSON.stringify({ modo, dryRun, retencionDias: RETENCION_DIAS, margenDias: MARGEN_DIAS, ...resultado }));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("STORIES_RETENTION_ERROR", error?.message || error);
    process.exit(1);
  });
}

module.exports = { marcar, borrar, historiasDestacadas };

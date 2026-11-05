#!/usr/bin/env node
const path = require("node:path");
const { ROOT, requireServerModule, loadEnvironment } = require("./_bootstrap");

const mongoose = requireServerModule("mongoose");
const servidor = path.join(ROOT, "server", "src");
const LiveRoom = require(path.join(servidor, "modules", "live", "LiveRoom"));

/**
 * Cierra las salas de directo abandonadas (bloque 1.5).
 *
 * Antes, cerrar la pestaña dejaba la sala «activa» para siempre: el anfitrión
 * no podía abrir otra y la lista pública mostraba un directo que ya no
 * existía. El cliente manda un latido cada 30 s; esto cierra las que llevan
 * más de LIVE_STALE_MS sin latido.
 *
 * No borra nada: marca `status: "ended"` y `endedAt`, que es reversible y deja
 * rastro. La media del directo no vive aquí (WebRTC de navegador a navegador).
 *
 *   node scripts/db/live-sweep.js --dry-run
 *   node scripts/db/live-sweep.js
 */

async function salasAbandonadas({ dryRun = false, ahora = Date.now() } = {}) {
  const corte = new Date(ahora - LiveRoom.LIVE_STALE_MS);
  const filtro = {
    status: "active",
    $or: [
      { hostHeartbeatAt: { $lte: corte } },
      // Salas anteriores al latido: se usa `startedAt` como último aliento.
      { hostHeartbeatAt: null, startedAt: { $lte: corte } }
    ]
  };

  const salas = await LiveRoom.find(filtro).select("_id host title").lean();
  if (!dryRun && salas.length) {
    await LiveRoom.updateMany(
      { _id: { $in: salas.map((sala) => sala._id) } },
      { $set: { status: "ended", endedAt: new Date() } }
    );
  }

  return {
    cerradas: salas.length,
    detalle: salas.map((sala) => ({ id: String(sala._id), title: sala.title || "" }))
  };
}

async function main() {
  if (typeof loadEnvironment === "function") loadEnvironment();
  const dryRun = process.argv.includes("--dry-run");

  if (!process.env.MONGODB_URI) {
    console.error("Falta MONGODB_URI: no se toca ninguna base.");
    process.exit(3);
  }

  // `autoIndex:false`: esta herramienta no crea índices mientras mide.
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  try {
    const resultado = await salasAbandonadas({ dryRun });
    console.log(JSON.stringify({ dryRun, limiteMs: LiveRoom.LIVE_STALE_MS, ...resultado }));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("LIVE_SWEEP_ERROR", error?.message || error);
    process.exit(1);
  });
}

module.exports = { salasAbandonadas };

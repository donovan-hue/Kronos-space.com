const mongoose = require("mongoose");

/**
 * Connects to the configured MongoDB instance.
 *
 * Deliberately does not fall back to MongoMemoryServer: an in-memory database
 * can hide production/configuration errors and loses all data on restart.
 */

/**
 * FASE 6 — creación de índices.
 *
 * `autoIndex` de Mongoose crea índices al arrancar cada proceso. En
 * producción eso significa construir índices sobre colecciones grandes en
 * medio del tráfico y sin control de versiones, así que la propiedad de los
 * índices pasa a la migración 004 (`node scripts/db/migrate.js up`).
 *
 * Fuera de producción sigue activo: desarrollo y las pruebas E2E crean sus
 * bases temporales al vuelo y necesitan los índices únicos desde el primer
 * documento. `MONGODB_AUTO_INDEX` fuerza cualquiera de los dos modos.
 */
/**
 * `NODE_ENV !== "production"` comparaba la cadena exacta, así que
 * `Production`, `PRODUCTION`, `prod` o `" production "` —todas escrituras
 * habituales en un panel de despliegue— caían del lado permisivo y el
 * servidor habría construido los 61 índices contra la base de producción en
 * pleno tráfico. El fallo se abría hacia el lado peligroso justo en el
 * entorno que esta comprobación debe proteger.
 *
 * Ahora se normaliza y basta con que el valor empiece por `prod`. El cambio
 * solo AMPLÍA la protección: `development`, `test` y la ausencia de valor se
 * comportan igual que antes, así que ni el desarrollo ni las pruebas E2E
 * —que necesitan índices en sus bases temporales— cambian de comportamiento.
 */
function isProductionEnv() {
  return (process.env.NODE_ENV || "").trim().toLowerCase().startsWith("prod");
}

function resolveAutoIndex() {
  const raw = process.env.MONGODB_AUTO_INDEX?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return !isProductionEnv();
}

async function connectDB() {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    throw new Error("MONGODB_URI no configurado. Define una URI de MongoDB real.");
  }

  const autoIndex = resolveAutoIndex();

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000),
    autoIndex
  });

  console.log(`MongoDB conectado (${mongoose.connection.name}) autoIndex=${autoIndex}`);
  return mongoose.connection;
}

module.exports = connectDB;
module.exports.resolveAutoIndex = resolveAutoIndex;
module.exports.isProductionEnv = isProductionEnv;

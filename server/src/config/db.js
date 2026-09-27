const mongoose = require("mongoose");
const { normalizeEnvironment, isProductionProcessEnv } = require("./environment");

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
 * producción eso significa construir 61 índices sobre colecciones grandes en
 * medio del tráfico y sin control de versiones, así que la propiedad de los
 * índices pasa a la migración 004 (`node scripts/db/migrate.js up`).
 *
 * La decisión se toma AL REVÉS de como se tomaba, y esa inversión es el
 * punto entero de RISK-01. Antes se preguntaba «¿es esto producción?» y, si
 * no se podía demostrar, se construían los índices; bastaba con que
 * `NODE_ENV` llegara vacío, sin definir o escrito de otra forma (`live`,
 * `staging`, `Production`) para que el servidor indexara la base real al
 * arrancar. Un entorno desconocido es justo aquel del que no se sabe nada:
 * tratarlo como seguro invierte la carga de la prueba en el peor sitio
 * posible.
 *
 * Ahora se pregunta «¿es este uno de los entornos donde consta que no hay
 * datos reales?». Solo `development` y `test` —los dos que el proyecto
 * documenta y usa— construyen índices al arrancar, porque sus bases son
 * temporales y necesitan los índices únicos desde el primer documento.
 * Cualquier otro valor, incluida su ausencia, se trata como producción y no
 * toca los índices. Equivocarse ahora cuesta una consulta lenta en
 * desarrollo; antes costaba una construcción de índices en producción.
 *
 * `MONGODB_AUTO_INDEX` sigue mandando sobre todo, en los dos sentidos, para
 * el caso legítimo de querer el comportamiento contrario.
 */
function entornoNormalizado() {
  return normalizeEnvironment(process.env.NODE_ENV);
}

/**
 * Fail-closed: todo lo que no conste como entorno sin datos reales se trata
 * como producción, incluido `NODE_ENV` vacío o no definido. La definición
 * vive en `config/environment.js` porque las otras guardas de producción
 * —el ejecutor de migraciones, el arranque del servidor y la copia durable
 * de subidas— tienen que responder exactamente lo mismo.
 */
function isProductionEnv() {
  return isProductionProcessEnv();
}

function resolveAutoIndex() {
  const raw = process.env.MONGODB_AUTO_INDEX?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return !isProductionProcessEnv();
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

  // El entorno normalizado va en el log a propósito: es la comprobación
  // previa que hace un operador antes de una migración. `autoIndex=false`
  // significa que los índices son de la migración 004 y de nadie más.
  console.log(
    `MongoDB conectado (${mongoose.connection.name}) ` +
      `entorno=${entornoNormalizado() || "(sin definir)"} autoIndex=${autoIndex}`
  );
  return mongoose.connection;
}

module.exports = connectDB;
module.exports.resolveAutoIndex = resolveAutoIndex;
module.exports.isProductionEnv = isProductionEnv;

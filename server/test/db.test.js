const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");

test("connectDB exige una URI de MongoDB persistente", async () => {
  const previousUri = process.env.MONGODB_URI;
  delete process.env.MONGODB_URI;

  try {
    await assert.rejects(connectDB, /MONGODB_URI no configurado/);
  } finally {
    if (previousUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousUri;
  }
});

/**
 * Quién crea los índices, y dónde.
 *
 * Desde la fase 6 los índices son propiedad de la migración 004: crearlos al
 * arrancar significa construir 61 índices sobre colecciones grandes en mitad
 * del tráfico y sin control de versiones. La comprobación que lo impedía
 * comparaba `NODE_ENV !== "production"` contra la cadena exacta, así que
 * `Production`, `PRODUCTION`, `prod` o un valor con espacios —las formas en
 * que de verdad se escribe esto en un panel de despliegue— devolvían
 * `autoIndex = true` y el servidor habría indexado la base de producción al
 * arrancar. El fallo se abría hacia el lado peligroso precisamente en el
 * único entorno que esta función debe proteger.
 *
 * Estos casos fijan el contrato en ambas direcciones: producción nunca
 * indexa por su cuenta, y desarrollo y pruebas siguen haciéndolo porque sus
 * bases temporales necesitan los índices únicos desde el primer documento.
 */
const { resolveAutoIndex } = require("../src/config/db");

function conEntorno(nodeEnv, autoIndexEnv, fn) {
  const previoNode = process.env.NODE_ENV;
  const previoAuto = process.env.MONGODB_AUTO_INDEX;
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  if (autoIndexEnv === undefined) delete process.env.MONGODB_AUTO_INDEX;
  else process.env.MONGODB_AUTO_INDEX = autoIndexEnv;
  try {
    return fn();
  } finally {
    if (previoNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previoNode;
    if (previoAuto === undefined) delete process.env.MONGODB_AUTO_INDEX;
    else process.env.MONGODB_AUTO_INDEX = previoAuto;
  }
}

test("producción nunca construye índices al arrancar, se escriba como se escriba", () => {
  for (const valor of ["production", "Production", "PRODUCTION", "prod", " production ", "prod-eu"]) {
    assert.equal(
      conEntorno(valor, undefined, resolveAutoIndex),
      false,
      `NODE_ENV=${JSON.stringify(valor)} debe desactivar autoIndex: los índices los crea la migración 004`
    );
  }
});

test("desarrollo y pruebas siguen creando sus índices", () => {
  for (const valor of ["development", "test", undefined, ""]) {
    assert.equal(
      conEntorno(valor, undefined, resolveAutoIndex),
      true,
      `NODE_ENV=${JSON.stringify(valor)} necesita autoIndex: las bases temporales se crean al vuelo`
    );
  }
});

test("MONGODB_AUTO_INDEX manda sobre el entorno en ambos sentidos", () => {
  assert.equal(conEntorno("production", "true", resolveAutoIndex), true, "una migración manual puede pedirlo explícitamente");
  assert.equal(conEntorno("production", "1", resolveAutoIndex), true);
  assert.equal(conEntorno("development", "false", resolveAutoIndex), false, "se puede reproducir el modo producción en local");
  assert.equal(conEntorno("development", "0", resolveAutoIndex), false);
});

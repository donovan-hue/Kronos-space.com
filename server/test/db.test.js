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
 * RISK-01 — quién crea los índices, y dónde.
 *
 * Desde la fase 6 los índices son propiedad de la migración 004: crearlos al
 * arrancar significa construir 61 índices sobre colecciones grandes en mitad
 * del tráfico y sin control de versiones.
 *
 * La comprobación que lo impedía preguntaba «¿es esto producción?» y, si no
 * podía demostrarlo, indexaba. Falló dos veces seguidas por el mismo motivo:
 * primero comparando la cadena exacta `"production"` (con lo que `Production`
 * o `prod` pasaban de largo) y después, ya normalizada, dejando fuera a
 * `NODE_ENV` vacío, sin definir, `live` o `staging`. Las dos veces el error
 * cayó del lado peligroso, porque la pregunta estaba planteada al revés.
 *
 * Ahora se pregunta lo contrario: solo `development` y `test` —los dos
 * entornos donde consta que las bases son temporales— construyen índices al
 * arrancar. Todo lo demás, incluida la ausencia de valor, cuenta como
 * producción. Estos casos fijan el contrato en ambas direcciones para que la
 * pregunta no se pueda volver a invertir sin que algo se ponga rojo.
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
  const formas = [
    "production",
    "Production",
    "PRODUCTION",
    "prod",
    "Prod",
    "PROD",
    " production ",
    "\tproduction\n",
    "prod-eu",
    "production-us-east"
  ];
  for (const valor of formas) {
    assert.equal(
      conEntorno(valor, undefined, resolveAutoIndex),
      false,
      `NODE_ENV=${JSON.stringify(valor)} debe desactivar autoIndex: los índices los crea la migración 004`
    );
  }
});

test("un entorno que no consta se trata como producción", () => {
  // El caso que de verdad ocurre en un despliegue: nadie fijó NODE_ENV, o lo
  // escribió con un nombre propio. No poder demostrar que es seguro no es
  // motivo para indexar la base real.
  const desconocidos = [undefined, "", "   ", "live", "staging", "produccion", "prd", "main", "release"];
  for (const valor of desconocidos) {
    assert.equal(
      conEntorno(valor, undefined, resolveAutoIndex),
      false,
      `NODE_ENV=${JSON.stringify(valor)} no consta como entorno sin datos reales: debe fallar cerrado`
    );
  }
});

test("desarrollo y pruebas conservan sus índices automáticos", () => {
  // Sus bases son temporales y necesitan los índices únicos desde el primer
  // documento; quitárselos rompería las suites que crean datos al vuelo.
  const seguros = ["development", "Development", "DEVELOPMENT", " development ", "test", "Test", "TEST", " test "];
  for (const valor of seguros) {
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
  assert.equal(conEntorno(undefined, "true", resolveAutoIndex), true, "la anulación explícita funciona aunque no haya entorno");
  assert.equal(conEntorno("development", "false", resolveAutoIndex), false, "se puede reproducir el modo producción en local");
  assert.equal(conEntorno("development", "0", resolveAutoIndex), false);
  assert.equal(conEntorno("test", " FALSE ", resolveAutoIndex), false, "se normaliza igual que el entorno");
});

test("isProductionEnv trata como producción todo lo que no consta", () => {
  const { isProductionEnv } = require("../src/config/db");
  for (const valor of ["production", "Production", "prod", undefined, "", "live", "staging"]) {
    assert.equal(conEntorno(valor, undefined, isProductionEnv), true, `NODE_ENV=${JSON.stringify(valor)}`);
  }
  for (const valor of ["development", "test"]) {
    assert.equal(conEntorno(valor, undefined, isProductionEnv), false, `NODE_ENV=${JSON.stringify(valor)}`);
  }
});

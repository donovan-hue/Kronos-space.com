const test = require("node:test");
const assert = require("node:assert/strict");

/* ============================================================
   Guarda de configuración del proxy inverso (defecto M-03).

   `trust proxy` solo se activa con TRUST_PROXY=1|true. Detrás de Render o
   Vercel, sin él, `req.ip` es la dirección del proxy: los tres limitadores
   pasan a repartir 300/60/20 peticiones por 15 minutos entre TODOS los
   usuarios en un solo cubo. No falla nada visible —la plataforma simplemente
   empieza a devolver 429 a quien no debe—, así que la única defensa es el
   aviso al arrancar.

   Se prueba la función pura, no el `console.warn`: `trustProxyWarning`
   devuelve el mensaje o `null`, que es lo que decide si se avisa.
   ============================================================ */

const previousSecret = process.env.JWT_SECRET;
const previousEnv = process.env.NODE_ENV;
process.env.JWT_SECRET = "kronos-trust-proxy-test-secret";
process.env.NODE_ENV = "test";

const { trustProxyWarning } = require("../src/server");

/** NODE_ENV explícito para cada caso: la guarda es fail-closed por diseño. */
function conEntorno(entorno, trustProxy) {
  const env = { NODE_ENV: entorno };
  if (trustProxy !== undefined) env.TRUST_PROXY = trustProxy;
  const anterior = process.env.NODE_ENV;
  process.env.NODE_ENV = entorno;
  try {
    return trustProxyWarning(env);
  } finally {
    process.env.NODE_ENV = anterior;
  }
}

test.after(() => {
  process.env.JWT_SECRET = previousSecret;
  process.env.NODE_ENV = previousEnv;
});

test("en producción sin TRUST_PROXY se avisa", () => {
  for (const entorno of ["production", "prod", "live", "Production", "PRODUCCION", ""]) {
    const aviso = conEntorno(entorno, undefined);
    assert.equal(
      typeof aviso,
      "string",
      `NODE_ENV="${entorno}" debía avisar: es fail-closed, todo lo que no sea development/test cuenta como producción`
    );
    assert.match(aviso, /^CONFIG_WARNING: TRUST_PROXY/);
    assert.match(aviso, /req\.ip/, "el aviso debe explicar la consecuencia sobre req.ip");
    assert.match(aviso, /rate limit/i, "el aviso debe nombrar lo que se rompe");
  }
});

test("en producción con TRUST_PROXY activo no se avisa", () => {
  for (const valor of ["1", "true", "TRUE", " true ", "True"]) {
    assert.equal(
      conEntorno("production", valor),
      null,
      `TRUST_PROXY="${valor}" debe contar como activo`
    );
  }
});

test("en producción con un valor que NO activa el proxy se avisa", () => {
  // `app.set("trust proxy", 1)` solo se ejecuta con "1" o "true"; cualquier
  // otra cadena deja el proxy sin declarar aunque parezca configurado.
  for (const valor of ["0", "false", "yes", "on", "loopback", "2"]) {
    assert.equal(
      typeof conEntorno("production", valor),
      "string",
      `TRUST_PROXY="${valor}" no activa trust proxy en server.js: debe avisar`
    );
  }
});

test("en desarrollo y en pruebas no se avisa", () => {
  for (const entorno of ["development", "test", "Development", " TEST "]) {
    assert.equal(
      conEntorno(entorno, undefined),
      null,
      `NODE_ENV="${entorno}" consta como entorno sin datos reales: sin proxy local no hay nada que avisar`
    );
  }
});

test("el aviso se emite al arrancar en producción", () => {
  // La función pura no basta: startServer tiene que llamarla, o el aviso no lo
  // lee nadie. Se comprueba sobre el código, igual que hacen los tests de
  // contrato de este proyecto con el montaje de rutas.
  const fs = require("node:fs");
  const path = require("node:path");
  const fuente = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");

  assert.match(
    fuente,
    /const avisoProxy = trustProxyWarning\(\);/,
    "startServer no consulta la guarda"
  );
  assert.match(
    fuente,
    /if \(avisoProxy\) \{\s*console\.warn\(avisoProxy\);/,
    "startServer consulta la guarda pero no la registra"
  );

  // Y el consumo real: la misma condición que activa trust proxy.
  assert.match(
    fuente,
    /process\.env\.TRUST_PROXY === "1" \|\| process\.env\.TRUST_PROXY === "true"/,
    "cambió la condición que activa trust proxy: la guarda debe seguirle el paso"
  );
});

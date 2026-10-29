const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Política de publicación: correo verificado como requisito.
 *
 * Se prueba la decisión, no el HTTP. Lo que se vigila aquí es que la guarda
 * esté **apagada por default** y que un 403 lleve el código con el que el
 * compositor ofrece el enlace de verificación. Que la ruta responda ese 403 lo
 * comprueba `posting-policy.e2e.test.js` contra MongoDB.
 */

const {
  VAR,
  parseBoolean,
  exigeCorreoVerificado,
  decidirPublicacion
} = require("../src/config/postingPolicy");

test("la variable se llama como la declara server/.env.example", () => {
  assert.equal(VAR, "REQUIRE_VERIFIED_EMAIL_TO_POST");
});

test("parseBoolean solo acepta los valores documentados", () => {
  assert.equal(parseBoolean("true", false), true);
  assert.equal(parseBoolean("1", false), true);
  assert.equal(parseBoolean("false", true), false);
  assert.equal(parseBoolean("0", true), false);
  // Un typo no enciende ni apaga: devuelve el default del llamante.
  assert.equal(parseBoolean("yes", false), false);
  assert.equal(parseBoolean("TRUE", false), false);
  assert.equal(parseBoolean("", false), false);
  assert.equal(parseBoolean(undefined, true), true);
});

test("la exigencia está apagada si no se dice lo contrario, y se apaga con 0 o false", () => {
  assert.equal(exigeCorreoVerificado({}), false);
  assert.equal(exigeCorreoVerificado({ [VAR]: "" }), false);
  assert.equal(exigeCorreoVerificado({ [VAR]: "false" }), false);
  assert.equal(exigeCorreoVerificado({ [VAR]: "0" }), false);
  assert.equal(exigeCorreoVerificado({ [VAR]: "true" }), true);
  assert.equal(exigeCorreoVerificado({ [VAR]: "1" }), true);
  // Nada de truthy implícito: "verdadero" en cualquier otro idioma o forma no cuenta.
  assert.equal(exigeCorreoVerificado({ [VAR]: "sí" }), false);
});

test("con la guarda apagada nadie es consultado ni rechazado", () => {
  const decision = decidirPublicacion({ usuario: { emailVerified: false }, exigible: false });
  assert.deepEqual(decision, { permitido: true, motivo: null });
  // Ni siquiera una cuenta inexistente bloquea: la política no opina.
  assert.equal(decidirPublicacion({ usuario: null, exigible: false }).permitido, true);
});

test("con la guarda encendida, el correo sin verificar bloquea con código accionable", () => {
  const decision = decidirPublicacion({ usuario: { emailVerified: false }, exigible: true });
  assert.equal(decision.permitido, false);
  assert.equal(decision.motivo, "correo-no-verificado");
  assert.equal(decision.estado, 403);
  assert.equal(decision.code, "correo_no_verificado");
  assert.match(decision.error, /verificar tu correo/i);
  // El aviso tiene que decir dónde se resuelve, no solo que no se puede.
  assert.match(decision.error, /Verificación de correo/);
});

test("una cuenta verificada publica", () => {
  assert.equal(decidirPublicacion({ usuario: { emailVerified: true }, exigible: true }).permitido, true);
  // `emailVerified` ausente es «no consta», no «verificado».
  assert.equal(decidirPublicacion({ usuario: {}, exigible: true }).permitido, false);
  assert.equal(decidirPublicacion({ usuario: { emailVerified: 1 }, exigible: true }).permitido, false,
    "una verdad que no es booleano no abre la guarda");
});

test("sesión sin documento es 401, no una invitación a verificar el correo", () => {
  const decision = decidirPublicacion({ usuario: null, exigible: true });
  assert.equal(decision.permitido, false);
  assert.equal(decision.estado, 401);
  assert.equal(decision.code, "cuenta_no_encontrada");
  assert.equal(decision.motivo, "sin-cuenta");
});

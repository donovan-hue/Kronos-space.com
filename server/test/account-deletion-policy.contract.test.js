const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluarAutorizacionBorrado,
  DECISIONES
} = require("../src/modules/users/accountDeletionPolicy");

/**
 * KRONOS · política de borrado de cuenta (función pura, sin MongoDB).
 *
 * El contrato que se sella aquí es el que permite ejercer la supresión a una
 * cuenta creada con Google sin romper el camino de contraseña de siempre.
 * Cada caso está escrito para fallar si la regla se afloja en cualquier
 * dirección: ni el camino nuevo alcanza a una cuenta con contraseña, ni el
 * viejo se degrada.
 */

test("cuenta con contraseña: exige la contraseña y la marca como su camino", () => {
  const decision = evaluarAutorizacionBorrado({
    hasPassword: true,
    password: "  KronosDelete123! ",
    confirm: "cualquiera",
    username: "alex_kronos"
  });

  assert.deepEqual(decision, {
    ok: true,
    method: "password",
    password: "KronosDelete123!"
  });
});

test("cuenta con contraseña sin contraseña en el cuerpo → 400 con el mensaje histórico", () => {
  const decision = evaluarAutorizacionBorrado({
    hasPassword: true,
    password: undefined,
    username: "alex_kronos"
  });

  assert.equal(decision.ok, false);
  assert.equal(decision.status, 400);
  assert.equal(decision.error, "Contraseña obligatoria para eliminar la cuenta");
});

test("una cadena en blanco no cuenta como contraseña", () => {
  for (const password of ["", "   ", "\t\n"]) {
    const decision = evaluarAutorizacionBorrado({ hasPassword: true, password, username: "alex" });
    assert.equal(decision.status, DECISIONES.PASSWORD_REQUIRED.status, `password=${JSON.stringify(password)}`);
  }
});

test("el nombre de usuario NUNCA sustituye a la contraseña de quien la tiene", () => {
  const decision = evaluarAutorizacionBorrado({
    hasPassword: true,
    password: "",
    confirm: "alex_kronos",
    username: "alex_kronos"
  });

  assert.equal(decision.ok, false);
  assert.equal(decision.code, "PASSWORD_REQUIRED");
});

test("cuenta sin contraseña: la confirmación exacta autoriza el otro camino", () => {
  const decision = evaluarAutorizacionBorrado({
    hasPassword: false,
    confirm: " Alex_Kronos ",
    username: "alex_kronos"
  });

  assert.deepEqual(decision, { ok: true, method: "username-confirm" });
});

test("cuenta sin contraseña sin confirmación → 400 que explica qué falta", () => {
  const decision = evaluarAutorizacionBorrado({ hasPassword: false, username: "alex_kronos" });

  assert.equal(decision.status, 400);
  assert.equal(decision.code, "CONFIRM_USERNAME_REQUIRED");
  assert.match(decision.error, /nombre de usuario/);
});

test("la confirmación debe ser exacta: ni ajena, ni parcial, ni con adornos", () => {
  // La comparación es de igualdad tras recortar y plegar mayúsculas: un
  // prefijo del nombre («alex» de «alex_kronos») no autoriza nada.
  const rechazos = ["otra-cuenta", "alex", "alex_kronos_", " alex_kronos!", "alex_kronos;"];

  for (const confirm of rechazos) {
    const decision = evaluarAutorizacionBorrado({ hasPassword: false, confirm, username: "alex_kronos" });
    assert.equal(decision.ok, false, `confirm=${JSON.stringify(confirm)} no debía autorizar`);
    assert.equal(decision.code, "CONFIRM_USERNAME_MISMATCH", `confirm=${JSON.stringify(confirm)}`);
  }

  // Espacios y mayúsculas sí se perdonan: es el mismo nombre escrito distinto.
  for (const confirm of ["alex_kronos", "Alex_Kronos", "  alex_kronos  "]) {
    assert.equal(
      evaluarAutorizacionBorrado({ hasPassword: false, confirm, username: "alex_kronos" }).ok,
      true,
      `confirm=${JSON.stringify(confirm)} debía autorizar`
    );
  }
});

test("una cuenta sin nombre de usuario registrado no puede borrarse por confirmación", () => {
  for (const username of ["", "   ", undefined, null]) {
    const decision = evaluarAutorizacionBorrado({ hasPassword: false, confirm: username || "x", username });
    assert.equal(decision.ok, false, `username=${String(username)}`);
    assert.equal(decision.status, DECISIONES.CONFIRM_INVALID.status);
  }
});

test("un cuerpo mal formado no autoriza nada", () => {
  for (const body of [undefined, null, "password", 42, []]) {
    const decision = evaluarAutorizacionBorrado({
      hasPassword: true,
      password: body?.password,
      confirm: body?.confirm,
      username: "alex"
    });
    assert.equal(decision.ok, false, `body=${JSON.stringify(body)}`);
  }
});

test("los códigos de rechazo conservan estado y mensaje estables", () => {
  assert.deepEqual(
    { ...DECISIONES.PASSWORD_INVALID },
    { status: 403, code: "PASSWORD_INVALID", error: "Contraseña incorrecta" }
  );
  assert.equal(DECISIONES.CONFIRM_INVALID.status, 403);
});

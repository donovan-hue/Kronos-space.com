/**
 * KRONOS · política de autorización para borrar la cuenta.
 *
 * `DELETE /api/users/me` es la operación más destructiva de la API y la única
 * que no se puede deshacer. El control histórico era «trae tu contraseña», y
 * eso dejaba fuera a las cuentas creadas con Google, que nacen sin contraseña
 * (ver `server/src/modules/users/User.js`): sin proveedor de correo activo no
 * pueden fijarse una, así que su titular no tenía forma de ejercer el derecho
 * de supresión.
 *
 * Dos caminos, y solo uno puede aplicarse:
 *
 *   · `password` — la cuenta tiene contraseña: se exige y se verifica con
 *     bcrypt. Es el camino histórico y su contrato NO cambia.
 *   · `username-confirm` — la cuenta NO tiene contraseña: se exige que el
 *     cuerpo repita exactamente el nombre de usuario. No es un segundo factor,
 *     es fricción deliberada contra un token robado, y es estrictamente menos
 *     permisible que el camino de contraseña: si la cuenta tiene hash, la
 *     confirmación por nombre de usuario NUNCA autoriza el borrado.
 *
 * Función pura: el `bcrypt.compare` y el acceso a la base quedan en la ruta,
 * de modo que la política se pueda probar sin MongoDB (el mismo criterio que
 * separa `session.service.js` de sus rutas).
 */

const DECISIONES = {
  PASSWORD_REQUIRED: {
    status: 400,
    code: "PASSWORD_REQUIRED",
    error: "Contraseña obligatoria para eliminar la cuenta"
  },
  PASSWORD_INVALID: {
    status: 403,
    code: "PASSWORD_INVALID",
    error: "Contraseña incorrecta"
  },
  CONFIRM_REQUIRED: {
    status: 400,
    code: "CONFIRM_USERNAME_REQUIRED",
    error:
      "Escribe tu nombre de usuario para confirmar el borrado de esta cuenta"
  },
  CONFIRM_INVALID: {
    status: 403,
    code: "CONFIRM_USERNAME_MISMATCH",
    error: "El nombre de usuario no coincide con esta cuenta"
  }
};

function texto(value) {
  return typeof value === "string" ? value.trim() : "";
}

function rechazo(motivo) {
  return { ok: false, ...motivo };
}

/**
 * Decide qué camino de verificación aplica y si el intento es admisible antes
 * de tocar la base.
 *
 * @param {object} input
 * @param {boolean} input.hasPassword   la cuenta tiene `passwordHash`
 * @param {unknown} input.password       valor `password` del cuerpo
 * @param {unknown} input.confirm        valor `confirm` del cuerpo
 * @param {string} input.username        nombre de usuario real de la cuenta
 */
function evaluarAutorizacionBorrado({ hasPassword, password, confirm, username }) {
  const clave = texto(password);
  const confirmacion = texto(confirm);

  if (hasPassword) {
    // El camino de contraseña no acepta sustitutos: una confirmación de
    // nombre de usuario jamás reemplaza a la contraseña de una cuenta que la
    // tiene, ni siquiera si ambos campos llegan mal.
    if (!clave) return rechazo(DECISIONES.PASSWORD_REQUIRED);
    return { ok: true, method: "password", password: clave };
  }

  // Una cuenta cuyo nombre no se puede leer no puede verificar nada por
  // confirmación: se rechaza en lugar de comparar contra una cadena vacía.
  const esperado = texto(username).toLowerCase();

  if (!esperado) return rechazo(DECISIONES.CONFIRM_INVALID);

  if (!confirmacion) return rechazo(DECISIONES.CONFIRM_REQUIRED);

  if (confirmacion.toLowerCase() !== esperado) {
    return rechazo(DECISIONES.CONFIRM_INVALID);
  }

  return { ok: true, method: "username-confirm" };
}

module.exports = {
  evaluarAutorizacionBorrado,
  DECISIONES
};

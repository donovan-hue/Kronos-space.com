/**
 * Reglas del cambio de contraseña desde una sesión abierta.
 *
 * Hasta ahora no existía: quien entraba con Google (`hasPassword: false`) no
 * tenía forma de fijar una contraseña, y quien la tenía solo podía cambiarla
 * pasando por el correo de reseteo (que además exige un proveedor de correo
 * funcionando).
 *
 * Se valida en una función pura para poder probar cada decisión sin base de
 * datos ni bcrypt.
 */

const MIN_LENGTH = 8;
// bcrypt ignora silenciosamente todo lo que pase de 72 bytes: aceptar una
// contraseña más larga daría una falsa sensación de seguridad.
const MAX_BYTES = 72;
const MAX_LENGTH = 128;

/**
 * @param {{hasPassword: boolean, currentPassword?: string, newPassword?: string, confirmPassword?: string}} input
 * @returns {{ok: boolean, status?: number, code?: string, error?: string, newPassword?: string}}
 */
function evaluatePasswordChange({ hasPassword, currentPassword, newPassword, confirmPassword }) {
  const next = typeof newPassword === "string" ? newPassword : "";
  const confirm = typeof confirmPassword === "string" ? confirmPassword : "";
  const current = typeof currentPassword === "string" ? currentPassword : "";

  if (!next) {
    return { ok: false, status: 400, code: "PASSWORD_REQUIRED", error: "Escribe la nueva contraseña" };
  }

  if (next.length < MIN_LENGTH) {
    return {
      ok: false,
      status: 400,
      code: "PASSWORD_TOO_SHORT",
      error: `La contraseña debe tener al menos ${MIN_LENGTH} caracteres`
    };
  }

  if (next.length > MAX_LENGTH) {
    return {
      ok: false,
      status: 400,
      code: "PASSWORD_TOO_LONG",
      error: `La contraseña no puede superar ${MAX_LENGTH} caracteres`
    };
  }

  // Se mide en bytes porque bcrypt corta ahí, no en caracteres.
  if (Buffer.byteLength(next, "utf8") > MAX_BYTES) {
    return {
      ok: false,
      status: 400,
      code: "PASSWORD_TOO_LONG",
      error: "La contraseña es demasiado larga (máximo 72 bytes)"
    };
  }

  if (confirm !== next) {
    return {
      ok: false,
      status: 400,
      code: "PASSWORD_MISMATCH",
      error: "Las contraseñas no coinciden"
    };
  }

  // Solo se exige la contraseña actual si existe una. Una cuenta de Google sin
  // contraseña no puede demostrar algo que nunca tuvo: se le pide tener sesión,
  // que es lo que ya hace el middleware.
  if (hasPassword && !current) {
    return {
      ok: false,
      status: 400,
      code: "CURRENT_PASSWORD_REQUIRED",
      error: "Escribe tu contraseña actual"
    };
  }

  if (hasPassword && current === next) {
    return {
      ok: false,
      status: 400,
      code: "PASSWORD_UNCHANGED",
      error: "La nueva contraseña debe ser distinta de la actual"
    };
  }

  return { ok: true, newPassword: next };
}

module.exports = { evaluatePasswordChange, MIN_LENGTH, MAX_LENGTH, MAX_BYTES };

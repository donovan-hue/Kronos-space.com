/**
 * POLÍTICA DE PUBLICACIÓN — qué tiene que cumplir una cuenta para publicar.
 *
 * `REQUIRE_VERIFIED_EMAIL_TO_POST=true` exige el correo verificado para crear
 * publicaciones y republicaciones. Con la variable apagada —el default— el
 * comportamiento es el de siempre: se publica sin verificar.
 *
 * El default está apagado por un hecho, no por comodidad: verificar el correo
 * exige enviarlo, y enviarlo exige `RESEND_API_KEY`. Encender la guarda en un
 * despliegue sin proveedor deja a **todas** las cuentas locales sin poder
 * publicar, con un enlace de verificación imposible de completar. Una guarda
 * que no se puede cumplir no filtra spam: cierra el producto. Por eso la
 * decisión de encenderla es del despliegue, no del código.
 *
 * Las cuentas creadas con Google nacen con `emailVerified: true` (lo pone el
 * propio flujo de registro, no esta política): el proveedor ya verificó ese
 * correo y pedir una segunda verificación sería exigir una prueba de algo que
 * ya consta.
 *
 * Qué NO cubre, a propósito: comentarios, reacciones y mensajes directos. La
 * verificación corta el **brote** —contenido que entra al feed de terceros—,
 * no la conversación uno a uno. Extenderla a los comentarios convertiría una
 * verificación de identidad en un peaje para responder; si algún día se
 * decide, el sitio es `decidirPublicacion` con otra acción, no otra estructura.
 */

/** Mismos valores admitidos que `config/featureFlags.js`: nada de truthy implícito. */
function parseBoolean(raw, fallback) {
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return fallback;
}

/**
 * ¿Está encendida la exigencia? Cualquier valor que no sea `true`/`1` cuenta
 * como apagada, incluido un typo: una guarda de publicación se enciende de
 * forma explícita o no se enciende.
 *
 * La lectura se escribe literal (`env?.REQUIRE_VERIFIED_EMAIL_TO_POST`) y no con
 * una clave calculada: `server/test/env-examples.contract.test.js` recorre
 * `server/src` con ese patrón para que ninguna variable exista sin plantilla o
 * sin consumidor. Cambiar la forma de leerla apaga el barrido, no la guarda.
 */
function exigeCorreoVerificado(env = process.env) {
  return parseBoolean(env?.REQUIRE_VERIFIED_EMAIL_TO_POST, false);
}

/**
 * Decisión para una acción de publicación. Devuelve el payload listo para
 * responder, para que la redacción del aviso no se reescriba en cada ruta.
 */
function decidirPublicacion({ usuario, exigible }) {
  if (!exigible) {
    return { permitido: true, motivo: null };
  }

  // La guarda se evaluó con una sesión válida pero sin documento: el token
  // existe y la cuenta no. Eso es 401 (sesión contra un dato que ya no está),
  // no un 403 que invite a verificar algo que no se puede verificar.
  if (!usuario || typeof usuario !== "object") {
    return {
      permitido: false,
      motivo: "sin-cuenta",
      estado: 401,
      code: "cuenta_no_encontrada",
      error: "Tu sesión ya no corresponde a una cuenta. Vuelve a entrar."
    };
  }

  // Comparación estricta: lo que verifica es el campo booleano de `User`. Un
  // `1` o un `"true"` suelto en un payload no abre la guarda — nadie va a
  // construir esa prueba por accidente, y si aparece, conviene que estorbe.
  if (usuario.emailVerified === true) {
    return { permitido: true, motivo: null };
  }

  return {
    permitido: false,
    motivo: "correo-no-verificado",
    estado: 403,
    code: "correo_no_verificado",
    error:
      "Necesitas verificar tu correo antes de publicar. Revisa tu bandeja de entrada " +
      "o pide uno nuevo desde Verificación de correo."
  };
}

module.exports = {
  VAR: "REQUIRE_VERIFIED_EMAIL_TO_POST",
  parseBoolean,
  exigeCorreoVerificado,
  decidirPublicacion
};

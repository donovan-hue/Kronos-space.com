/**
 * Correo transaccional vía Resend.
 *
 * Antes vivía dentro de `auth.routes.js` y solo lo usaban la verificación de
 * correo y el reseteo de contraseña. Al abrir el aviso por correo de las
 * notificaciones hizo falta el mismo envío desde otro módulo, y copiarlo
 * habría duplicado (y con el tiempo divergido) la validación de configuración
 * y el manejo de errores. Se movió aquí sin cambiar el contrato: mismos
 * códigos (`EMAIL_SERVICE_NOT_CONFIGURED`, `EMAIL_SEND_TIMEOUT`,
 * `EMAIL_SEND_FAILED`) y mismo tiempo de espera.
 */

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

async function sendTransactionalEmail({ email, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    const error = new Error("EMAIL_SERVICE_NOT_CONFIGURED");
    error.code = "EMAIL_SERVICE_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject,
        html
      }),
      signal: controller.signal
    });
  } catch (error) {
    const emailError = new Error(
      error.name === "AbortError" ? "EMAIL_SEND_TIMEOUT" : "EMAIL_SEND_FAILED"
    );
    emailError.code = emailError.message;
    emailError.cause = error;
    throw emailError;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    console.error("RESEND_ERROR:", body);
    const error = new Error("EMAIL_SEND_FAILED");
    error.code = "EMAIL_SEND_FAILED";
    error.statusCode = 502;
    throw error;
  }

  return true;
}

module.exports = {
  escapeHtml,
  emailConfigured,
  sendTransactionalEmail
};

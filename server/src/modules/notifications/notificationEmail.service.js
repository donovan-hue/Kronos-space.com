const { escapeHtml, sendTransactionalEmail } = require("../mail/mail.service");

/**
 * Aviso por correo de las notificaciones in-app.
 *
 * Hasta ahora `preferences.notifications.email` se guardaba pero no servía de
 * nada: el único correo del proyecto era el de auth (verificación y reseteo).
 * Este módulo traduce una notificación ya creada a un correo breve.
 *
 * Reglas de diseño:
 * - **El correo nunca tumba la acción.** `notifySafely` ya traga los errores de
 *   la escritura; el envío va con la misma política (`.catch` + log).
 * - **Solo se envía si hay proveedor.** Sin `RESEND_API_KEY` no se intenta: el
 *   caso normal de un entorno local no debe llenar el log de fallos.
 * - **Solo para avisos de personas.** Un bloqueo, un reporte o una moderación
 *   no se mandan por correo: son asuntos dentro del producto y no hay texto
 *   que se pueda mandar a un buzón sin explicar de más.
 */

// Tipos que tienen correo. El resto (moderation, report, live, capsule) se
// queda in-app a propósito.
const EMAIL_TYPES = new Set(["follow", "like", "comment", "repost", "save", "event", "story"]);

const SUBJECTS = {
  follow: "te empezó a seguir",
  like: "le gustó tu publicación",
  comment: "comentó tu publicación",
  repost: "republicó tu publicación",
  save: "guardó tu publicación",
  event: "respondió a tu evento",
  story: "respondió a tu historia"
};

function appBaseUrl() {
  // `CLIENT_URL` puede traer varias separadas por coma; el correo enlaza a la
  // primera, que es el origen canónico.
  const raw = String(process.env.CLIENT_URL || "http://localhost:3000").split(/[,;\s]+/)[0];
  return raw.replace(/\/+$/, "");
}

function destinationPath(notification) {
  const kind = notification?.ref?.kind;
  // `ref.id` no se usa en la ruta: cada destino es una pantalla que ya sabe
  // abrir el elemento (el archivo de historias, la sala, las cápsulas). Se
  // documenta aquí para que nadie lo "arregle" inventando rutas con id.
  if (kind === "story") return "/stories/archive";
  if (kind === "live") return "/live";
  if (kind === "capsule") return "/capsules";
  if (kind === "report") return "/notifications";
  if (notification?.post) return `/post/${String(notification.post._id || notification.post)}`;
  if (notification?.actor?.username) return `/u/${notification.actor.username}`;
  return "/notifications";
}

function buildNotificationEmail(notification) {
  const actor = notification?.actor?.displayName || notification?.actor?.username || "Alguien";
  const subject = `${actor} ${SUBJECTS[notification?.type] || "tiene novedades"} en Kronos Space`;
  const url = `${appBaseUrl()}${destinationPath(notification)}`;
  const safeActor = escapeHtml(actor);
  const safeUrl = escapeHtml(url);

  return {
    subject,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px;margin:auto">
        <h2>Kronos Space</h2>
        <p><strong>${safeActor}</strong> ${escapeHtml(SUBJECTS[notification?.type] || "tiene novedades")}.</p>
        <p>
          <a
            href="${safeUrl}"
            style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:8px"
          >
            Ver en Kronos
          </a>
        </p>
        <p style="color:#666;font-size:13px">
          Recibes este correo porque activaste los avisos por correo. Puedes
          desactivarlos en Ajustes → Notificaciones.
        </p>
      </div>
    `
  };
}

/**
 * Envía el correo de una notificación recién creada.
 *
 * `recipientUser` es el documento del destinatario ya consultado por
 * `createNotification` (para no volver a la base). Devuelve `true` si se
 * envió, `false` si se omitió y nunca rechaza.
 */
async function sendNotificationEmail({ notification, recipientUser, send = sendTransactionalEmail }) {
  if (!notification || !recipientUser) return false;
  if (!EMAIL_TYPES.has(notification.type)) return false;
  if (recipientUser?.preferences?.notifications?.email !== true) return false;
  if (!recipientUser?.email) return false;

  const { subject, html } = buildNotificationEmail(notification);

  try {
    await send({ email: recipientUser.email, subject, html });
    return true;
  } catch (error) {
    // Mismo criterio que `notifySafely`: no romper el flujo del usuario.
    console.error("NOTIFICATION_EMAIL_SWALLOWED_ERROR", {
      type: notification?.type || "",
      code: error?.code || "",
      message: error?.message || ""
    });
    return false;
  }
}

module.exports = {
  EMAIL_TYPES,
  SUBJECTS,
  appBaseUrl,
  destinationPath,
  buildNotificationEmail,
  sendNotificationEmail
};

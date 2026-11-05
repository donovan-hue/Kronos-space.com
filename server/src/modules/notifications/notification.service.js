const Notification = require("./Notification");
const User = require("../users/User");
const { sendNotificationEmail } = require("./notificationEmail.service");
const { isMuted } = require("./notificationGroups");
const { isBlockedBetween } = require("../moderation/moderation.service");

async function createNotification({
  recipient,
  actor,
  type,
  post = null,
  ref = null,
  io
}) {
  if (!recipient || !actor || String(recipient) === String(actor)) {
    return null;
  }

  // Preferencias de cuenta: por defecto se conserva el aviso in-app.
  // `notifications.email` se lee aquí porque el aviso por correo se decide con
  // la misma consulta (evita un segundo viaje a la base al enviarlo).
  const recipientPreferences = await User.findById(recipient)
    .select("email username displayName preferences.notifications")
    .lean();
  if (recipientPreferences?.preferences?.notifications?.inApp === false) {
    return null;
  }
  // Silencio por grupo: apagar «guardados» no debe apagar «comentarios».
  if (isMuted(type, recipientPreferences?.preferences?.notifications?.muted)) {
    return null;
  }

  // Un bloqueo corta la interacción y también el aviso: ni el actor
  // bloqueado ni quien bloqueó reciben notificaciones del otro.
  if (await isBlockedBetween(recipient, actor)) {
    return null;
  }

  // `ref` es el destino no-publicación (historia, cápsula, sala, reporte).
  // Se normaliza aquí y no en cada emisor para que un `kind` desconocido no
  // haga fallar la escritura por el `enum`: se descarta y queda el aviso sin
  // enlace, que es el comportamiento anterior.
  const refKind = typeof ref?.kind === "string" && ref.kind.trim() ? ref.kind.trim() : "";
  const refId = ref?.id && String(ref.id).trim() ? ref.id : null;
  const safeRef =
    refKind && refId && ["story", "capsule", "live", "report"].includes(refKind)
      ? { kind: refKind, id: refId }
      : { kind: "", id: null };

  const notification = await Notification.create({
    recipient,
    actor,
    type,
    post,
    ref: safeRef
  });

  await notification.populate(
    "actor",
    "username displayName avatar"
  );
  await notification.populate("post", "_id content");

  if (io) {
    io.to(`user:${recipient}`).emit(
      "notification:new",
      notification
    );
  }

  // Aviso por correo: solo si el destinatario lo activó y hay proveedor.
  // No se espera el envío para responder: Resend puede tardar hasta 10 s y
  // quien comenta o reacciona no debe esperar por un correo ajeno.
  sendNotificationEmail({ notification, recipientUser: recipientPreferences }).catch(() => {});

  return notification;
}

/**
 * Notificación que no puede tumbar la operación que la provoca.
 *
 * Publicar, republicar, abrir una cápsula o aplicar una acción de moderación
 * son operaciones que ya se confirmaron en la base; si el aviso falla, el
 * usuario no debe recibir un 500 por un efecto secundario. Por eso estos tres
 * sitios envolvían la llamada en `.catch(() => {})`.
 *
 * El problema era el silencio: con el error tragado sin registro, un sistema de
 * notificaciones sistemáticamente roto (esquema, índice, socket) no dejaba ni
 * una línea en el log, y nadie se enteraba hasta que un usuario preguntaba por
 * qué no le llegaban avisos. Esto conserva exactamente el mismo comportamiento
 * hacia el cliente y añade el registro que faltaba.
 *
 * Devuelve la notificación, o `null` si falló. Nunca rechaza.
 */
async function notifySafely(payload) {
  try {
    return await createNotification(payload);
  } catch (error) {
    console.error("NOTIFICATION_SWALLOWED_ERROR", {
      type: payload?.type || "",
      name: error?.name || "Error",
      code: error?.code || "",
      message: error?.message || ""
    });
    return null;
  }
}

module.exports = {
  createNotification,
  notifySafely
};

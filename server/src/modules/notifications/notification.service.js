const Notification = require("./Notification");
const User = require("../users/User");
const { isBlockedBetween } = require("../moderation/moderation.service");

async function createNotification({
  recipient,
  actor,
  type,
  post = null,
  io
}) {
  if (!recipient || !actor || String(recipient) === String(actor)) {
    return null;
  }

  // Preferencias de cuenta: por defecto se conserva el aviso in-app.
  // No se implementa correo aquí porque no existe un proveedor/cola de
  // notificaciones de correo para estos eventos.
  const recipientPreferences = await User.findById(recipient)
    .select("preferences.notifications.inApp")
    .lean();
  if (recipientPreferences?.preferences?.notifications?.inApp === false) {
    return null;
  }

  // Un bloqueo corta la interacción y también el aviso: ni el actor
  // bloqueado ni quien bloqueó reciben notificaciones del otro.
  if (await isBlockedBetween(recipient, actor)) {
    return null;
  }

  const notification = await Notification.create({
    recipient,
    actor,
    type,
    post
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

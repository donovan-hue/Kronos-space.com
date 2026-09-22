const Notification = require("./Notification");
const User = require("../users/User");
const { isBlockedBetween } = require("../moderation/moderation.service");

// Cola en proceso con concurrencia acotada (A-7): un post viral genera
// miles de notificaciones; sin límite, cada request caliente abre N×5
// queries simultáneas. La semántica de `await createNotification()` se
// conserva (la promesa resuelve al completarse el trabajo).
const NOTIFICATION_CONCURRENCY = Number(process.env.NOTIFICATION_CONCURRENCY || 5);
const notificationQueue = [];
let notificationActive = 0;

function pumpNotificationQueue() {
  while (notificationActive < NOTIFICATION_CONCURRENCY && notificationQueue.length > 0) {
    const job = notificationQueue.shift();
    notificationActive += 1;
    job().finally(() => {
      notificationActive -= 1;
      pumpNotificationQueue();
    });
  }
}

function enqueueNotification(task) {
  return new Promise((resolve, reject) => {
    notificationQueue.push(async () => {
      try {
        resolve(await task());
      } catch (error) {
        reject(error);
      }
    });
    pumpNotificationQueue();
  });
}

async function createNotification({
  recipient,
  actor,
  type,
  post = null,
  io
}) {
  return enqueueNotification(() => createNotificationInner({ recipient, actor, type, post, io }));
}

async function createNotificationInner({
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

module.exports = {
  createNotification
};

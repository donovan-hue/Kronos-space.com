const Notification = require("./Notification");
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

const mongoose = require("mongoose");
const Message = require("./Message");
const { mediaUrlsOf, purgeUnreferencedMedia } = require("../../config/mediaLifecycle");

/**
 * Borrado de un mensaje por su autor.
 *
 * Se conserva el documento como lápida (`deletedAt` con el texto vacío y la
 * media quitada) en vez de borrarlo: la conversación mantiene su orden y los
 * acuses de leído/entregado siguen apuntando a algo. El contenido y el archivo
 * sí desaparecen.
 *
 * Devuelve `{ status, body }` para que los dos routers (1-a-1 y grupos) usen
 * exactamente las mismas reglas. Nunca deja que alguien borre un mensaje
 * ajeno.
 */
async function deleteMessageByAuthor({ messageId, userId, io }) {
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    return { status: 400, body: { error: "ID de mensaje inválido" } };
  }

  const message = await Message.findById(messageId).lean();

  if (!message) return { status: 404, body: { error: "El mensaje no existe" } };

  if (String(message.sender) !== String(userId)) {
    return {
      status: 403,
      body: { error: "Solo puedes eliminar tus propios mensajes", code: "NOT_SENDER" }
    };
  }

  if (message.deletedAt) {
    // Idempotente: reintentar el borrado no es un error.
    return { status: 200, body: { messageId: String(message._id), deleted: true } };
  }

  const deletedAt = new Date();

  await Message.updateOne(
    { _id: message._id },
    {
      $set: {
        text: "",
        media: { url: "", mimeType: "", kind: "", size: 0, alt: "" },
        deletedAt
      }
    }
  );

  // La media del mensaje deja de servirse si ningún otro contenido la usa.
  try {
    await purgeUnreferencedMedia(mediaUrlsOf(message));
  } catch (purgeError) {
    console.error("MESSAGE_MEDIA_PURGE_ERROR", {
      messageId: String(message._id),
      message: purgeError?.message || "error"
    });
  }

  if (io) {
    const payload = { messageId: String(message._id), deletedAt };
    if (message.conversation) {
      io.to(`conversation:${message.conversation}`).emit("message:deleted", payload);
    } else {
      io.to(`user:${message.sender}`).emit("message:deleted", payload);
      io.to(`user:${message.receiver}`).emit("message:deleted", payload);
    }
  }

  return { status: 200, body: { messageId: String(message._id), deleted: true, deletedAt } };
}

module.exports = { deleteMessageByAuthor };

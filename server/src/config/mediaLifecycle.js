const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

/**
 * Ciclo de vida de la media de usuario (`/uploads/media/...`).
 *
 * Borrar una publicación debe dejar de servir su media. Como el dueño tiene
 * acceso a sus propios archivos (también antes de publicarlos), un archivo
 * huérfano seguiría accesible para él si no se elimina. Por eso, al borrar,
 * se quitan las copias (GridFS y disco) de cada URL que ya no está referenciada
 * por ningún contenido. Una URL todavía usada en otro lugar se conserva.
 */

const UPLOADS_ROOT = path.resolve(__dirname, "../../uploads");
const BUCKET = "kronosUploads";
const MEDIA_URL = /^\/uploads\/media\/[A-Za-z0-9._-]+$/;

function mediaUrlsOf(doc) {
  const urls = [
    doc?.media?.url,
    doc?.media?.posterUrl,
    ...(Array.isArray(doc?.mediaItems) ? doc.mediaItems.flatMap((item) => [item?.url, item?.posterUrl]) : [])
  ];

  return [...new Set(urls.filter((url) => typeof url === "string" && MEDIA_URL.test(url)))];
}

async function isReferenced(url) {
  const Post = require("../modules/posts/Post");
  const Story = require("../modules/stories/Story");
  const Message = require("../modules/messages/Message");
  const Draft = require("../modules/drafts/Draft");
  const ImageGeneration = require("../modules/image-ai/ImageGeneration");

  const hits = await Promise.all([
    Post.exists({
      $or: [
        { "media.url": url },
        { "media.posterUrl": url },
        { "mediaItems.url": url },
        { "mediaItems.posterUrl": url }
      ]
    }),
    Story.exists({ "media.url": url }),
    Message.exists({ "media.url": url }),
    Draft.exists({
      $or: [
        { "media.url": url },
        { "media.posterUrl": url },
        { "mediaItems.url": url },
        { "mediaItems.posterUrl": url }
      ]
    }),
    ImageGeneration.exists({ imageUrl: url })
  ]);

  return hits.some(Boolean);
}

async function removeDurableCopies(url) {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return 0;

  const filename = url.replace(/^\/uploads\//, "");
  const store = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });
  const files = await store.find({ filename }).toArray();

  for (const file of files) {
    await store.delete(file._id);
  }

  return files.length;
}

function removeLocalCopy(url) {
  const target = path.resolve(UPLOADS_ROOT, url.replace(/^\/uploads\//, ""));

  // Nunca fuera de la carpeta de uploads, aunque la URL llegue manipulada.
  if (!target.startsWith(UPLOADS_ROOT + path.sep)) return false;

  try {
    fs.unlinkSync(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Elimina las copias de las URLs dadas que ya no están referenciadas.
 * Devuelve las URLs eliminadas, para que el llamador lo registre.
 */
async function purgeUnreferencedMedia(urls) {
  const removed = [];

  for (const url of [...new Set(urls)].filter((u) => MEDIA_URL.test(u))) {
    if (await isReferenced(url)) continue;

    await removeDurableCopies(url);
    removeLocalCopy(url);
    removed.push(url);
  }

  return removed;
}

module.exports = {
  mediaUrlsOf,
  purgeUnreferencedMedia,
  isReferenced,
  removeLocalCopy,
  MEDIA_URL
};

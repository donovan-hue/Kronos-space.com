const mongoose = require("mongoose");
const { readMediaAuth } = require("./mediaAuth");
const { canViewPost } = require("../modules/posts/audience.service");

function cache(res, isPublic) {
  res.locals.mediaCacheControl = isPublic
    ? "public, max-age=604800"
    : "private, no-store";
  res.setHeader("Vary", "Cookie");
}

function deny(res) {
  cache(res, false);
  res.setHeader("Vary", "Cookie");
  return res.status(404).end();
}

function mediaPath(req) {
  return decodeURIComponent(
    `${req.baseUrl || ""}${req.path || ""}`.split("?")[0]
  );
}

async function uploadOwner(url) {
  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      return null;
    }

    const filename = url.replace(/^\/uploads\//, "");

    const file = await mongoose.connection.db
      .collection("kronosUploads.files")
      .findOne({ filename });

    return file?.metadata?.ownerId
      ? String(file.metadata.ownerId)
      : null;
  } catch {
    return null;
  }
}

async function postFor(url) {
  const Post = require("../modules/posts/Post");

  return Post.findOne({
    $or: [
      { "media.url": url },
      { "media.posterUrl": url },
      { "mediaItems.url": url },
      { "mediaItems.posterUrl": url }
    ]
  }).lean();
}

async function storyFor(url) {
  const Story = require("../modules/stories/Story");

  return Story.findOne({ "media.url": url }).lean();
}

async function messageFor(url) {
  const Message = require("../modules/messages/Message");

  return Message.findOne({ "media.url": url }).lean();
}

async function draftFor(url) {
  const Draft = require("../modules/drafts/Draft");

  return Draft.findOne({
    $or: [
      { "media.url": url },
      { "media.posterUrl": url },
      { "mediaItems.url": url },
      { "mediaItems.posterUrl": url }
    ]
  }).lean();
}

async function canViewMessage(message, viewerId) {
  if (!message || !viewerId) return false;

  if (
    String(message.sender) === String(viewerId) ||
    String(message.receiver) === String(viewerId)
  ) {
    return true;
  }

  if (!message.conversation) return false;

  const Conversation =
    require("../modules/conversations/Conversation");

  return Boolean(
    await Conversation.findOne({
      _id: message.conversation,
      members: viewerId
    }).select("_id").lean()
  );
}

async function mediaAcl(req, res, next) {
  const url = mediaPath(req);

  if (/^\/uploads\/(?:avatars|covers)\//.test(url)) {
    cache(res, true);
    return next();
  }

  if (!/^\/uploads\/media\//.test(url)) {
    return deny(res);
  }

  const auth = await readMediaAuth(req);
  const viewerId = auth?.user?.id || null;

  // Subida nueva: propietario.
  const ownerId = await uploadOwner(url);

  if (
    viewerId &&
    ownerId &&
    String(ownerId) === String(viewerId)
  ) {
    cache(res, false);
    return next();
  }

  // Posts.
  const post = await postFor(url);

  if (post) {
    const isPublic =
      (post?.audience?.type || "public") === "public";

    if (isPublic && !viewerId) {
      cache(res, true);
      return next();
    }

    if (viewerId && await canViewPost(post, viewerId)) {
      cache(res, false);
      return next();
    }
  }

  // Stories.
  const story = await storyFor(url);

  if (story) {
    const expired =
      story.expiresAt &&
      new Date(story.expiresAt).getTime() <= Date.now();

    if (!expired) {
      if (viewerId && await canViewPost(story, viewerId)) {
        cache(res, false);
        return next();
      }

      if (
        !viewerId &&
        (story?.audience?.type || "public") === "public"
      ) {
        cache(res, true);
        return next();
      }
    }
  }

  // Mensajes.
  const message = await messageFor(url);

  if (message && await canViewMessage(message, viewerId)) {
    cache(res, false);
    return next();
  }

  // Drafts.
  const draft = await draftFor(url);

  if (
    draft &&
    viewerId &&
    String(draft.author) === String(viewerId)
  ) {
    cache(res, false);
    return next();
  }

  // ImageGeneration: resolveremos su modelo exacto si el require falla.
  try {
    const ImageGeneration =
      require("../modules/image-ai/ImageGeneration");

    const generation = await ImageGeneration.findOne({
      imageUrl: url
    }).lean();

    if (
      generation &&
      viewerId &&
      String(generation.user) === String(viewerId)
    ) {
      cache(res, false);
      return next();
    }
  } catch {}

  return deny(res);
}

module.exports = { mediaAcl };

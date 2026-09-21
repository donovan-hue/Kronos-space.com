const REACTION_TYPES = ["like", "love", "laugh", "wow", "sad", "angry"];

function getReactionEntries(post) {
  const entries = [];
  const users = new Set();

  // Explicit reactions are authoritative for a user. This also keeps an
  // accidental duplicate in an old document from inflating the counters.
  for (const item of Array.isArray(post.reactions) ? post.reactions : []) {
    const user = item?.user;
    const type = item?.type;
    const userId = user && String(user);
    if (!userId || !REACTION_TYPES.includes(type) || users.has(userId)) continue;
    users.add(userId);
    entries.push({ user: userId, type });
  }

  // Posts created before multiple reactions existed only have `likes`.
  // Project those users as likes without duplicating an explicit reaction.
  for (const user of Array.isArray(post.likes) ? post.likes : []) {
    const userId = user && String(user);
    if (!userId || users.has(userId)) continue;
    users.add(userId);
    entries.push({ user: userId, type: "like" });
  }

  return entries;
}

function normalizeComments(comments = []) {
  const source = Array.isArray(comments) ? comments : [];
  const normalized = source.map((comment) => {
    const { parentComment, ...visibleComment } = comment;
    return {
      ...visibleComment,
      parentCommentId: parentComment ? String(parentComment) : null,
      replies: []
    };
  });
  const byId = new Map(normalized.filter((comment) => comment._id).map((comment) => [String(comment._id), comment]));
  const roots = [];
  for (const comment of normalized) {
    const parent = comment.parentCommentId ? byId.get(comment.parentCommentId) : null;
    if (parent) parent.replies.push(comment);
    else roots.push(comment);
  }
  return { comments: normalized, commentThreads: roots, commentsCount: normalized.length };
}

function reactionSummary(post, currentUserId) {
  const counts = Object.fromEntries(REACTION_TYPES.map((type) => [type, 0]));
  const entries = getReactionEntries(post);
  for (const entry of entries) counts[entry.type] += 1;
  const current = entries.find((entry) => String(entry.user) === String(currentUserId));

  return {
    reaction: current?.type || null,
    reactionCounts: counts,
    reactionsCount: entries.length,
    likesCount: counts.like,
    liked: current?.type === "like"
  };
}

function normalizePost(post, currentUserId) {
  const savedBy = Array.isArray(post.savedBy) ? post.savedBy : [];
  const mediaItems = Array.isArray(post.mediaItems)
    ? post.mediaItems.filter((item) => item && item.url).slice(0, 4)
    : [];
  const saved = savedBy.some((id) => String(id) === String(currentUserId));
  const hasMedia = Boolean(post.media && post.media.url) || mediaItems.length > 0;
  // Reaction user IDs are an internal persistence detail. `likes` is retained
  // for legacy clients, while the new aggregate contract is public.
  const { savedBy: privateSavedBy, reactions: privateReactions, ...visiblePost } = post;
  if (post.repostOf && typeof post.repostOf.content === "string") {
    visiblePost.repostOf = normalizePost(post.repostOf, currentUserId);
  }
  return {
    ...visiblePost,
    audience: { type: post.audience?.type || "public" },
    hashtags: Array.isArray(post.hashtags) ? post.hashtags : [],
    ...normalizeComments(post.comments),
    ...reactionSummary(post, currentUserId),
    mediaItems,
    saved,
    savedCount: savedBy.length,
    hasMedia,
    // keep media as object for frontend: { url, type, alt }
  };
}

module.exports = normalizePost;
module.exports.REACTION_TYPES = REACTION_TYPES;
module.exports.reactionSummary = reactionSummary;

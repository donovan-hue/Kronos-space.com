function normalizePost(post, currentUserId) {
  const likes = Array.isArray(post.likes) ? post.likes : [];
  const savedBy = Array.isArray(post.savedBy) ? post.savedBy : [];
  const mediaItems = Array.isArray(post.mediaItems)
    ? post.mediaItems.filter((item) => item && item.url).slice(0, 4)
    : [];
  const liked = likes.some((likeUserId) => String(likeUserId) === String(currentUserId));
  const saved = savedBy.some((id) => String(id) === String(currentUserId));
  const hasMedia = Boolean(post.media && post.media.url) || mediaItems.length > 0;
  const { savedBy: privateSavedBy, ...visiblePost } = post;
  if (post.repostOf && typeof post.repostOf.content === "string") {
    visiblePost.repostOf = normalizePost(post.repostOf, currentUserId);
  }
  return {
    ...visiblePost,
    mediaItems,
    likesCount: likes.length,
    liked,
    saved,
    savedCount: savedBy.length,
    hasMedia,
    // keep media as object for frontend: { url, type, alt }
  };
}


module.exports = normalizePost;

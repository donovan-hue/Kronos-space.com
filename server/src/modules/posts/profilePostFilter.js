// Default remains the historical all-posts endpoint for existing clients.
function profilePostFilter(author, tab = "all") {
  switch (tab) {
    case "all": return { author };
    case "posts": return { author, repostOf: null };
    case "media": return {
      author,
      $or: [
        { "media.url": { $type: "string", $ne: "" } },
        { "mediaItems.0.url": { $type: "string", $ne: "" } }
      ]
    };
    case "reposts": return { author, repostOf: { $ne: null } };
    default: return null; // Saved posts are never exposed by a public profile.
  }
}
module.exports = profilePostFilter;

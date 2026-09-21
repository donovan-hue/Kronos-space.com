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

function normalizePoll(poll, currentUserId) {
  const options = Array.isArray(poll?.options) ? poll.options : [];
  const votes = Array.isArray(poll?.votes) ? poll.votes : [];
  const validOptionIds = new Set(options.map((option) => String(option._id)));
  const counts = new Map(options.map((option) => [String(option._id), 0]));
  let selectedOptionId = null;
  const countedUsers = new Set();
  for (const vote of votes) {
    const userId = String(vote.user || "");
    const optionId = String(vote.optionId || "");
    if (!userId || countedUsers.has(userId) || !validOptionIds.has(optionId)) continue;
    countedUsers.add(userId);
    counts.set(optionId, counts.get(optionId) + 1);
    if (userId === String(currentUserId)) selectedOptionId = optionId;
  }
  const totalVotes = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const closesAt = poll.closesAt || null;
  return {
    question: poll.question,
    options: options.map((option) => {
      const optionVotes = counts.get(String(option._id)) || 0;
      return {
        _id: String(option._id),
        text: option.text,
        votes: optionVotes,
        percentage: totalVotes ? Math.round((optionVotes / totalVotes) * 100) : 0
      };
    }),
    totalVotes,
    selectedOptionId,
    closesAt,
    closed: Boolean(closesAt && new Date(closesAt).getTime() <= Date.now())
  };
}

function normalizeEvent(event, currentUserId) {
  const rsvps = Array.isArray(event?.rsvps) ? event.rsvps : [];
  const seenUsers = new Set();
  let interestedCount = 0;
  let goingCount = 0;
  let response = null;
  for (const rsvp of rsvps) {
    const userId = String(rsvp.user || "");
    if (!userId || seenUsers.has(userId)) continue;
    seenUsers.add(userId);
    if (rsvp.status === "interested") interestedCount += 1;
    if (rsvp.status === "going") goingCount += 1;
    if (userId === String(currentUserId)) response = rsvp.status;
  }
  const startsAt = event.startsAt || null;
  const endsAt = event.endsAt || null;
  const now = Date.now();
  const startTime = startsAt ? new Date(startsAt).getTime() : 0;
  const endTime = endsAt ? new Date(endsAt).getTime() : 0;
  const status = startTime > now ? "upcoming" : endTime && endTime <= now ? "ended" : "live";
  return {
    title: event.title,
    description: event.description || "",
    startsAt,
    endsAt,
    timezone: event.timezone || "UTC",
    locationType: event.locationType || "online",
    location: event.location || "",
    interestedCount,
    goingCount,
    response,
    status
  };
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
  if (post.poll) visiblePost.poll = normalizePoll(post.poll, currentUserId);
  if (post.event) visiblePost.event = normalizeEvent(post.event, currentUserId);
  const lineage = post.lineage?.derivedFrom || post.lineage?.tool || post.lineage?.aiGenerated
    ? {
      derivedFrom: post.lineage.derivedFrom?._id
        ? String(post.lineage.derivedFrom._id)
        : post.lineage.derivedFrom
          ? String(post.lineage.derivedFrom)
          : null,
      derivedFromAuthor: post.lineage.derivedFrom?.author
        ? {
          username: post.lineage.derivedFrom.author.username || "",
          displayName: post.lineage.derivedFrom.author.displayName || ""
        }
        : null,
      tool: post.lineage.tool || "",
      aiGenerated: Boolean(post.lineage.aiGenerated)
    }
    : { derivedFrom: null, derivedFromAuthor: null, tool: "", aiGenerated: false };
  const audience = { type: post.audience?.type || "public" };
  if (audience.type === "circle" && post.audience?.circleId) {
    audience.circleId = String(post.audience.circleId);
  }
  if (audience.type === "orbit" && post.audience?.orbitId) {
    audience.orbitId = String(post.audience.orbitId);
  }
  return {
    ...visiblePost,
    lineage,
    audience,
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
module.exports.normalizePoll = normalizePoll;
module.exports.normalizeEvent = normalizeEvent;

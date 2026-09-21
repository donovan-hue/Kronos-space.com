export const REACTION_OPTIONS = [
  { type: "like", emoji: "❤️", label: "Me gusta" },
  { type: "love", emoji: "😍", label: "Me encanta" },
  { type: "laugh", emoji: "😂", label: "Me divierte" },
  { type: "wow", emoji: "😮", label: "Me sorprende" },
  { type: "sad", emoji: "😢", label: "Me entristece" },
  { type: "angry", emoji: "😡", label: "Me enoja" },
];

export const REACTION_TYPES = REACTION_OPTIONS.map(({ type }) => type);

export function getReactionType(post) {
  if (REACTION_TYPES.includes(post?.reaction)) return post.reaction;
  return post?.liked ? "like" : null;
}

export function optimisticReaction(post, type) {
  const previous = getReactionType(post);
  const next = previous === type ? null : type;
  const counts = Object.fromEntries(REACTION_TYPES.map((name) => [name, 0]));
  for (const name of REACTION_TYPES) {
    const fallback = name === "like" ? post?.likesCount : 0;
    counts[name] = Math.max(0, Number(post?.reactionCounts?.[name] ?? fallback ?? 0));
  }
  if (previous) counts[previous] = Math.max(0, counts[previous] - 1);
  if (next) counts[next] += 1;
  return {
    ...post,
    reaction: next,
    liked: next === "like",
    reactionCounts: counts,
    reactionsCount: Object.values(counts).reduce((total, count) => total + count, 0),
    likesCount: counts.like,
  };
}

export function reactionFromResponse(post, response) {
  if (!response) return post;
  return {
    ...post,
    reaction: response.reaction || null,
    liked: Boolean(response.liked),
    reactionCounts: response.reactionCounts || post.reactionCounts,
    reactionsCount: typeof response.reactionsCount === "number" ? response.reactionsCount : post.reactionsCount,
    likesCount: typeof response.likesCount === "number" ? response.likesCount : post.likesCount,
  };
}

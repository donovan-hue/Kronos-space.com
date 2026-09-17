const PRIVACY_KEYS = ["showBio", "showFollowCounts", "discoverable"];

function normalizePrivacy(value = {}) {
  return Object.fromEntries(PRIVACY_KEYS.map(key => [key, value?.[key] !== false]));
}

function privacyUpdates(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (!keys.length || keys.some(key => !PRIVACY_KEYS.includes(key) || typeof body[key] !== "boolean")) return null;
  return Object.fromEntries(keys.map(key => [`profilePrivacy.${key}`, body[key]]));
}

function publicUser(user, viewerId, flags = {}) {
  const privacy = normalizePrivacy(user.profilePrivacy);
  const owner = String(user._id) === String(viewerId);
  const followers = Array.isArray(user.followers) ? user.followers : [];
  const following = Array.isArray(user.following) ? user.following : [];
  const countsVisible = owner || privacy.showFollowCounts;
  return {
    _id: user._id, username: user.username,
    displayName: user.displayName || "",
    avatar: user.avatar || "",
    cover: user.cover || "",
    bio: owner || privacy.showBio ? user.bio || "" : "",
    createdAt: user.createdAt,
    followersCount: countsVisible ? followers.length : null,
    followingCount: countsVisible ? following.length : null,
    isFollowing: followers.some(id => String(id) === String(viewerId)),
    // KRONOS-UI-011 — estado de moderación relativo al visitante.
    blockedByMe: Boolean(flags.blockedByMe),
    mutedByMe: Boolean(flags.mutedByMe)
  };
}

module.exports = { normalizePrivacy, privacyUpdates, publicUser };

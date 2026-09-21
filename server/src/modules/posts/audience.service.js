const mongoose = require("mongoose");
const User = require("../users/User");
const Circle = require("../circles/Circle");
const Orbit = require("../orbits/Orbit");

const AUDIENCE_TYPES = ["public", "followers", "private", "circle", "orbit"];

function normalizeAudience(value) {
  const rawType = typeof value === "string" ? value : value?.type;
  const type = typeof rawType === "string" ? rawType.trim().toLowerCase() : "";
  if (!AUDIENCE_TYPES.includes(type)) return null;
  if (type !== "circle" && type !== "orbit") return { type };
  const key = type === "circle" ? "circleId" : "orbitId";
  const id = typeof value?.[key] === "string" ? value[key].trim() : "";
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return { type, [key]: id };
}

function publicAudienceFilter() {
  return {
    $or: [
      { "audience.type": { $exists: false } },
      { "audience.type": "public" }
    ]
  };
}

async function viewerFollowing(viewerId) {
  if (mongoose.connection.readyState !== 1) return [];
  const viewer = await User.findById(viewerId).select("following").lean();
  return Array.isArray(viewer?.following) ? viewer.following : [];
}

async function viewerCircleIds(viewerId) {
  if (mongoose.connection.readyState !== 1) return [];
  const circles = await Circle.find({
    $or: [{ owner: viewerId }, { members: viewerId }]
  }).select("_id").lean();
  return circles.map((circle) => circle._id);
}

async function viewerOrbitIds(viewerId) {
  if (mongoose.connection.readyState !== 1) return [];
  const orbits = await Orbit.find({
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      { $or: [{ visibility: "public" }, { owner: viewerId }, { "members.user": viewerId }] }
    ]
  }).select("_id").lean();
  return orbits.map((orbit) => orbit._id);
}

async function withAudienceFilter(filter, viewerId) {
  const [following, circleIds, orbitIds] = await Promise.all([
    viewerFollowing(viewerId),
    viewerCircleIds(viewerId),
    viewerOrbitIds(viewerId)
  ]);
  const viewer = new mongoose.Types.ObjectId(viewerId);
  return {
    ...filter,
    $and: [
      ...(Array.isArray(filter.$and) ? filter.$and : []),
      {
        $or: [
          ...publicAudienceFilter().$or,
          { author: viewer },
          {
            $and: [
              { "audience.type": "followers" },
              { author: { $in: following } }
            ]
          },
          ...(circleIds.length ? [{ "audience.type": "circle", "audience.circleId": { $in: circleIds } }] : []),
          ...(orbitIds.length ? [{ "audience.type": "orbit", "audience.orbitId": { $in: orbitIds } }] : [])
        ]
      }
    ]
  };
}

async function canViewPost(post, viewerId) {
  const authorId = post?.author?._id || post?.author;
  if (String(authorId) === String(viewerId)) return true;
  const type = post?.audience?.type || "public";
  if (type === "public") return true;
  if (type === "private") return false;
  if (type === "followers") {
    const following = await viewerFollowing(viewerId);
    return following.some((id) => String(id) === String(authorId));
  }
  if (type === "circle" && post?.audience?.circleId) {
    if (mongoose.connection.readyState !== 1) return false;
    return Boolean(await Circle.exists({
      _id: post.audience.circleId,
      $or: [{ owner: viewerId }, { members: viewerId }]
    }));
  }
  if (type !== "orbit" || !post?.audience?.orbitId || mongoose.connection.readyState !== 1) return false;
  return Boolean(await Orbit.exists({
    _id: post.audience.orbitId,
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      { $or: [{ visibility: "public" }, { owner: viewerId }, { "members.user": viewerId }] }
    ]
  }));
}

module.exports = {
  AUDIENCE_TYPES,
  normalizeAudience,
  publicAudienceFilter,
  withAudienceFilter,
  canViewPost
};

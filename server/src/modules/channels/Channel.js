const mongoose = require("mongoose");

const subscriberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    joinedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const channelSchema = new mongoose.Schema(
  {
    orbit: { type: mongoose.Schema.Types.ObjectId, ref: "Orbit", required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 90 },
    description: { type: String, default: "", trim: true, maxlength: 300 },
    type: { type: String, enum: ["announcement", "discussion"], default: "announcement" },
    subscribers: { type: [subscriberSchema], default: [] },
    lastMessageAt: { type: Date, default: null }
  },
  { timestamps: true, versionKey: false, strict: true }
);

channelSchema.index({ orbit: 1, name: 1 }, { unique: true });
channelSchema.index({ orbit: 1, updatedAt: -1 });

module.exports = mongoose.models.Channel || mongoose.model("Channel", channelSchema);

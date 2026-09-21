const mongoose = require("mongoose");

const channelMessageSchema = new mongoose.Schema(
  {
    channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 }
  },
  { timestamps: true, versionKey: false, strict: true }
);

channelMessageSchema.index({ channel: 1, createdAt: -1 });

module.exports = mongoose.models.ChannelMessage || mongoose.model("ChannelMessage", channelMessageSchema);

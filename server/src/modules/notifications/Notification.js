const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    type: {
      type: String,
      required: true,
      enum: ["follow", "like", "comment", "repost", "save"]
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null
    },
    read: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    strict: true
  }
);

notificationSchema.index({
  recipient: 1,
  createdAt: -1
});

notificationSchema.index({
  recipient: 1,
  read: 1,
  createdAt: -1
});

module.exports = mongoose.model(
  "Notification",
  notificationSchema
);

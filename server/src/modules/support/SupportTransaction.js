const mongoose = require("mongoose");

const supportTransactionSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 1
    },
    tier: {
      type: String,
      enum: ["stardust", "meteor", "supernova", "custom"],
      default: "stardust"
    },
    message: {
      type: String,
      trim: true,
      maxlength: 280,
      default: ""
    },
    anonymous: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

supportTransactionSchema.index({ creator: 1, createdAt: -1 });
supportTransactionSchema.index({ sender: 1, createdAt: -1 });

module.exports =
  mongoose.models.SupportTransaction ||
  mongoose.model("SupportTransaction", supportTransactionSchema);

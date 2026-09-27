const mongoose = require("mongoose");

const savedCollectionSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },
    posts: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Post"
        }
      ],
      default: []
    }
  },
  { timestamps: true, strict: true }
);

savedCollectionSchema.index({ owner: 1, name: 1 }, { unique: true });
savedCollectionSchema.index({ owner: 1, updatedAt: -1 });

module.exports = mongoose.model("SavedCollection", savedCollectionSchema);

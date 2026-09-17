const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    likes: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        }
      ],
      default: []
    },

    comments: {
      type: [
        {
          user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
          },

          content: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000
          },

          createdAt: {
            type: Date,
            default: Date.now
          }
        }
      ],
      default: []
    },

    media: {
      url: {
        type: String,
        default: "",
        trim: true,
        maxlength: 2000
      },
      type: {
        type: String,
        enum: ["image", ""],
        default: ""
      },
      mimeType: {
        type: String,
        default: "",
        trim: true
      },
      size: {
        type: Number,
        default: 0
      },
      alt: {
        type: String,
        default: "",
        trim: true,
        maxlength: 500
      }
    },

    savedBy: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        }
      ],
      default: []
    },

    repostOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null
    }
  },
  {
    timestamps: true,
    strict: true
  }
);

postSchema.index({
  author: 1,
  createdAt: -1
});

postSchema.index({
  createdAt: -1
});

module.exports =
  mongoose.model("Post", postSchema);

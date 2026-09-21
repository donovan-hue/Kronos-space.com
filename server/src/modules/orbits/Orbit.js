const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    role: {
      type: String,
      enum: ["owner", "moderator", "member"],
      default: "member"
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const orbitSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 90
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    },
    welcomeMessage: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
    },
    rules: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: 200
        }
      ],
      default: [],
      validate: {
        validator(items) {
          return Array.isArray(items) && items.length <= 10;
        },
        message: "Una órbita no puede superar 10 reglas"
      }
    },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
      required: true
    },
    expiresAt: {
      type: Date,
      default: null
    },
    members: {
      type: [memberSchema],
      default: []
    }
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true
  }
);

orbitSchema.index({ owner: 1, name: 1 }, { unique: true });
orbitSchema.index({ slug: 1 });

module.exports =
  mongoose.models.Orbit ||
  mongoose.model("Orbit", orbitSchema);

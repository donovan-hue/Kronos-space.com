const mongoose = require("mongoose");

const circleSchema = new mongoose.Schema(
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
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },
    members: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        }
      ],
      default: []
    }
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true
  }
);

circleSchema.index({ owner: 1, name: 1 }, { unique: true });

module.exports =
  mongoose.models.Circle ||
  mongoose.model("Circle", circleSchema);

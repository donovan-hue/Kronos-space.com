const mongoose = require("mongoose");

const mcpServiceCredentialSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false
    },

    permissions: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: 100
        }
      ],
      default: []
    },

    active: {
      type: Boolean,
      default: true,
      index: true
    },

    expiresAt: {
      type: Date,
      default: null,
      index: true
    },

    lastUsedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    strict: true
  }
);

module.exports =
  mongoose.models.McpServiceCredential ||
  mongoose.model(
    "McpServiceCredential",
    mcpServiceCredentialSchema
  );

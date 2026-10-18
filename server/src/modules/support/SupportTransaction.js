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
      },
      /**
       * Idempotencia del apoyo: identificador que genera el cliente para que un
       * doble envío (doble clic o un reintento de red) NO cree dos apoyos.
       * Opcional: sin él, cada envío es un apoyo nuevo, como hasta ahora.
       */
      clientMessageId: {
        type: String,
        trim: true,
        maxlength: 128
      }
    },
    {
      timestamps: true
    }
  );

  supportTransactionSchema.index({ creator: 1, createdAt: -1 });
  supportTransactionSchema.index({ sender: 1, createdAt: -1 });
  // El índice vive en el ámbito de la relación: el mismo contador local del
  // cliente puede repetirse en otra pareja sin estorbar. Es parcial para no
  // afectar a los apoyos históricos, que no traen identificador.
  supportTransactionSchema.index(
    { sender: 1, creator: 1, clientMessageId: 1 },
    {
      name: "support_sender_creator_clientMessageId_unique",
      unique: true,
      partialFilterExpression: {
        creator: { $type: "objectId" },
        clientMessageId: { $type: "string" }
      }
    }
  );

module.exports =
  mongoose.models.SupportTransaction ||
  mongoose.model("SupportTransaction", supportTransactionSchema);

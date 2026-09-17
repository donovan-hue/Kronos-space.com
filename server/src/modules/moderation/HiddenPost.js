const mongoose = require("mongoose");

/**
 * KRONOS-UI-011 — publicaciones ocultas para un usuario.
 *
 * Ocultar es una decisión personal: la publicación desaparece de los
 * feeds y perfiles de ese usuario, pero no se borra ni se denuncia y
 * sigue accesible por enlace directo. El usuario puede restaurarla.
 */
const hiddenPostSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true
  }
);

hiddenPostSchema.index(
  { user: 1, post: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.HiddenPost ||
  mongoose.model("HiddenPost", hiddenPostSchema);

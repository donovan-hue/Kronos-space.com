const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: [
        /^[a-z0-9_]+$/,
        "El usuario solo puede contener letras, números y guion bajo"
      ]
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Email inválido"
      ]
    },

    emailVerified: {
      type: Boolean,
      default: false
    },

    emailVerificationTokenHash: {
      type: String,
      default: null,
      select: false
    },

    emailVerificationExpiresAt: {
      type: Date,
      default: null,
      select: false
    },

    // KRONOS-AUTH-GOOGLE — vinculo con Google Identity Services. El `sub`
    // de Google es estable por cuenta. `select: false` para no exponerlo en
    // perfiles/consultas generales, e índice único sparse para que los
    // usuarios locales (sin googleId) no colisionen en el índice único.
    googleId: {
      type: String,
      trim: true,
      maxlength: 64,
      unique: true,
      sparse: true,
      select: false
    },

    // Ya no es obligatorio: las cuentas creadas vía "Continuar con Google"
    // nacen sin contraseña. El login local ya tolera su ausencia (devuelve
    // 401 sin romper) y el flujo de recuperación permite fijarla después.
    passwordHash: {
      type: String,
      minlength: 20
    },

    passwordResetTokenHash: {
      type: String,
      default: null,
      select: false
    },

    passwordResetExpiresAt: {
      type: Date,
      default: null,
      select: false
    },

    displayName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100
    },

    bio: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    },

    avatar: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    cover: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    role: {
      type: String,
      default: "user",
      enum: ["user", "admin"],
      index: true
    },

    profilePrivacy: {
      showBio: { type: Boolean, default: true },
      showFollowCounts: { type: Boolean, default: true },
      discoverable: { type: Boolean, default: true }
    },

    // BLOQUE 011 — preferencias persistentes de cuenta; no se exponen
    // en perfiles públicos y sus defaults conservan el comportamiento actual.
    preferences: {
      notifications: {
        inApp: { type: Boolean, default: true },
        email: { type: Boolean, default: false }
      },
      content: {
        showSensitive: { type: Boolean, default: false }
      },
      appearance: { type: String, enum: ["system", "dark"], default: "system" },
      language: { type: String, enum: ["es-MX", "en"], default: "es-MX" }
    },

    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ]
  },
  {
    timestamps: true,
    strict: true
  }
);


module.exports =
  mongoose.models.User ||
  mongoose.model("User", userSchema);

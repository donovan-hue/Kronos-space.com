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
      onboarded: { type: Boolean, default: false },
      notifications: {
        inApp: { type: Boolean, default: true },
        email: { type: Boolean, default: false }
      },
      content: {
        showSensitive: { type: Boolean, default: false }
      },
      language: { type: String, enum: ["es-MX", "en"], default: "es-MX" },
      aiPersonality: {
        type: String,
        enum: ["normal", "direct", "sarcastic", "grumpy"],
        default: "normal"
      },
      feed: {
        mode: {
          type: String,
          enum: ["latest", "following", "interests"],
          default: "latest"
        },
        interests: {
          type: [
            {
              type: String,
              trim: true,
              lowercase: true,
              maxlength: 40
            }
          ],
          default: [],
          validate: {
            validator(items) {
              return Array.isArray(items) && items.length <= 20;
            },
            message: "No puedes guardar más de 20 intereses"
          }
        }
      }
    },

    // Ventana de la exportación de datos. No vive en memoria del proceso:
    // un reinicio no debe volver a permitir otra descarga esa misma semana.
    dataExportRequestedAt: {
      type: Date,
      default: null,
      select: false
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

/**
 * KRONOS-USERNAME-HEREDADO — reparación de usuarios guardados antes de la
 * regla `/^[a-z0-9_]+$/`.
 *
 * Los capturadores de mongoose (`lowercase`, `trim`) solo corren cuando el
 * valor SE ASIGNA; un documento que ya vive en la base conserva el valor
 * crudo, así que una cuenta con `username: "Donovan"` falla la validación en
 * CADA `save()`. El caso que se midió: el acceso con Google busca la cuenta
 * por correo para enlazarla, le pone `googleId` y guarda — la validación
 * tumbaba la petición con 500 y `El usuario solo puede contener letras,
 * números y guion bajo`. Sin esto, esa cuenta tampoco puede editar su perfil,
 * exportar datos ni iniciar sesión con Google: queda inservible.
 *
 * La reparación solo toca nombres que YA son inválidos (los válidos pasan de
 * largo sin consultar la base) y deja el mismo formato que usa el alta normal:
 * minúsculas, sin acentos, guion bajo, 20 caracteres de base y sufijo solo si
 * el nombre resultante ya está tomado.
 */
const USERNAME_VALIDO = /^[a-z0-9_]{3,30}$/;

function normalizarUsername(valor) {
  const base = String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);

  if (base.length < 3) return `${base || "u"}_kronos`.slice(0, 30);

  return base;
}

userSchema.pre("validate", async function repararUsernameHeredado() {
  if (USERNAME_VALIDO.test(String(this.username ?? ""))) return;

  const base = normalizarUsername(this.username);
  let candidato = base;

  // Sin conexión (pruebas del contrato HTTP) no se consulta la base: el
  // nombre normalizado se usa tal cual.
  if (mongoose.connection.readyState === 1) {
    const User = this.model("User");

    for (let sufijo = 1; sufijo < 1000; sufijo += 1) {
      const ocupado = await User.exists({
        username: candidato,
        _id: { $ne: this._id }
      });

      if (!ocupado) break;

      candidato = `${base}_${sufijo}`.slice(0, 30);
    }
  }

  console.log(
    `USERNAME_HEREDADO_REPARADO: "${this.username}" -> "${candidato}" (usuario ${this._id || "nuevo"})`
  );

  this.username = candidato;
});

module.exports =
  mongoose.models.User ||
  mongoose.model("User", userSchema);

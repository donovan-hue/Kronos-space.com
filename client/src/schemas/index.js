import { z } from "zod";

/**
 * ESQUEMAS DE VALIDACIÓN KRONOS — única fuente de verdad del cliente.
 *
 * Cada regla refleja el contrato REAL del backend:
 * - auth.routes.js / User.js: username 3-30 [a-z0-9_], email, password ≥8
 * - users.routes.js: displayName ≤100, bio ≤500
 * - posts.routes.js: contenido ≤5000, comentario ≤1000
 * - image/video.routes.js: prompt ≤4000 (obligatorio), negativePrompt ≤2000
 * - script.routes.js: tone ≤100, audience ≤200, duración 1-180, enums
 * Mensajes en español, claros y listos para mostrar bajo cada campo.
 */

// ---------- Campos compartidos ----------

export const emailField = z
  .string({ error: "El correo es obligatorio." })
  .trim()
  .min(1, "El correo es obligatorio.")
  .max(254, "El correo no puede superar 254 caracteres.")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Introduce un correo válido (ej. tu@correo.com).");

export const usernameField = z
  .string({ error: "El nombre de usuario es obligatorio." })
  .trim()
  .min(1, "El nombre de usuario es obligatorio.")
  .min(3, "El usuario debe tener mínimo 3 caracteres.")
  .max(30, "El usuario no puede superar 30 caracteres.")
  .regex(/^[a-z0-9_]+$/, "El usuario solo puede contener letras minúsculas, números y guion bajo.");

function passwordComplexity(password) {
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(password)) classes += 1;
  return classes >= 3;
}

// Política del backend (auth.routes.js): 10-128 + 3 de 4 clases.
export const passwordField = z
  .string({ error: "La contraseña es obligatoria." })
  .min(10, "La contraseña debe tener mínimo 10 caracteres.")
  .max(128, "La contraseña no puede superar 128 caracteres.")
  .refine(
    passwordComplexity,
    "La contraseña debe combinar al menos 3 de: minúsculas, mayúsculas, números y símbolos."
  );

/** Contraseñas con confirmación: política del backend + coincidentes. */
function passwordWithConfirm(confirmMessage = "Las contraseñas no coinciden.") {
  return z
    .object({
      password: passwordField,
      confirmPassword: z.string({ error: "Confirma la contraseña." }).min(1, "Confirma la contraseña."),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: confirmMessage,
      path: ["confirmPassword"],
    });
}

// ---------- Autenticación ----------

export const loginSchema = z.object({
  email: emailField,
  password: z.string({ error: "La contraseña es obligatoria." }).min(1, "La contraseña es obligatoria."),
});

export const registerSchema = z.object({
  username: usernameField,
  displayName: z
    .string()
    .trim()
    .max(100, "El nombre para mostrar no puede superar 100 caracteres.")
    .optional()
    .or(z.literal("")),
  email: emailField,
  password: passwordField,
  confirmPassword: z.string({ error: "Confirma la contraseña." }).min(1, "Confirma la contraseña."),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden.",
  path: ["confirmPassword"],
});

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = passwordWithConfirm();

// ---------- Perfil ----------

export const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(100, "El nombre visible no puede superar 100 caracteres."),
  bio: z.string().trim().max(500, "La biografía no puede superar 500 caracteres."),
  avatar: z
    .string()
    .trim()
    .max(2000, "La URL del avatar no puede superar 2000 caracteres."),
});

// ---------- Publicaciones ----------

/** createPost: contenido ≤5000; el backend exige contenido, media o encuesta. */
export const postCreateSchema = z.object({
  content: z.string().max(5000, "La publicación no puede superar 5000 caracteres."),
  hasMedia: z.boolean(),
  hasPoll: z.boolean().default(false),
  hasEvent: z.boolean().default(false),
}).refine((data) => data.content.trim().length > 0 || data.hasMedia || data.hasPoll || data.hasEvent, {
  message: "La publicación está vacía",
  path: ["content"],
});

export const commentSchema = z
  .string()
  .trim()
  .min(1, "El comentario está vacío")
  .max(1000, "El comentario no puede superar 1000 caracteres");

// ---------- Kairos ----------

export const imagePromptSchema = z.object({
  prompt: z
    .string({ error: "El prompt es obligatorio." })
    .trim()
    .min(1, "El prompt es obligatorio.")
    .max(4000, "El prompt no puede superar 4000 caracteres."),
  negativePrompt: z
    .string()
    .trim()
    .max(2000, "El negative prompt no puede superar 2000 caracteres."),
  style: z.enum(["cinematic", "editorial", "concept-art", "photorealistic"]),
});

export const videoPromptSchema = z.object({
  prompt: z
    .string({ error: "El prompt es obligatorio." })
    .trim()
    .min(1, "El prompt es obligatorio.")
    .max(4000, "El prompt no puede superar 4000 caracteres."),
  negativePrompt: z.string().trim().max(2000, "El negative prompt no puede superar 2000 caracteres."),
  style: z.string().trim().max(80, "El estilo no puede superar 80 caracteres."),
});

export const SCRIPT_TYPES = ["video", "reel", "youtube", "advertisement", "story", "presentation", "custom"];
export const SCRIPT_GENRES = ["general", "drama", "comedy", "thriller", "horror", "romance", "action", "documentary", "educational"];
export const SCRIPT_FORMATS = ["standard", "cinematic", "vertical", "documentary", "podcast", "presentation"];

export const scriptSchema = z.object({
  type: z.enum(SCRIPT_TYPES),
  genre: z.enum(SCRIPT_GENRES),
  format: z.enum(SCRIPT_FORMATS),
  durationMinutes: z.coerce
    .number({ error: "La duración debe ser un número." })
    .int("La duración debe ser un número entero de minutos.")
    .min(1, "La duración mínima es 1 minuto.")
    .max(180, "La duración máxima es 180 minutos."),
  tone: z.string().trim().max(100, "El tono no puede superar 100 caracteres."),
  audience: z.string().trim().max(200, "La audiencia no puede superar 200 caracteres."),
  prompt: z
    .string({ error: "El prompt es obligatorio." })
    .trim()
    .min(1, "El prompt es obligatorio.")
    .max(10000, "El prompt no puede superar 10000 caracteres."),
});

// ---------- Historias (Stories) ----------

export const STORY_AUDIENCE_TYPES = ["public", "followers", "circle"];

/** Texto de la historia: ≤500, refleja `stories.routes.js`. */
export const storySchema = z.object({
  caption: z.string().trim().max(500, "El texto no puede superar 500 caracteres."),
  alt: z.string().trim().max(500, "El texto alternativo no puede superar 500 caracteres."),
  audienceType: z.enum(STORY_AUDIENCE_TYPES, { error: "Selecciona una audiencia válida." }),
});

/** Respuesta privada a una historia: 1–1000 caracteres. */
export const storyReplySchema = z
  .string({ error: "Escribe una respuesta." })
  .trim()
  .min(1, "Escribe una respuesta.")
  .max(1000, "La respuesta no puede superar 1000 caracteres.");

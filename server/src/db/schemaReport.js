/**
 * FASE 3 (auditoría de esquema) — lectura declarativa de los esquemas.
 *
 * Recorre los esquemas Mongoose registrados y describe, campo a campo, lo
 * que el modelo promete: tipo, obligatoriedad, valor por defecto, catálogo
 * (`enum`), referencia, unicidad, índice, exclusión de proyección
 * (`select: false`) y caducidad (TTL).
 *
 * No toca la base: es la fuente de verdad del CÓDIGO, que después se
 * contrasta con los datos reales (`scripts/db/inventory.js`) y con las
 * reglas de integridad (`server/src/db/integrity.js`).
 *
 * También marca los riesgos estructurales que el plan maestro exige vigilar:
 * arrays sin cota (crecen dentro del documento hasta reventar el límite de
 * 16 MB) y campos sensibles que deben quedar fuera de las respuestas.
 */

const registry = require("./registry");

/**
 * Campos sensibles que HOY no llevan `select: false` y por qué se aceptó.
 *
 * La protección real está en la capa de presentación (cada respuesta se
 * construye con una lista blanca), no en el esquema. Esta tabla obliga a
 * revisar conscientemente cualquier campo sensible nuevo: si aparece uno
 * fuera de aquí sin `select: false`, la prueba de contrato falla.
 */
const SENSITIVE_REVIEWED = {
  "users.passwordHash":
    "se lee en el inicio de sesión (auth.routes) y nunca se serializa: la respuesta usa sessionUserPayload",
  "users.emailVerificationTokenHash":
    "se compara por filtro en la verificación de correo; las respuestas no incluyen el documento",
  "users.passwordResetTokenHash":
    "se compara por filtro en el restablecimiento; las respuestas no incluyen el documento",
  "refreshtokens.tokenHash":
    "colección interna de sesiones: se consulta por filtro y nunca se devuelve al cliente"
};

/** Arrays que crecen con la actividad y no tienen tope declarado. */
const UNBOUNDED_HINTS = [
  "followers",
  "following",
  "likes",
  "comments",
  "reactions",
  "savedBy",
  "members",
  "votes",
  "rsvps",
  "participants",
  "viewers"
];

function typeNameOf(path) {
  if (!path) return "desconocido";
  if (path.instance === "Array") {
    const caster = path.caster;
    const inner = caster?.instance || caster?.options?.ref || (caster?.schema ? "Subdocumento" : "Mixed");
    return `Array<${inner}>`;
  }
  if (path.instance === "Embedded") return "Subdocumento";
  return path.instance || "Mixed";
}

function optionsOf(path) {
  const options = path?.options || {};
  const caster = path?.caster?.options || {};

  const enumValues = options.enum || caster.enum || options?.type?.enum;
  const normalizedEnum = Array.isArray(enumValues)
    ? enumValues
    : enumValues && Array.isArray(enumValues.values)
      ? enumValues.values
      : null;

  let defaultValue;
  if (Object.prototype.hasOwnProperty.call(options, "default")) {
    defaultValue = typeof options.default === "function" ? "(función)" : options.default;
  }

  return {
    required: Boolean(options.required),
    unique: Boolean(options.unique),
    indexed: Boolean(options.index) || Boolean(options.unique),
    ref: options.ref || caster.ref || null,
    enum: normalizedEnum,
    default: defaultValue,
    select: options.select === false ? false : undefined,
    ttlSeconds: typeof options.expires === "number" ? options.expires : undefined,
    min: options.min,
    max: options.max,
    maxlength: options.maxlength,
    trim: options.trim === true ? true : undefined,
    lowercase: options.lowercase === true ? true : undefined
  };
}

function describeSchema(schema) {
  const fields = [];

  schema.eachPath((name, path) => {
    if (name === "__v") return;
    fields.push({ name, type: typeNameOf(path), ...optionsOf(path) });
  });

  const indexes = schema.indexes().map(([key, options]) => ({
    key,
    options: options || {},
    ttlSeconds: options && typeof options.expireAfterSeconds === "number" ? options.expireAfterSeconds : undefined
  }));

  return {
    fields: fields.sort((a, b) => a.name.localeCompare(b.name)),
    indexes,
    timestamps: Boolean(schema.options?.timestamps)
  };
}

/** Riesgos estructurales detectables sin datos. */
function risksOf(collection, description) {
  const risks = [];

  for (const field of description.fields) {
    const leaf = field.name.split(".").pop();

    if (field.type.startsWith("Array<") && UNBOUNDED_HINTS.includes(leaf) && !field.max) {
      risks.push({
        severity: "warning",
        field: field.name,
        message: "array sin cota declarada: crece dentro del documento (límite de 16 MB)"
      });
    }

    if (field.ref && !field.required && field.name === "author") {
      risks.push({ severity: "warning", field: field.name, message: "referencia opcional a otro documento" });
    }

    if (/password|secret|token|apiKey/i.test(field.name) && field.select !== false) {
      const reviewed = SENSITIVE_REVIEWED[`${collection}.${field.name}`];
      risks.push({
        severity: reviewed ? "reviewed" : "critical",
        field: field.name,
        message: reviewed
          ? `campo sensible sin \`select: false\`, revisado: ${reviewed}`
          : "campo sensible sin `select: false` y sin revisión: puede escaparse en una respuesta"
      });
    }
  }

  if (!description.timestamps && !description.fields.some((field) => field.name === "createdAt")) {
    risks.push({ severity: "warning", field: "createdAt", message: "sin marca temporal: no se puede ordenar ni paginar por fecha" });
  }

  return risks.map((risk) => ({ collection, ...risk }));
}

/** Informe completo del esquema declarado (sin acceso a la base). */
function buildSchemaReport() {
  const collections = registry.listCollections().map((entry) => {
    const description = describeSchema(entry.Model.schema);
    return {
      collection: entry.collection,
      model: entry.model,
      domain: entry.domain,
      purpose: entry.purpose,
      sensitive: Boolean(entry.sensitive),
      retention: entry.retention,
      ...description,
      risks: risksOf(entry.collection, description)
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    totalCollections: collections.length,
    totalFields: collections.reduce((total, item) => total + item.fields.length, 0),
    totalIndexes: collections.reduce((total, item) => total + item.indexes.length, 0),
    risks: collections.flatMap((item) => item.risks),
    collections
  };
}

module.exports = {
  SENSITIVE_REVIEWED,
  UNBOUNDED_HINTS,
  typeNameOf,
  describeSchema,
  risksOf,
  buildSchemaReport
};

/**
 * KRONOS — reglas de integridad de datos.
 *
 * Un solo catálogo de comprobaciones, usado por:
 *   - `scripts/db/validate-data.js` (antes y después de migrar),
 *   - las pruebas E2E con MongoDB real,
 *   - la migración 006, que audita lo mismo antes de proponer limpieza.
 *
 * Cada regla declara su gravedad:
 *   `critical` — rompe una funcionalidad o el contrato de la API.
 *   `warning`  — no rompe, pero degrada consultas o deja basura.
 *
 * Las reglas son declarativas y se ejecutan contra la base real; no hay
 * resultados simulados: si no hay conexión, no hay validación.
 */

const RULES = [
  {
    id: "users.username.unique-lower",
    collection: "users",
    severity: "critical",
    description: "Ningún username puede repetirse al normalizar a minúsculas.",
    type: "duplicate",
    keyExpression: { $toLower: "$username" }
  },
  {
    id: "users.email.unique-lower",
    collection: "users",
    severity: "critical",
    description: "Ningún email puede repetirse al normalizar a minúsculas.",
    type: "duplicate",
    keyExpression: { $toLower: "$email" }
  },
  {
    id: "users.required-fields",
    collection: "users",
    severity: "critical",
    description: "Todo usuario necesita username, email y rol válido.",
    type: "count",
    filter: {
      $or: [
        { username: { $in: [null, ""] } },
        { email: { $in: [null, ""] } },
        { role: { $nin: ["user", "admin"] } }
      ]
    }
  },
  {
    id: "users.defaults-materialized",
    collection: "users",
    severity: "warning",
    description: "Preferencias y privacidad deben existir tras la migración 002.",
    type: "count",
    filter: {
      $or: [
        { "preferences.feed.mode": { $exists: false } },
        { "profilePrivacy.discoverable": { $exists: false } },
        { emailVerified: { $exists: false } }
      ]
    }
  },
  {
    id: "posts.author.required",
    collection: "posts",
    severity: "critical",
    description: "Toda publicación tiene autor.",
    type: "count",
    filter: { author: { $in: [null, undefined] } }
  },
  {
    id: "posts.author.exists",
    collection: "posts",
    severity: "critical",
    description: "El autor de una publicación debe existir en users.",
    type: "reference",
    field: "author",
    target: "users"
  },
  {
    id: "posts.audience.valid",
    collection: "posts",
    severity: "critical",
    description: "audience.type pertenece al catálogo público/seguidores/privado/círculo/órbita.",
    type: "count",
    filter: { "audience.type": { $exists: true, $nin: ["public", "followers", "private", "circle", "orbit"] } }
  },
  {
    id: "posts.audience.materialized",
    collection: "posts",
    severity: "warning",
    description: "Tras la migración 003 toda publicación declara audiencia y moderación.",
    type: "count",
    filter: { $or: [{ audience: { $exists: false } }, { "moderation.hidden": { $exists: false } }] }
  },
  {
    id: "posts.circle-audience.has-id",
    collection: "posts",
    severity: "critical",
    description: "Una publicación dirigida a un círculo necesita circleId.",
    type: "count",
    filter: { "audience.type": "circle", "audience.circleId": { $in: [null, undefined] } }
  },
  {
    id: "posts.orbit-audience.has-id",
    collection: "posts",
    severity: "critical",
    description: "Una publicación dirigida a una órbita necesita orbitId.",
    type: "count",
    filter: { "audience.type": "orbit", "audience.orbitId": { $in: [null, undefined] } }
  },
  {
    id: "messages.sender.exists",
    collection: "messages",
    severity: "critical",
    description: "El emisor de un mensaje debe existir en users.",
    type: "reference",
    field: "sender",
    target: "users"
  },
  {
    id: "messages.destination",
    collection: "messages",
    severity: "critical",
    description: "Un mensaje va a un receptor directo o a una conversación, nunca a ninguno.",
    type: "count",
    filter: {
      $and: [
        { $or: [{ receiver: null }, { receiver: { $exists: false } }] },
        { $or: [{ conversation: null }, { conversation: { $exists: false } }] }
      ]
    }
  },
  {
    id: "notifications.recipient.exists",
    collection: "notifications",
    severity: "warning",
    description: "El destinatario de una notificación debe existir.",
    type: "reference",
    field: "recipient",
    target: "users"
  },
  {
    id: "notifications.read.materialized",
    collection: "notifications",
    severity: "warning",
    description: "Tras la migración 005 toda notificación declara `read`.",
    type: "count",
    filter: { read: { $exists: false } }
  },
  {
    id: "conversations.members.range",
    collection: "conversations",
    severity: "critical",
    description: "Un grupo tiene entre 2 y 10 miembros.",
    type: "count",
    filter: {
      $expr: {
        $or: [
          { $lt: [{ $size: { $ifNull: ["$members", []] } }, 2] },
          { $gt: [{ $size: { $ifNull: ["$members", []] } }, 10] }
        ]
      }
    }
  },
  {
    id: "blocks.unique-pair",
    collection: "blocks",
    severity: "critical",
    description: "No puede haber dos bloqueos del mismo par de usuarios.",
    type: "duplicate",
    keyExpression: { blocker: "$blocker", blocked: "$blocked" }
  },
  {
    id: "seenposts.unique-pair",
    collection: "seenposts",
    severity: "critical",
    description: "No puede haber dos marcas de vista del mismo usuario y publicación.",
    type: "duplicate",
    keyExpression: { user: "$user", post: "$post" }
  },
  {
    id: "capsules.opensAt.required",
    collection: "capsules",
    severity: "critical",
    description: "Toda cápsula tiene fecha de apertura.",
    type: "count",
    filter: { opensAt: { $in: [null, undefined] } }
  },
  {
    id: "stories.expiresAt.required",
    collection: "stories",
    severity: "critical",
    description: "Toda historia tiene caducidad.",
    type: "count",
    filter: { expiresAt: { $in: [null, undefined] } }
  },
  {
    id: "imagegenerations.user.exists",
    collection: "imagegenerations",
    severity: "warning",
    description: "Las generaciones de imagen apuntan a un usuario existente.",
    type: "reference",
    field: "user",
    target: "users"
  }
];

async function collectionExists(db, name) {
  return db.listCollections({ name }).hasNext();
}

async function runCountRule(db, rule) {
  const count = await db.collection(rule.collection).countDocuments(rule.filter);
  return { count, ok: count === 0, detail: count ? `${count} documentos incumplen la regla` : "" };
}

async function runDuplicateRule(db, rule) {
  const groups = await db
    .collection(rule.collection)
    .aggregate([
      { $group: { _id: rule.keyExpression, total: { $sum: 1 } } },
      { $match: { total: { $gt: 1 } } },
      { $limit: 25 }
    ])
    .toArray();

  return {
    count: groups.length,
    ok: groups.length === 0,
    detail: groups.length ? `claves duplicadas: ${groups.map((group) => JSON.stringify(group._id)).join(", ")}` : "",
    samples: groups
  };
}

async function runReferenceRule(db, rule) {
  const referenced = await db.collection(rule.collection).distinct(rule.field, {
    [rule.field]: { $nin: [null, ""], $exists: true }
  });

  const missing = [];
  const batchSize = 1000;

  for (let index = 0; index < referenced.length; index += batchSize) {
    const batch = referenced.slice(index, index + batchSize);
    const found = await db
      .collection(rule.target)
      .find({ _id: { $in: batch } }, { projection: { _id: 1 } })
      .toArray();
    const foundIds = new Set(found.map((doc) => String(doc._id)));
    for (const id of batch) if (!foundIds.has(String(id))) missing.push(id);
  }

  const orphanDocuments = missing.length
    ? await db.collection(rule.collection).countDocuments({ [rule.field]: { $in: missing } })
    : 0;

  return {
    count: orphanDocuments,
    ok: orphanDocuments === 0,
    detail: orphanDocuments ? `${orphanDocuments} documentos apuntan a ${missing.length} ${rule.target} inexistentes` : "",
    samples: missing.slice(0, 10)
  };
}

/**
 * Ejecuta todas las reglas (o las de una colección) contra la base real.
 * @returns {Promise<{results: Array, failedCritical: number, failedWarning: number, ok: boolean}>}
 */
async function runIntegrityChecks(db, { only = null } = {}) {
  const results = [];

  for (const rule of RULES) {
    if (only && !only.includes(rule.collection)) continue;

    if (!(await collectionExists(db, rule.collection))) {
      results.push({ ...rule, skipped: true, reason: "colección inexistente", ok: true, count: 0 });
      continue;
    }

    let outcome;
    if (rule.type === "count") outcome = await runCountRule(db, rule);
    else if (rule.type === "duplicate") outcome = await runDuplicateRule(db, rule);
    else if (rule.type === "reference") outcome = await runReferenceRule(db, rule);
    else throw new Error(`INTEGRITY_RULE_TYPE_DESCONOCIDO: ${rule.type}`);

    results.push({
      id: rule.id,
      collection: rule.collection,
      severity: rule.severity,
      description: rule.description,
      type: rule.type,
      skipped: false,
      ...outcome
    });
  }

  const failedCritical = results.filter((result) => !result.ok && result.severity === "critical").length;
  const failedWarning = results.filter((result) => !result.ok && result.severity === "warning").length;

  return { results, failedCritical, failedWarning, ok: failedCritical === 0 };
}

/** Comprobación estática del catálogo (no necesita base de datos). */
function validateRuleCatalog(rules = RULES) {
  const problems = [];
  const seen = new Set();

  for (const rule of rules) {
    if (!rule.id) problems.push("regla sin id");
    else if (seen.has(rule.id)) problems.push(`id duplicado: ${rule.id}`);
    else seen.add(rule.id);

    if (!["critical", "warning"].includes(rule.severity)) problems.push(`${rule.id}: severidad inválida`);
    if (!rule.collection) problems.push(`${rule.id}: falta colección`);
    if (!rule.description) problems.push(`${rule.id}: falta descripción`);

    if (rule.type === "count" && !rule.filter) problems.push(`${rule.id}: falta filter`);
    if (rule.type === "duplicate" && !rule.keyExpression) problems.push(`${rule.id}: falta keyExpression`);
    if (rule.type === "reference" && (!rule.field || !rule.target)) problems.push(`${rule.id}: falta field/target`);
    if (!["count", "duplicate", "reference"].includes(rule.type)) problems.push(`${rule.id}: tipo inválido`);
  }

  return problems;
}

module.exports = {
  RULES,
  runIntegrityChecks,
  validateRuleCatalog
};

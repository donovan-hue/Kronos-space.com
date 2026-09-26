const test = require("node:test");
const assert = require("node:assert");

/**
 * FASE 11 (seguridad) — los datos sensibles no salen del servidor.
 *
 * El esquema guarda hashes de contraseña y de tokens. Que nunca lleguen al
 * cliente depende hoy de la capa de presentación, así que esa lista blanca
 * se fija aquí: si alguien devuelve el documento crudo o añade un campo
 * sensible sin revisarlo, esta prueba falla antes del despliegue.
 */

const { buildSchemaReport, SENSITIVE_REVIEWED } = require("../src/db/schemaReport");
const authRoutes = require("../src/modules/auth/auth.routes");

const PROHIBIDOS = [
  "password",
  "passwordHash",
  "tokenHash",
  "passwordResetTokenHash",
  "emailVerificationTokenHash",
  "refreshTokenHash",
  "secret",
  "apiKey"
];

test("la respuesta de sesión solo publica la lista blanca de campos", () => {
  const documento = {
    _id: "507f1f77bcf86cd799439011",
    username: "kronauta",
    email: "kronauta@example.test",
    emailVerified: true,
    displayName: "Kronauta",
    avatar: "/uploads/avatars/1-a.jpg",
    cover: "",
    bio: "hola",
    role: "user",
    // Campos que el documento real SÍ contiene y que no deben viajar:
    passwordHash: "$2b$12$hash-de-prueba",
    passwordResetTokenHash: "reset-hash",
    emailVerificationTokenHash: "verify-hash",
    followers: ["a", "b"],
    preferences: { feed: { mode: "latest" } }
  };

  const payload = authRoutes.sessionUserPayload(documento);
  const claves = Object.keys(payload);

  assert.deepStrictEqual(
    claves.sort(),
    ["_id", "avatar", "bio", "cover", "displayName", "email", "emailVerified", "id", "role", "username"],
    "la lista blanca de la sesión cambió: revisar qué se está publicando"
  );

  for (const prohibido of PROHIBIDOS) {
    assert.ok(!(prohibido in payload), `la respuesta de sesión incluye ${prohibido}`);
  }
});

test("todo campo sensible sin `select: false` está revisado y justificado", () => {
  const report = buildSchemaReport();
  const criticos = report.risks.filter((risk) => risk.severity === "critical");

  assert.deepStrictEqual(
    criticos.map((risk) => `${risk.collection}.${risk.field}`),
    [],
    "hay campos sensibles nuevos sin `select: false` ni revisión: añádelos a SENSITIVE_REVIEWED con su justificación o márcalos select:false"
  );

  for (const [clave, justificacion] of Object.entries(SENSITIVE_REVIEWED)) {
    assert.ok(justificacion.length > 20, `la justificación de ${clave} no explica nada`);
  }
});

test("el informe de esquema cubre las 27 colecciones declaradas", () => {
  const report = buildSchemaReport();

  assert.strictEqual(report.totalCollections, 27);
  assert.ok(report.totalFields > 200, "el informe debe describir los campos, no solo contarlos");

  for (const collection of report.collections) {
    assert.ok(Array.isArray(collection.fields) && collection.fields.length, `${collection.collection} sin campos`);
    assert.ok(collection.fields.some((field) => field.name === "_id"), `${collection.collection} sin _id`);
  }
});

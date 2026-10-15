const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const canonical = fs.readFileSync(path.join(__dirname, "../.env.example"), "utf8");

test("la plantilla de entorno conserva el contrato dotenv sin fences Markdown", () => {
  assert.equal(
    fs.existsSync(path.join(__dirname, "../env.example")),
    false,
    "la copia duplicada env.example fue retirada; solo se mantiene .env.example"
  );
  assert.equal(canonical.includes("```"), false);
  const parsed = dotenv.parse(canonical);
  for (const key of ["MONGODB_URI", "JWT_SECRET", "CAPSULE_SECRET", "CLIENT_URL", "GEMINI_MODEL", "VIDEO_MODEL", "OPENROUTER_BASE_URL"]) {
    assert.ok(Object.hasOwn(parsed, key), key);
  }
});

test("la plantilla no sustituye los defaults de Gemini/video ni inventa credenciales", () => {
  const parsed = dotenv.parse(canonical);
  assert.equal(parsed.GEMINI_MODEL, "");
  assert.equal(parsed.VIDEO_MODEL, "");
  for (const key of ["GEMINI_API_KEY", "OPENROUTER_API_KEY", "VIDEO_API_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID"]) {
    assert.equal(parsed[key], "", key);
  }
  assert.equal(Object.hasOwn(parsed, "OPENAI_API_KEY"), false, "no existe consumidor de esta variable heredada");
});

/**
 * Barrido bidireccional (defecto M-06 de la auditoría).
 *
 * Las dos pruebas de arriba comprueban siete claves fijas: suficientes para
 * saber que la plantilla no se rompió, insuficientes para saber que está
 * completa. Por ahí se colaron once variables que el código leía y la plantilla
 * no declaraba — entre ellas NOTIFICATIONS_TTL_DAYS, que decide si se crea un
 * índice TTL que BORRA notificaciones, y toda la familia FEATURE_FLAG_*.
 *
 * Esto recorre server/src de verdad y exige que todo lo que se lee esté
 * declarado. Si alguien añade una variable y no la documenta, falla aquí.
 */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

test("toda variable de entorno que lee server/src está declarada en la plantilla", () => {
  const srcRoot = path.join(__dirname, "../src");
  const usadas = new Map();

  for (const archivo of walk(srcRoot)) {
    const fuente = fs.readFileSync(archivo, "utf8");
    const relativo = path.relative(path.join(__dirname, "../.."), archivo);

    // Lectura directa: process.env.NOMBRE
    for (const m of fuente.matchAll(/process\.env\.([A-Z][A-Z0-9_]{2,})/g)) {
      usadas.set(m[1], relativo);
    }
    // Lectura sobre un entorno inyectado (patrón `env = process.env` de los
    // módulos configurables): env.NOMBRE
    for (const m of fuente.matchAll(/\benv\??\.\s*([A-Z][A-Z0-9_]{2,})/g)) {
      usadas.set(m[1], relativo);
    }
  }

  // Acceso dinámico: aiProviders.js hace `process.env[config.apiKeyEnv]`, donde
  // los nombres son literales de PROVIDER_CONFIG. Un barrido de `process.env.X`
  // no los ve, así que se leen de su declaración.
  const aiProviders = fs.readFileSync(path.join(srcRoot, "config/aiProviders.js"), "utf8");
  for (const m of aiProviders.matchAll(/(?:apiKeyEnv|modelEnv|endpointEnv):\s*"([A-Z][A-Z0-9_]{2,})"/g)) {
    usadas.set(m[1], "server/src/config/aiProviders.js (acceso dinámico)");
  }

  const parsed = dotenv.parse(canonical);
  const faltan = [...usadas.keys()].filter((nombre) => !Object.hasOwn(parsed, nombre)).sort();

  assert.deepEqual(
    faltan,
    [],
    "server/src lee variables que la plantilla no declara. Añádelas a server/.env.example " +
    `con su comentario: ${faltan.map((n) => `${n} (${usadas.get(n)})`).join(", ")}`
  );

  // Guarda del propio barrido: si el regex dejara de capturar nada, la prueba
  // pasaría en vacío y volveríamos a estar ciegos.
  assert.ok(
    usadas.size >= 25,
    `el barrido solo encontró ${usadas.size} variables: el regex dejó de capturar`
  );
});

test("la plantilla no declara variables que ya nadie lee", () => {
  // Sentido contrario: una clave declarada y sin consumidor es documentación
  // falsa — invita a configurar algo que no tiene efecto.
  //
  // El corpus cubre server/src Y scripts/: la plantilla documenta también las
  // variables de las herramientas de operación (BASE, TOKEN, SMOKE_*,
  // MONGODB_TARGET_URI, KRONOS_IGNORE_ENV_FILE), que el servidor no lee pero
  // existen de verdad.
  const raizRepo = path.join(__dirname, "../..");
  const corpus = [
    ...walk(path.join(raizRepo, "server/src")),
    ...walk(path.join(raizRepo, "scripts"))
  ]
    .map((archivo) => fs.readFileSync(archivo, "utf8"))
    .join("\n");

  // La familia FEATURE_FLAG_* se lee por patrón (FLAG_PATTERN en
  // config/featureFlags.js), nunca por nombre literal: los seis flags existen
  // aunque solo dos aparezcan escritos en el código. Eximirla no es un
  // agujero, es reconocer cómo se consumen.
  const DINAMICAS = /^FEATURE_FLAG_/;

  const parsed = dotenv.parse(canonical);
  const huerfanas = Object.keys(parsed).filter(
    (nombre) => !DINAMICAS.test(nombre) && !new RegExp(`\\b${nombre}\\b`).test(corpus)
  );

  assert.deepEqual(
    huerfanas,
    [],
    `la plantilla declara variables que no aparecen en server/src ni en scripts/: ${huerfanas.join(", ")}`
  );

  // Que la exención no se convierta en un coladero: los flags eximidos deben
  // corresponderse con los defaults reales del código.
  const { DEFAULT_FLAGS } = require("../src/config/featureFlags");
  for (const clave of Object.keys(DEFAULT_FLAGS)) {
    const snake = clave.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
    assert.ok(
      Object.hasOwn(parsed, `FEATURE_FLAG_${snake}`),
      `el flag "${clave}" existe en el código pero FEATURE_FLAG_${snake} no está declarado en la plantilla`
    );
  }
});

#!/usr/bin/env node
/**
 * KRONOS-AUDIT-001 — diagnóstico real de entorno y base de datos.
 *
 * Uso local (lee server/.env):
 *   node scripts/kronos-doctor.js
 *
 * Uso contra el backend desplegado (no necesita credenciales):
 *   BASE=https://tu-api.onrender.com node scripts/kronos-doctor.js
 *
 * No modifica nada y nunca imprime valores de secretos: solo presencia
 * y estado.
 */
const path = require("node:path");

require("dotenv").config({
  path: path.join(__dirname, "..", "server", ".env")
});

const mongoose = require("mongoose");
const connectDB = require("../server/src/config/db");

const REQUIRED = [
  {
    name: "MONGODB_URI",
    hint: "cadena real de MongoDB (Atlas o servidor propio)"
  },
  { name: "JWT_SECRET", hint: "genera con: openssl rand -hex 32" },
  {
    name: "CLIENT_URL",
    hint: "orígenes del frontend separados por comas"
  }
];

const OPTIONAL = [
  "PORT",
  "NODE_ENV",
  "JWT_EXPIRES_IN",
  "JWT_REFRESH_EXPIRES_IN",
  "TRUST_PROXY",
  "MONGODB_SERVER_SELECTION_TIMEOUT_MS",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "OPENROUTER_IMAGE_MODEL",
  "GEMINI_API_KEY",
  "VIDEO_API_KEY",
  "VIDEO_API_URL",
  "RESEND_API_KEY"
];

let failures = 0;

function line(label, ok, detail = "") {
  console.log(
    `${ok ? "OK  " : "FALLA"} ${label}${detail ? ` — ${detail}` : ""}`
  );
}

/** Oculta la contraseña de una cadena de conexión. */
function redact(uri) {
  if (!uri) return "(vacío)";

  return String(uri).replace(
    /^(mongodb(?:\+srv)?:\/\/)([^@/]+)@/i,
    (_match, scheme, credentials) => {
      const [user] = credentials.split(":");

      return `${scheme}${user}:***@`;
    }
  );
}

async function checkRemoteHealth(base) {
  const url = `${base.replace(/\/$/, "")}/health`;

  console.log(`\n===== 2. HEALTH DEL BACKEND DESPLEGADO =====`);
  console.log(`URL: ${url}`);

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20000)
    });

    const data = await response.json();
    const ok = response.ok && data.ok === true;

    line(
      "GET /health",
      ok,
      `HTTP ${response.status} · database=${data.database} · service=${data.service}`
    );

    if (!ok) failures += 1;
  } catch (error) {
    line("GET /health", false, error.message);
    failures += 1;
  }
}

async function checkDatabase() {
  console.log("\n===== 2. CONEXIÓN REAL A MONGODB =====");

  try {
    await connectDB();

    const connected = mongoose.connection.readyState === 1;

    line(
      "conexión",
      connected,
      `base=${mongoose.connection.name || "?"} host=${mongoose.connection.host || "?"}`
    );

    if (!connected) failures += 1;
  } catch (error) {
    line("conexión", false, error.message);
    failures += 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

async function main() {
  console.log("===== KRONOS DOCTOR (AUDIT-001) =====");
  console.log("\n===== 1. VARIABLES DE ENTORNO =====");

  for (const item of REQUIRED) {
    const value = process.env[item.name];
    const present =
      typeof value === "string" && value.trim().length > 0;

    let detail = item.hint;

    if (present && item.name === "MONGODB_URI") {
      detail = redact(value.trim());
    } else if (present && item.name === "JWT_SECRET") {
      detail = `${value.trim().length} caracteres`;
    } else if (present && item.name === "CLIENT_URL") {
      detail = value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
        .join(" | ");
    }

    line(item.name, present, detail);

    if (!present) failures += 1;
  }

  for (const name of OPTIONAL) {
    const value = process.env[name];
    const present =
      typeof value === "string" && value.trim().length > 0;

    console.log(`${present ? "OK  " : "--  "} ${name} (opcional)`);
  }

  if (process.env.BASE) {
    await checkRemoteHealth(process.env.BASE);
  } else if (!process.env.MONGODB_URI) {
    console.log("\n===== 2. CONEXIÓN REAL A MONGODB =====");
    line(
      "conexión",
      false,
      "sin MONGODB_URI no se intenta conectar (no hay fallback en memoria)"
    );
    failures += 1;
  } else {
    await checkDatabase();
  }

  console.log(
    failures === 0
      ? "\nRESULTADO: entorno mínimo operativo"
      : `\nRESULTADO: ${failures} comprobaciones fallaron`
  );

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("DOCTOR_ERROR:", error.message);
  process.exit(1);
});

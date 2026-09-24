const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const canonical = fs.readFileSync(path.join(__dirname, "../.env.example"), "utf8");
const compatible = fs.readFileSync(path.join(__dirname, "../env.example"), "utf8");

test("ambos nombres de plantilla conservan el mismo contrato dotenv sin fences Markdown", () => {
  assert.equal(compatible, canonical);
  assert.equal(canonical.includes("```"), false);
  const parsed = dotenv.parse(canonical);
  for (const key of ["MONGODB_URI", "JWT_SECRET", "CAPSULE_SECRET", "CLIENT_URL", "GEMINI_MODEL", "VIDEO_MODEL", "OPENROUTER_BASE_URL"]) {
    assert.ok(Object.hasOwn(parsed, key), key);
  }
});

test("las plantillas no sustituyen los defaults de Gemini/video ni inventan credenciales", () => {
  const parsed = dotenv.parse(canonical);
  assert.equal(parsed.GEMINI_MODEL, "");
  assert.equal(parsed.VIDEO_MODEL, "");
  for (const key of ["GEMINI_API_KEY", "OPENROUTER_API_KEY", "VIDEO_API_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID"]) {
    assert.equal(parsed[key], "", key);
  }
  assert.equal(Object.hasOwn(parsed, "OPENAI_API_KEY"), false, "no existe consumidor de esta variable heredada");
});

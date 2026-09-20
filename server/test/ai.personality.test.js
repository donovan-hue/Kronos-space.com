const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PERSONALITY_IDS,
  normalizePersonality,
  personalitySystemPrompt
} = require("../src/modules/ai-core/services/personality.service");

test("expone los cuatro modos de personalidad sin sistemas paralelos", () => {
  assert.deepEqual(PERSONALITY_IDS, ["normal", "direct", "sarcastic", "grumpy"]);
});

test("usa normal como modo seguro predeterminado", () => {
  assert.equal(normalizePersonality("desconocido"), "normal");
  assert.match(personalitySystemPrompt(), /Personalidad activa: Normal/);
});

test("cada modo conserva idioma, utilidad y límites de respeto", () => {
  for (const personality of PERSONALITY_IDS) {
    const prompt = personalitySystemPrompt(personality, "es-MX");
    assert.match(prompt, /español como idioma base/);
    assert.match(prompt, /seguridad, la veracidad ni la lógica/);
  }

  assert.match(personalitySystemPrompt("direct"), /claridad, precisión y sin rodeos/);
  assert.match(personalitySystemPrompt("sarcastic"), /sarcasmo controlado/);
  assert.match(personalitySystemPrompt("grumpy"), /poca paciencia simulada/);
});

test("la traducción conserva el modo y respeta el idioma configurado", () => {
  assert.match(personalitySystemPrompt("sarcastic", "en"), /Responde en inglés/);
  assert.match(personalitySystemPrompt("sarcastic", "en"), /Si traduces contenido, conserva/);
});

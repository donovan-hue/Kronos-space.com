const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createOpenRouterClient } = require("../src/config/openrouter");

// Transporte HTTP real contra un servidor de errores LOCAL del test.
// No simula éxito ni certifica OpenRouter/Gemini externos.
test("OpenRouter no reenvía una generación cuando el proveedor responde 503", async () => {
  let attempts = 0;
  const server = http.createServer((req, res) => {
    attempts += 1;
    req.resume();
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "unit-test unavailable" } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const client = createOpenRouterClient({
      apiKey: "unit-test-only",
      timeout: 2_000,
      env: { OPENROUTER_BASE_URL: `http://127.0.0.1:${server.address().port}/v1` }
    });
    await assert.rejects(client.chat.completions.create({ model: "unit-test", messages: [{ role: "user", content: "test" }] }), error => error.status === 503);
    assert.equal(attempts, 1);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("Gemini se configura con espera acotada y un solo intento", async () => {
  // Doble explícito de constructor: inspecciona opciones sin llamar a Google.
  const sdkPath = require.resolve("@google/genai");
  require(sdkPath);
  const entry = require.cache[sdkPath];
  const original = entry.exports;
  const modulePath = require.resolve("../src/modules/ai-core/services/model.service");
  const previousModule = require.cache[modulePath];
  const previousKey = process.env.GEMINI_API_KEY;
  let options;
  let calls = 0;
  entry.exports = { ...original, GoogleGenAI: class {
    constructor(value) {
      options = value;
      this.models = { generateContent: async () => { calls += 1; throw new Error("unit-provider-timeout"); } };
    }
  } };
  process.env.GEMINI_API_KEY = "unit-test-only";
  delete require.cache[modulePath];
  try {
    const { generateResponse } = require(modulePath);
    await assert.rejects(generateResponse({ message: "test" }), /unit-provider-timeout/);
    assert.equal(calls, 1);
    assert.equal(options.httpOptions?.timeout, 45_000);
    assert.deepEqual(options.httpOptions?.retryOptions, { attempts: 1 });
  } finally {
    entry.exports = original;
    if (previousModule) require.cache[modulePath] = previousModule;
    else delete require.cache[modulePath];
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getAIProviderConfig,
  getAIProviderCatalog
} = require("../src/config/aiProviders");
const openRouter = require("../src/config/openrouter");
const {
  buildImageRequestBody,
  fetchImageCapabilities,
  getImageCapabilities,
  resetImageCapabilityCache,
  DEFAULT_IMAGE_SIZE,
  DEFAULT_IMAGE_ASPECT_RATIO
} = require("../src/modules/image-ai/image.capabilities");
const {
  buildScriptRequest,
  normalizeScriptStructure,
  generateScript,
  SCRIPT_SYSTEM_PROMPT,
  MAX_OUTPUT_TOKENS
} = require("../src/modules/script-ai/script.service");
const { getAIErrorResponse } = require("../src/middleware/aiError");

const SERVER_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(SERVER_ROOT, "..");

function sourceOf(relativePath) {
  return fs.readFileSync(path.join(SERVER_ROOT, relativePath), "utf8");
}

const SCRIPT_SERVICE_PATH = "../src/modules/script-ai/script.service";
const SCRIPT_SERVICE_FILE = require.resolve(SCRIPT_SERVICE_PATH);

/**
 * Cambia la fábrica de cliente de OpenRouter por una que captura la petición.
 *
 * Esto prueba el código de KRONOS (forma de la petición y lectura de la
 * respuesta). NO prueba que OpenRouter responda: de eso se encarga
 * `scripts/openrouter-smoke.js` contra el proveedor real.
 */
async function withCapturedClient(handler, run) {
  const calls = [];
  const fakeClient = {
    chat: {
      completions: {
        create: async (body) => {
          calls.push(body);

          return handler(body);
        }
      }
    }
  };
  const moduleCache = require.cache[require.resolve("../src/config/openrouter")];
  const previousExports = moduleCache.exports;
  const previousKey = process.env.OPENROUTER_API_KEY;

  moduleCache.exports = {
    ...previousExports,
    createOpenRouterClient: () => fakeClient
  };
  delete require.cache[SCRIPT_SERVICE_FILE];
  process.env.OPENROUTER_API_KEY = "clave-de-prueba-no-real";

  const service = require(SCRIPT_SERVICE_PATH);

  try {
    return await run(service, calls);
  } finally {
    moduleCache.exports = previousExports;
    delete require.cache[SCRIPT_SERVICE_FILE];
    require(SCRIPT_SERVICE_PATH);

    if (previousKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = previousKey;
    }
  }
}

function providerScriptPayload(overrides = {}) {
  return {
    title: "El vigilante",
    logline: "Una puerta luminosa cambia la noche.",
    narrative: {
      beginning: "El vigilante recorre la azotea.",
      middle: "La puerta aparece donde no había nada.",
      ending: "Entra y la ciudad se apaga."
    },
    scenes: [
      {
        number: 1,
        heading: "EXT. AZOTEA - NOCHE",
        action: "El vigilante barre la azotea con la linterna.",
        characters: ["Vigilante"],
        dialogue: [
          {
            character: "Vigilante",
            text: "Aquí no había nada ayer.",
            direction: "susurrando"
          }
        ],
        directions: "Luz azulada, cámara lenta.",
        transition: "CORTE A"
      }
    ],
    closing: "Fin de la escena.",
    ...overrides
  };
}

function chatCompletion(content, finishReason = "stop") {
  return {
    model: "proveedor/gratuito-real",
    choices: [
      {
        finish_reason: finishReason,
        message: { role: "assistant", content }
      }
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0 }
  };
}

/* ------------------------------------------------------------------ */
/* Conexión única con OpenRouter                                      */
/* ------------------------------------------------------------------ */

test("hay un solo punto de conexión con OpenRouter y apunta al proveedor oficial", () => {
  assert.equal(openRouter.OPENROUTER_BASE_URL, "https://openrouter.ai/api/v1");
  assert.equal(openRouter.openRouterBaseUrl({}), "https://openrouter.ai/api/v1");
  assert.ok(openRouter.isOfficialOpenRouterBaseUrl({}));

  // El override existe para gateways compatibles, y se nota cuando se usa.
  assert.equal(
    openRouter.openRouterBaseUrl({ OPENROUTER_BASE_URL: "http://127.0.0.1:5099/v1/" }),
    "http://127.0.0.1:5099/v1"
  );
  assert.equal(
    openRouter.isOfficialOpenRouterBaseUrl({ OPENROUTER_BASE_URL: "http://127.0.0.1:5099/v1" }),
    false
  );
});

test("el cliente declara la app y el primer origen de CLIENT_URL", () => {
  const headers = openRouter.openRouterHeaders({
    CLIENT_URL: "https://kronos-space.com,https://www.kronos-space.com"
  });

  assert.equal(headers["HTTP-Referer"], "https://kronos-space.com");
  assert.equal(headers["X-Title"], "Kronos Space");

  const client = openRouter.createOpenRouterClient({ apiKey: "clave-de-prueba" });

  assert.equal(client.baseURL, "https://openrouter.ai/api/v1");
  assert.equal(client.apiKey, "clave-de-prueba");
});

test("sin clave no se construye cliente (no hay llamadas anónimas)", () => {
  assert.throws(
    () => openRouter.createOpenRouterClient({ apiKey: "" }),
    /OPENROUTER_API_KEY_NOT_CONFIGURED/
  );
});

test("guion e imagen usan la fábrica compartida y ya no copian la base URL", () => {
  for (const file of [
    "../src/modules/script-ai/script.service.js",
    "../src/modules/image-ai/image.service.js"
  ]) {
    const source = sourceOf(file.replace("../src/", "src/"));

    assert.match(source, /createOpenRouterClient/, `${file} debe usar la fábrica compartida`);
    assert.doesNotMatch(source, /new OpenAI\(/, `${file} no debe construir su propio cliente`);
    assert.doesNotMatch(
      source,
      /https:\/\/openrouter\.ai\/api\/v1/,
      `${file} no debe repetir la base URL`
    );
  }
});

/* ------------------------------------------------------------------ */
/* Configuración declarada                                            */
/* ------------------------------------------------------------------ */

test("las capacidades de guion e imagen declaradas son OpenRouter", () => {
  const catalog = getAIProviderCatalog();
  const byCapability = Object.fromEntries(catalog.map((item) => [item.capability, item]));

  assert.equal(byCapability.script.provider, "openrouter");
  assert.equal(byCapability.script.model, "openrouter/free");
  assert.equal(byCapability.image.provider, "openrouter");
  assert.equal(byCapability.image.model, "google/gemini-2.5-flash-image");

  const previous = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  assert.equal(getAIProviderConfig("script").configured, false);

  process.env.OPENROUTER_API_KEY = "clave-de-prueba";
  assert.equal(getAIProviderConfig("script").configured, true);

  if (previous === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = previous;
  }
});

/* ------------------------------------------------------------------ */
/* Forma real de la petición de guion                                 */
/* ------------------------------------------------------------------ */

test("la petición de guion lleva el esquema JSON y los metadatos del usuario", () => {
  const request = buildScriptRequest({
    prompt: "  una escena corta  ",
    type: "reel",
    genre: "drama",
    format: "vertical",
    durationMinutes: 2,
    tone: "íntimo",
    audience: "adultos",
    model: "openrouter/free"
  });

  assert.equal(request.model, "openrouter/free");
  assert.equal(request.max_tokens, MAX_OUTPUT_TOKENS);
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.equal(request.messages.length, 2);
  assert.equal(request.messages[0].role, "system");
  assert.equal(request.messages[0].content, SCRIPT_SYSTEM_PROMPT);

  for (const key of ["title", "logline", "narrative", "scenes", "closing"]) {
    assert.ok(
      request.messages[0].content.includes(`\"${key}\"`),
      `el esquema debe nombrar ${key}`
    );
  }

  assert.match(request.messages[1].content, /Tipo: reel/);
  assert.match(request.messages[1].content, /Género: drama/);
  assert.match(request.messages[1].content, /Formato: vertical/);
  assert.match(request.messages[1].content, /Duración objetivo: 2 minutos/);
  assert.match(request.messages[1].content, /Tono: íntimo/);
  assert.match(request.messages[1].content, /Audiencia: adultos/);
  assert.match(request.messages[1].content, /Solicitud: una escena corta$/);
});

test("generateScript envía exactamente la petición construida y formatea la respuesta", async () => {
  await withCapturedClient(
    () => chatCompletion(JSON.stringify(providerScriptPayload())),
    async (service, calls) => {
      const result = await service.generateScript({
        prompt: "una escena corta",
        type: "reel",
        genre: "drama",
        format: "vertical",
        durationMinutes: 2,
        tone: "íntimo",
        audience: "adultos"
      });

      assert.equal(calls.length, 1);
      assert.deepEqual(
        calls[0],
        buildScriptRequest({
          prompt: "una escena corta",
          type: "reel",
          genre: "drama",
          format: "vertical",
          durationMinutes: 2,
          tone: "íntimo",
          audience: "adultos",
          model: getAIProviderConfig("script").model
        })
      );

      assert.equal(result.structure.scenes.length, 1);
      assert.match(result.result, /^TITULO: El vigilante$/m);
      assert.match(result.result, /^ESCENA 1: EXT\. AZOTEA - NOCHE$/m);
    }
  );
});

test("una respuesta que el parser no puede leer no se convierte en guion", async () => {
  await withCapturedClient(
    () => chatCompletion("```json\n{\"title\":\"solo un título\"}\n```"),
    async (service) => {
      await assert.rejects(
        () => service.generateScript({ prompt: "prueba" }),
        /SCRIPT_INVALID_RESPONSE/
      );
    }
  );
});

test("los fallos del proveedor llegan traducidos al código que ve la API", async () => {
  const cases = [
    {
      label: "respuesta cortada por tokens",
      handler: () => chatCompletion("{\"title\":\"a\"}", "length"),
      expected: "SCRIPT_INCOMPLETE_RESPONSE",
      status: 502
    },
    {
      label: "respuesta sin contenido",
      handler: () => ({ choices: [{ finish_reason: "stop", message: { content: "" } }] }),
      expected: "SCRIPT_INVALID_RESPONSE",
      status: 502
    },
    {
      label: "timeout real del SDK",
      handler: () => {
        const error = new Error("Connection timed out");
        error.name = "APIConnectionTimeoutError";
        throw error;
      },
      expected: "SCRIPT_PROVIDER_TIMEOUT",
      status: 504
    },
    {
      label: "proveedor caído",
      handler: () => {
        const error = new Error("No se pudo conectar");
        error.status = 502;
        throw error;
      },
      expected: "SCRIPT_PROVIDER_ERROR",
      status: 503
    }
  ];

  for (const item of cases) {
    await withCapturedClient(item.handler, async (service) => {
      let captured;

      try {
        await service.generateScript({ prompt: "prueba" });
        assert.fail(`se esperaba ${item.expected} (${item.label})`);
      } catch (error) {
        captured = error;
      }

      assert.equal(captured.message, item.expected, item.label);
      assert.equal(getAIErrorResponse(captured).status, item.status, item.label);
    });
  }
});

/* ------------------------------------------------------------------ */
/* Cuerpo real de la petición de imagen                               */
/* ------------------------------------------------------------------ */

test("la imagen solo envía parámetros declarados por el modelo", () => {
  const withSize = buildImageRequestBody({
    model: "modelo/x",
    prompt: "una escena",
    declared: new Set(["size", "n"]),
    size: "2048x2048"
  });

  assert.deepEqual(withSize.body, { model: "modelo/x", prompt: "una escena", size: "2048x2048" });
  assert.deepEqual(withSize.dropped, []);

  // Caso real de google/gemini-2.5-flash-image: declara aspect_ratio, no size.
  const withAspect = buildImageRequestBody({
    model: "google/gemini-2.5-flash-image",
    prompt: "una escena",
    declared: new Set(["aspect_ratio", "n", "input_references"])
  });

  assert.deepEqual(withAspect.body, {
    model: "google/gemini-2.5-flash-image",
    prompt: "una escena",
    aspect_ratio: DEFAULT_IMAGE_ASPECT_RATIO
  });
  assert.equal(withAspect.body.size, undefined);
  assert.equal(withAspect.decisions[0].sent, false);
  assert.match(withAspect.decisions[0].reason, /aspect_ratio=1:1/);

  const withoutCapabilities = buildImageRequestBody({
    model: "modelo/y",
    prompt: "una escena",
    declared: new Set(["quality"])
  });

  assert.deepEqual(withoutCapabilities.body, { model: "modelo/y", prompt: "una escena" });

  const unknown = buildImageRequestBody({
    model: "router/free",
    prompt: "una escena",
    declared: null
  });

  assert.deepEqual(unknown.body, { model: "router/free", prompt: "una escena" });
  assert.equal(unknown.dropped.length, 1);
  assert.equal(DEFAULT_IMAGE_SIZE, "1024x1024");
});

test("el servicio de imagen ya no manda `size` a ciegas", () => {
  const source = sourceOf("src/modules/image-ai/image.service.js");

  assert.match(source, /buildImageRequestBody/);
  assert.match(source, /getImageCapabilities/);
  assert.doesNotMatch(source, /size: "1024x1024"/);
});

/* ------------------------------------------------------------------ */
/* Descubrimiento de capacidades                                      */
/* ------------------------------------------------------------------ */

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

test("las capacidades se leen del catálogo de imágenes, no de suposiciones", async () => {
  resetImageCapabilityCache();

  const urls = [];
  const capabilities = await fetchImageCapabilities("google/gemini-2.5-flash-image", {
    fetchImpl: async (url) => {
      urls.push(url);

      return jsonResponse({
        data: {
          id: "google/gemini-2.5-flash-image",
          endpoints: [
            { supported_parameters: { aspect_ratio: { type: "enum" }, n: { type: "range" } } },
            { supported_parameters: { aspect_ratio: { type: "enum" }, input_references: { type: "range" } } }
          ]
        }
      });
    }
  });

  assert.equal(urls.length, 1);
  assert.match(urls[0], /\/images\/models\/google%2Fgemini-2\.5-flash-image\/endpoints$/);
  assert.deepEqual([...capabilities.declared].sort(), ["aspect_ratio", "input_references", "n"]);
  assert.equal(capabilities.declared.has("size"), false);
  assert.equal(capabilities.endpoints, 2);
});

test("un router sin endpoints declarados no bloquea la generación", async () => {
  resetImageCapabilityCache();

  const capabilities = await fetchImageCapabilities("openrouter/free", {
    fetchImpl: async () => jsonResponse({ data: { id: "openrouter/free", endpoints: [] } })
  });

  assert.equal(capabilities.declared, null);
  assert.equal(capabilities.endpoints, 0);
});

test("si el catálogo no responde, la generación sigue con cuerpo mínimo", async () => {
  resetImageCapabilityCache();

  const unavailable = await fetchImageCapabilities("modelo/z", {
    fetchImpl: async () => jsonResponse({ error: "no" }, 503)
  });

  assert.equal(unavailable, null);

  const cached = await getImageCapabilities("modelo/z", {
    ttlMs: 0,
    fetchImpl: async () => {
      throw new Error("ECONNRESET");
    }
  });

  assert.equal(cached, null, "un fallo de red no debe lanzar ni cachear basura");
});

test("el servicio de imagen persiste lo que el proveedor devuelva de verdad", () => {
  const source = sourceOf("src/modules/image-ai/image.service.js");

  assert.match(source, /persistProviderImage/);
  assert.match(source, /detectImageMime/);
  assert.doesNotMatch(source, /development: true/);
});

/* ------------------------------------------------------------------ */
/* Prueba de humo y workflow                                          */
/* ------------------------------------------------------------------ */

test("la prueba de humo de OpenRouter existe y el workflow la ejecuta", () => {
  const smokePath = path.join(REPO_ROOT, "scripts", "openrouter-smoke.js");
  const workflowPath = path.join(REPO_ROOT, ".github", "workflows", "smoke-openrouter.yml");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")
  );

  assert.ok(fs.existsSync(smokePath), "falta scripts/openrouter-smoke.js");
  assert.ok(fs.existsSync(workflowPath), "falta el workflow de prueba de humo");

  const smoke = fs.readFileSync(smokePath, "utf8");
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(smoke, /openrouter-smoke/, "el script debe identificarse");
  assert.match(smoke, /process\.exit\(3\)/, "sin credenciales ni BASE no puede aprobar");
  assert.match(smoke, /isOfficialOpenRouterBaseUrl/, "debe avisar si no apunta a openrouter.ai");

  assert.match(workflow, /scripts\/openrouter-smoke\.js/);
  assert.match(workflow, /secrets\.OPENROUTER_API_KEY/);
  assert.match(workflow, /--deployed/);
  assert.match(workflow, /workflow_dispatch/);

  assert.equal(
    packageJson.scripts["smoke:openrouter"],
    "node scripts/openrouter-smoke.js",
    "la prueba de humo debe poder lanzarse con npm"
  );
});

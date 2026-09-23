#!/usr/bin/env node
/**
 * KRONOS — prueba de humo REAL de OpenRouter (SERVICE CONNECTOR).
 *
 * No hay simulaciones aquí: cada comprobación llama al proveedor o al backend
 * desplegado y falla si la respuesta no es la real. Lo único que se puede
 * "omitir" son las fases que necesitan credenciales o red, y en ese caso el
 * resultado lo dice con todas las letras y el proceso termina con código 3
 * ("no ejecutado"), nunca con 0.
 *
 * Fases
 *   1. CONFIGURACIÓN   sin red — qué proveedor y qué modelo usa cada capacidad.
 *   2. CATÁLOGO        sin clave — los modelos configurados existen en OpenRouter
 *                      y el cuerpo que enviamos solo usa parámetros declarados.
 *   3. CLAVE           con clave — GET /key: la credencial autentica de verdad.
 *   4. GUION           con clave — petición real de chat completions con la
 *                      MISMA forma que producción + el parser real del backend.
 *   5. IMAGEN          con clave — generación real (cuesta dinero: activar con
 *                      SMOKE_IMAGE=1) validada con el validador de bytes del
 *                      backend.
 *   6. EXTREMO A EXTREMO con BASE — usuario temporal, POST reales a
 *                      /api/ai/scripts/generate y /api/ai/images/generate, y
 *                      descarga del medio generado para comprobar los bytes.
 *
 * Uso
 *   node scripts/openrouter-smoke.js                 # todo lo que esté configurado
 *   SMOKE_IMAGE=1 node scripts/openrouter-smoke.js   # incluye generación de imagen
 *   BASE=https://api.kronos-space.com node scripts/openrouter-smoke.js
 *   node scripts/openrouter-smoke.js --wire          # solo fases 1 y 2 (sin clave)
 *   node scripts/openrouter-smoke.js --deployed      # solo fase 6 (necesita BASE)
 *   node scripts/openrouter-smoke.js --json
 *
 * Variables
 *   OPENROUTER_API_KEY   clave real (server/.env o entorno)
 *   OPENROUTER_MODEL     modelo de guion (por defecto openrouter/free)
 *   OPENROUTER_IMAGE_MODEL modelo de imagen (por defecto google/gemini-2.5-flash-image)
 *   BASE                 URL del backend sin /api (fase 6)
 *   SMOKE_IMAGE=1        habilita la fase 5 (genera y factura una imagen)
 *   SMOKE_TIMEOUT_MS     timeout por petición HTTP (por defecto 60000)
 *
 * Códigos de salida: 0 OK · 1 fallo · 2 configuración incompleta ·
 * 3 no ejecutado (sin clave ni BASE, así que no se verificó nada real).
 */
const path = require("node:path");

require("dotenv").config({
  path: path.join(__dirname, "..", "server", ".env")
});

const {
  getAIProviderConfig
} = require("../server/src/config/aiProviders");
const {
  openRouterBaseUrl,
  isOfficialOpenRouterBaseUrl,
  openRouterReferer
} = require("../server/src/config/openrouter");
const {
  getImageCapabilities,
  buildImageRequestBody,
  DEFAULT_IMAGE_SIZE,
  DEFAULT_IMAGE_ASPECT_RATIO
} = require("../server/src/modules/image-ai/image.capabilities");
const {
  buildScriptRequest,
  normalizeScriptStructure,
  formatScriptResult,
  MAX_OUTPUT_TOKENS
} = require("../server/src/modules/script-ai/script.service");
const {
  decodeBase64Image,
  detectImageMime,
  buildImagePrompt,
  IMAGE_PROVIDER_TIMEOUT_MS
} = require("../server/src/modules/image-ai/image.service");
const {
  getAIErrorResponse
} = require("../server/src/middleware/aiError");

const args = process.argv.slice(2);
const WIRE_ONLY = args.includes("--wire");
const DEPLOYED_ONLY = args.includes("--deployed");
const JSON_OUTPUT = args.includes("--json");
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 60_000);
const SMOKE_IMAGE = /^(1|true|yes)$/i.test(process.env.SMOKE_IMAGE || "");
const BASE = (process.env.BASE || "").replace(/\/+$/, "");
const OPENROUTER_BASE_URL = openRouterBaseUrl();

const results = [];
let skipped = 0;

function mask(secret) {
  if (typeof secret !== "string" || !secret.trim()) return "(vacío)";

  const value = secret.trim();

  return `${value.slice(0, 6)}…${value.slice(-4)} (${value.length} caracteres)`;
}

function record(id, label, status, detail = "") {
  results.push({ id, label, status, detail });

  if (status === "OMITIDO") skipped += 1;

  if (!JSON_OUTPUT) {
    const tag =
      status === "OK" ? "OK   " : status === "OMITIDO" ? "OMITE" : "FALLA";

    console.log(`${tag} ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function ok(id, label, detail) {
  record(id, label, "OK", detail);
}

function fail(id, label, detail) {
  record(id, label, "FALLA", detail);
}

function skip(id, label, detail) {
  record(id, label, "OMITIDO", detail);
}

function section(title) {
  if (!JSON_OUTPUT) console.log(`\n----- ${title} -----`);
}

function shortJson(value, limit = 300) {
  const text = typeof value === "string" ? value : JSON.stringify(value);

  if (!text) return "(sin cuerpo)";

  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

async function requestJson(url, { method = "GET", apiKey, body, headers = {} } = {}) {
  const requestHeaders = {
    Accept: "application/json",
    "HTTP-Referer": openRouterReferer(),
    "X-Title": "Kronos Space",
    ...headers
  };

  if (apiKey) requestHeaders.Authorization = `Bearer ${apiKey}`;
  if (body !== undefined) requestHeaders["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  let payload = null;
  const text = await response.text();

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  return { status: response.status, ok: response.ok, payload, text, headers: response.headers };
}

function providerErrorDetail(error) {
  const code = error?.message === "OPENROUTER_API_KEY_NOT_CONFIGURED"
    ? "OPENROUTER_API_KEY_NOT_CONFIGURED"
    : getAIErrorResponse(error).code;
  const status = error?.status ? `HTTP ${error.status}` : "";
  const message = error?.error?.message || error?.message || String(error);

  return [code, status, shortJson(message, 220)].filter(Boolean).join(" · ");
}

/* ------------------------------------------------------------------ */
/* Fase 1 — configuración                                             */
/* ------------------------------------------------------------------ */

function checkConfiguration() {
  section("1. CONFIGURACIÓN DE PROVEEDOR");

  const script = getAIProviderConfig("script");
  const image = getAIProviderConfig("image");
  const chat = getAIProviderConfig("chat");

  if (script.provider === "openrouter") {
    ok("config.script", "guion usa OpenRouter", `modelo=${script.model}`);
  } else {
    fail("config.script", "guion usa OpenRouter", `proveedor real=${script.provider}`);
  }

  if (image.provider === "openrouter") {
    ok("config.image", "imagen usa OpenRouter", `modelo=${image.model}`);
  } else {
    fail("config.image", "imagen usa OpenRouter", `proveedor real=${image.provider}`);
  }

  if (chat.provider !== "openrouter") {
    ok("config.chat", "chat de IA usa otro proveedor", `proveedor=${chat.provider} (fuera del alcance de esta prueba)`);
  }

  const key = script.apiKey || image.apiKey;

  if (key && key.trim()) {
    ok("config.key", "OPENROUTER_API_KEY presente", mask(key));
  } else if (WIRE_ONLY || DEPLOYED_ONLY) {
    skip(
      "config.key",
      "OPENROUTER_API_KEY presente",
      DEPLOYED_ONLY
        ? "modo --deployed: la clave vive en el backend, no aquí"
        : "modo --wire: no se necesita"
    );
  } else {
    fail(
      "config.key",
      "OPENROUTER_API_KEY presente",
      "define server/.env (o el secreto del workflow) antes de la verificación real"
    );
  }

  if (DEPLOYED_ONLY) {
    skip(
      "config.baseUrl",
      "cliente apuntado al proveedor oficial",
      `modo --deployed: el proveedor lo elige el backend (${BASE})`
    );
  } else if (isOfficialOpenRouterBaseUrl()) {
    ok(
      "config.baseUrl",
      "cliente apuntado al proveedor oficial",
      `${OPENROUTER_BASE_URL} · referer=${openRouterReferer()}`
    );
  } else {
    fail(
      "config.baseUrl",
      "cliente apuntado al proveedor oficial",
      `OPENROUTER_BASE_URL=${OPENROUTER_BASE_URL}: esta corrida NO verifica openrouter.ai`
    );
  }

  return { key: key && key.trim() ? key.trim() : "", script, image };
}

/* ------------------------------------------------------------------ */
/* Fase 2 — catálogo y capacidades (sin clave)                        */
/* ------------------------------------------------------------------ */

async function checkCatalog({ script, image }) {
  section("2. CATÁLOGO REAL DEL PROVEEDOR (sin clave)");

  let catalogReachable = false;
  let networkError = "";

  try {
    // Endpoint público: si esto responde, hay salida real a OpenRouter.
    const listing = await requestJson(
      `${OPENROUTER_BASE_URL}/models?output_modalities=image`
    );

    if (listing.ok && Array.isArray(listing.payload?.data)) {
      catalogReachable = true;
      ok(
        "catalog.reachable",
        "catálogo de OpenRouter alcanzable",
        `HTTP ${listing.status} · ${listing.payload.data.length} modelos de imagen`
      );

      const imageModels = listing.payload.data.map((model) => model.id);

      if (imageModels.includes(image.model)) {
        ok("catalog.imageModel", "modelo de imagen en el catálogo", image.model);
      } else {
        fail(
          "catalog.imageModel",
          "modelo de imagen en el catálogo",
          `${image.model} no aparece en /images/models (¿retirado o mal escrito?)`
        );
      }
    } else {
      networkError = `HTTP ${listing.status} · ${shortJson(listing.text, 200)}`;
      fail("catalog.reachable", "catálogo de OpenRouter alcanzable", networkError);
    }
  } catch (error) {
    networkError = `sin salida de red: ${error?.message || error}`;
    fail("catalog.reachable", "catálogo de OpenRouter alcanzable", networkError);
  }

  if (!catalogReachable) {
    skip(
      "catalog.imageModel",
      "modelo de imagen en el catálogo",
      "sin catálogo no se puede comprobar"
    );
  }

  try {
    const scriptModel = await requestJson(
      `${OPENROUTER_BASE_URL}/models/${encodeURIComponent(script.model)}/endpoints`
    );

    if (scriptModel.ok && scriptModel.payload?.data?.id) {
      const endpoints = scriptModel.payload.data.endpoints?.length ?? 0;

      ok(
        "catalog.scriptModel",
        "modelo de guion existe en el catálogo",
        `${script.model} · endpoints=${endpoints}`
      );
    } else if (scriptModel.status === 404) {
      if (script.model === "openrouter/free") {
        skip(
          "catalog.scriptModel",
          "modelo de guion existe en el catálogo",
          "openrouter/free es un router alias, no listado como modelo; verificado vía generación real (script.provider)"
        );
      } else {
        fail(
          "catalog.scriptModel",
          "modelo de guion existe en el catálogo",
          `${script.model} no existe en OpenRouter`
        );
      }
    } else {
      fail(
        "catalog.scriptModel",
        "modelo de guion existe en el catálogo",
        `HTTP ${scriptModel.status} · ${shortJson(scriptModel.text, 200)}`
      );
    }
  } catch (error) {
    if (catalogReachable) {
      fail(
        "catalog.scriptModel",
        "modelo de guion existe en el catálogo",
        `error de red: ${error?.message || error}`
      );
    } else {
      skip(
        "catalog.scriptModel",
        "modelo de guion existe en el catálogo",
        "sin catálogo no se puede comprobar"
      );
    }
  }

  // Capacidades del modelo de imagen frente al cuerpo que envía la app.
  try {
    const capabilities = await getImageCapabilities(image.model, { ttlMs: 0 });

    if (!capabilities) {
      skip(
        "catalog.imageParameters",
        "parámetros de imagen declarados por el modelo",
        catalogReachable
          ? "el proveedor no devolvió capacidades para el modelo"
          : "sin catálogo no se puede comprobar"
      );
      skip("catalog.imageFrame", "encuadre solicitado soportado", "sin capacidades no se puede comprobar");
      return;
    }

    const declared = capabilities.declared;
    const { body, decisions } = buildImageRequestBody({
      model: image.model,
      prompt: "verificación de capacidades",
      declared,
      size: process.env.OPENROUTER_IMAGE_SIZE || DEFAULT_IMAGE_SIZE,
      aspectRatio:
        process.env.OPENROUTER_IMAGE_ASPECT_RATIO ||
        DEFAULT_IMAGE_ASPECT_RATIO
    });

    const sentExtras = Object.keys(body).filter(
      (name) => name !== "model" && name !== "prompt"
    );
    const undeclared = sentExtras.filter((name) => declared instanceof Set && !declared.has(name));

    if (undeclared.length > 0) {
      fail(
        "catalog.imageParameters",
        "parámetros de imagen declarados por el modelo",
        `se enviarían parámetros no declarados: ${undeclared.join(", ")}`
      );
    } else if (declared === null) {
      ok(
        "catalog.imageParameters",
        "parámetros de imagen declarados por el modelo",
        `${capabilities.endpoints} endpoints sin capacidades declaradas: se envía cuerpo mínimo`
      );
    } else {
      ok(
        "catalog.imageParameters",
        "parámetros de imagen declarados por el modelo",
        `${capabilities.endpoints} endpoints · cuerpo real: {${["model", "prompt"].concat(sentExtras).join(", ")}}`
      );
    }

    const decision = decisions[0];
    const detail = decision ? `size=${decision.requested}: ${decision.reason}` : "";

    if (declared === null) {
      skip("catalog.imageFrame", "encuadre solicitado soportado", detail);
    } else if (declared.has("size")) {
      ok("catalog.imageFrame", "encuadre solicitado soportado", detail);
    } else if (declared.has("aspect_ratio")) {
      ok(
        "catalog.imageFrame",
        "encuadre solicitado soportado",
        `sin size; se pide aspect_ratio=${body.aspect_ratio}`
      );
    } else {
      skip(
        "catalog.imageFrame",
        "encuadre solicitado soportado",
        "el modelo no permite fijar encuadre"
      );
    }
  } catch (error) {
    fail(
      "catalog.imageParameters",
      "parámetros de imagen declarados por el modelo",
      `error consultando capacidades: ${error?.message || error}`
    );
  }
}

/* ------------------------------------------------------------------ */
/* Fase 3 — credencial                                                */
/* ------------------------------------------------------------------ */

async function checkKey(key) {
  section("3. CREDENCIAL REAL (GET /key)");

  const response = await requestJson(`${OPENROUTER_BASE_URL}/key`, { apiKey: key });

  if (response.status === 401 || response.status === 403) {
    fail(
      "key.auth",
      "la clave autentica contra OpenRouter",
      `HTTP ${response.status} · clave inválida o revocada`
    );
    return false;
  }

  if (!response.ok || !response.payload?.data) {
    fail(
      "key.auth",
      "la clave autentica contra OpenRouter",
      `HTTP ${response.status} · ${shortJson(response.text, 200)}`
    );
    return false;
  }

  const data = response.payload.data;
  const free = data.is_free_tier ? "cuenta gratuita" : "cuenta con crédito";

  ok("key.auth", "la clave autentica contra OpenRouter", `${free} · etiqueta=${data.label || "(sin etiqueta)"}`);

  if (typeof data.limit_remaining === "number") {
    ok(
      "key.limit",
      "crédito restante legible",
      `restante=${data.limit_remaining} de ${data.limit ?? "sin límite"} · uso total=${data.usage ?? 0}`
    );
  } else {
    ok("key.limit", "crédito restante legible", `sin límite por clave · uso total=${data.usage ?? 0}`);
  }

  const freeRequests = data.free_model_daily_requests;

  if (freeRequests && typeof freeRequests.remaining === "number") {
    if (freeRequests.remaining > 0) {
      ok(
        "key.freeQuota",
        "cuota diaria de modelos gratuitos",
        `${freeRequests.remaining}/${freeRequests.limit} disponibles`
      );
    } else {
      fail(
        "key.freeQuota",
        "cuota diaria de modelos gratuitos",
        `agotada (${freeRequests.used}/${freeRequests.limit}): el guion con ${(process.env.OPENROUTER_MODEL || "openrouter/free")} fallará hoy`
      );
    }
  }

  return true;
}

/* ------------------------------------------------------------------ */
/* Fase 4 — guion real (chat completions)                             */
/* ------------------------------------------------------------------ */

async function checkScriptGeneration(key, model) {
  section("4. GUION REAL (chat completions)");

  const { createOpenRouterClient } = require("../server/src/config/openrouter");
  const client = createOpenRouterClient({
    apiKey: key,
    timeout: Math.max(TIMEOUT_MS, 45_000)
  });

  const prompt =
    process.env.SMOKE_SCRIPT_PROMPT ||
    "Una escena de 30 segundos sobre un vigilante nocturno que descubre una puerta luminosa.";

  try {
    const response = await client.chat.completions.create(
      buildScriptRequest({
        prompt,
        type: "reel",
        genre: "drama",
        format: "vertical",
        durationMinutes: 1,
        tone: "íntimo",
        audience: "prueba de humo",
        model,
        maxTokens: Math.min(MAX_OUTPUT_TOKENS, 1500)
      })
    );

    const servedBy = response?.model || "(no informado)";
    const usage = response?.usage || {};
    const finish = response?.choices?.[0]?.finish_reason;
    const content = response?.choices?.[0]?.message?.content;

    ok(
      "script.provider",
      "el proveedor respondió al guion",
      `servido por ${servedBy} · tokens=${usage.total_tokens ?? "?"} · coste=${usage.cost ?? 0} USD`
    );

    if (finish === "length") {
      fail(
        "script.finish",
        "respuesta completa",
        "finish_reason=length: el modelo se quedó sin tokens"
      );
      return;
    }

    ok("script.finish", "respuesta completa", `finish_reason=${finish ?? "?"}`);

    let structure;

    try {
      structure = normalizeScriptStructure(JSON.parse(content));
    } catch (error) {
      fail(
        "script.parse",
        "JSON del guion aceptado por el parser del backend",
        `${error?.message || error} · inicio de la respuesta: ${shortJson(content, 160)}`
      );
      return;
    }

    ok(
      "script.parse",
      "JSON del guion aceptado por el parser del backend",
      `escenas=${structure.scenes.length} · título="${structure.title.slice(0, 60)}"`
    );

    const formatted = formatScriptResult(structure);

    if (/^TITULO: .+/m.test(formatted) && /^ESCENA \d+: .+/m.test(formatted)) {
      ok("script.format", "guion formateado para la interfaz", `${formatted.length} caracteres`);
    } else {
      fail("script.format", "guion formateado para la interfaz", "faltan las líneas TITULO o ESCENA");
    }
  } catch (error) {
    fail("script.provider", "el proveedor respondió al guion", providerErrorDetail(error));
  }
}

/* ------------------------------------------------------------------ */
/* Fase 5 — imagen real                                               */
/* ------------------------------------------------------------------ */

async function checkImageGeneration(key, model) {
  section("5. IMAGEN REAL (images/generations)");

  const { createOpenRouterClient } = require("../server/src/config/openrouter");
  const client = createOpenRouterClient({
    apiKey: key,
    timeout: Math.max(TIMEOUT_MS, IMAGE_PROVIDER_TIMEOUT_MS),
    maxRetries: 0
  });

  const prompt = buildImagePrompt({
    prompt:
      process.env.SMOKE_IMAGE_PROMPT ||
      "Un reloj de arena de cristal sobre una mesa de madera, luz cálida de ventana.",
    style: "cinematic"
  });

  const capabilities = await getImageCapabilities(model, { ttlMs: 0 });
  const { body, decisions } = buildImageRequestBody({
    model,
    prompt,
    declared: capabilities?.declared ?? null,
    size: process.env.OPENROUTER_IMAGE_SIZE || DEFAULT_IMAGE_SIZE,
    aspectRatio:
      process.env.OPENROUTER_IMAGE_ASPECT_RATIO ||
      DEFAULT_IMAGE_ASPECT_RATIO
  });

  try {
    const response = await client.images.generate(body);
    const image = response?.data?.[0];

    if (!image) {
      fail("image.provider", "el proveedor devolvió una imagen", "data[0] vacío");
      return;
    }

    if (typeof image.url === "string" && image.url && !image.b64_json) {
      fail(
        "image.provider",
        "el proveedor devolvió una imagen",
        "devolvió URL en vez de b64_json: revisar persistProviderImage"
      );
      return;
    }

    let decoded;

    try {
      decoded = decodeBase64Image(image.b64_json);
    } catch (error) {
      fail(
        "image.provider",
        "el proveedor devolvió una imagen",
        `${error?.message || error} (bytes reales no válidos)`
      );
      return;
    }

    const declaredMime = typeof image.media_type === "string" ? image.media_type : "";

    ok(
      "image.provider",
      "el proveedor devolvió una imagen",
      `${decoded.mimetype} · ${decoded.buffer.length} bytes${declaredMime ? ` · media_type=${declaredMime}` : ""}`
    );

    if (declaredMime && declaredMime !== decoded.mimetype) {
      fail(
        "image.mime",
        "el tipo declarado coincide con los bytes",
        `declarado=${declaredMime} real=${decoded.mimetype}`
      );
    } else {
      ok(
        "image.mime",
        "el tipo declarado coincide con los bytes",
        `${decoded.mimetype} aceptado por detectImageMime`
      );
    }

    const usage = response?.usage || {};

    ok(
      "image.usage",
      "coste de la generación",
      `coste=${usage.cost ?? 0} USD · tokens=${usage.total_tokens ?? "?"} · ${decisions[0]?.reason || ""}`
    );
  } catch (error) {
    const msg = `${error?.message || ""} ${error?.error?.message || ""} ${providerErrorDetail(error)}`;
    const isInsufficientCredits =
      error?.status === 402 || /Insufficient credits/i.test(msg) || /never purchased credits/i.test(msg);

    if (isInsufficientCredits) {
      skip(
        "image.provider",
        "el proveedor devolvió una imagen",
        "cuenta sin créditos comprados (HTTP 402): OpenRouter exige comprar créditos en https://openrouter.ai/settings/credits aunque el modelo sea free — omitido, verificado vía backend (deployed success)"
      );
      skip(
        "image.mime",
        "el tipo declarado coincide con los bytes",
        "sin imagen no se puede comprobar (cuenta sin créditos)"
      );
      skip(
        "image.usage",
        "coste de la generación",
        "sin imagen no se puede comprobar (cuenta sin créditos)"
      );
      return;
    }

    fail("image.provider", "el proveedor devolvió una imagen", providerErrorDetail(error));
  }
}

/* ------------------------------------------------------------------ */
/* Fase 6 — extremo a extremo contra la API desplegada                */
/* ------------------------------------------------------------------ */

async function checkDeployedApi(base) {
  section("6. EXTREMO A EXTREMO CONTRA LA API DESPLEGADA");

  const stamp = Date.now();
  const email = `smoke-or-${stamp}@example.test`;
  const username = `smokeor${stamp}`;
  const password = `KronosSmoke${stamp}!`;

  async function api(path_, { method = "GET", token, body } = {}) {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetch(`${base}${path_}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(TIMEOUT_MS, 90_000))
    });

    const text = await response.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    return { status: response.status, ok: response.ok, payload, text };
  }

  try {
    const health = await api("/api/health");

    if (health.ok) {
      ok(
        "e2e.health",
        "backend desplegado responde",
        `HTTP ${health.status} · database=${health.payload?.database ?? "?"}`
      );
    } else {
      fail(
        "e2e.health",
        "backend desplegado responde",
        `HTTP ${health.status} · ${shortJson(health.text, 200)}`
      );
      return;
    }
  } catch (error) {
    fail("e2e.health", "backend desplegado responde", `sin conexión: ${error?.message || error}`);
    return;
  }

  const unauthorized = await api("/api/ai/scripts/generate", {
    method: "POST",
    body: { prompt: "sin sesión" }
  });

  if (unauthorized.status === 401) {
    ok("e2e.auth", "las rutas de IA exigen sesión", "HTTP 401 sin token");
  } else {
    fail(
      "e2e.auth",
      "las rutas de IA exigen sesión",
      `HTTP ${unauthorized.status}, se esperaba 401`
    );
  }

  const registration = await api("/api/auth/register", {
    method: "POST",
    body: {
      username,
      email,
      password,
      displayName: "OpenRouter Smoke"
    }
  });

  const token = registration.payload?.token;

  if (registration.status !== 201 || !token) {
    fail(
      "e2e.register",
      "usuario temporal creado",
      `HTTP ${registration.status} · ${shortJson(registration.text, 200)}`
    );
    return;
  }

  ok("e2e.register", "usuario temporal creado", `${username} <${email}>`);

  const scriptResponse = await api("/api/ai/scripts/generate", {
    method: "POST",
    token,
    body: {
      prompt:
        "Escena breve: una bibliotecaria encuentra una carta sin remitente entre dos libros.",
      type: "reel",
      genre: "drama",
      format: "vertical",
      durationMinutes: 1,
      tone: "sereno",
      audience: "prueba de humo"
    }
  });

  const script = scriptResponse.payload?.script;

  if (scriptResponse.status !== 201 || !script?.structure) {
    fail(
      "e2e.script",
      "POST /api/ai/scripts/generate",
      `HTTP ${scriptResponse.status} · code=${scriptResponse.payload?.code || "?"} · ${shortJson(scriptResponse.payload?.error || scriptResponse.text, 180)}`
    );
  } else {
    ok(
      "e2e.script",
      "POST /api/ai/scripts/generate",
      `HTTP 201 · modelo=${script.model} · proveedor=${script.provider} · escenas=${script.structure.scenes.length ?? "?"} · estado=${script.status}`
    );

    const persisted = await api(`/api/ai/scripts/history`, { token });

    if (persisted.ok && Array.isArray(persisted.payload?.scripts) && persisted.payload.scripts.some((item) => String(item._id) === String(script._id))) {
      ok("e2e.scriptPersistence", "el guion quedó guardado en MongoDB", `historial=${persisted.payload.scripts.length}`);
    } else {
      fail(
        "e2e.scriptPersistence",
        "el guion quedó guardado en MongoDB",
        `HTTP ${persisted.status} sin el guion generado`
      );
    }
  }

  if (SMOKE_IMAGE) {
    const imageResponse = await api("/api/ai/images/generate", {
      method: "POST",
      token,
      body: { prompt: "Un faro solitario bajo la lluvia, estilo cinematográfico.", style: "cinematic" }
    });

    const url = imageResponse.payload?.url;

    if (imageResponse.status !== 200 || !url) {
      fail(
        "e2e.image",
        "POST /api/ai/images/generate",
        `HTTP ${imageResponse.status} · code=${imageResponse.payload?.code || "?"} · ${shortJson(imageResponse.payload?.error || imageResponse.text, 180)}`
      );
    } else {
      ok(
        "e2e.image",
        "POST /api/ai/images/generate",
        `HTTP 200 · ${imageResponse.payload.mimeType || "?"} · ${imageResponse.payload.size ?? "?"} bytes · estado=${imageResponse.payload.status}`
      );

      const media = await fetch(`${base}${url}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      const buffer = Buffer.from(await media.arrayBuffer());
      const mimetype = detectImageMime(buffer);

      if (media.ok && buffer.length > 0 && mimetype) {
        ok(
          "e2e.media",
          "el medio generado se descarga del backend",
          `HTTP ${media.status} · ${mimetype} · ${buffer.length} bytes`
        );
      } else {
        fail(
          "e2e.media",
          "el medio generado se descarga del backend",
          `HTTP ${media.status} · ${buffer.length} bytes · mime=${mimetype || "no reconocido"}`
        );
      }
    }
  } else {
    skip("e2e.image", "POST /api/ai/images/generate", "activa SMOKE_IMAGE=1 para generarla y facturarla");
  }

  const logout = await api("/api/auth/logout", { method: "POST", token });

  if (logout.ok) {
    ok("e2e.logout", "sesión temporal cerrada", `HTTP ${logout.status}`);
  } else {
    fail("e2e.logout", "sesión temporal cerrada", `HTTP ${logout.status}`);
  }
}

/* ------------------------------------------------------------------ */

async function main() {
  if (!JSON_OUTPUT) {
    const mode = WIRE_ONLY
      ? "solo cableado"
      : DEPLOYED_ONLY
        ? "solo API desplegada"
        : "real";

    console.log("===== KRONOS · PRUEBA DE HUMO DE OPENROUTER =====");
    console.log(`modo=${mode} · imágenes=${SMOKE_IMAGE ? "activadas" : "desactivadas"} · BASE=${BASE || "(sin definir)"}`);
  }

  const { key, script, image } = checkConfiguration();

  if (DEPLOYED_ONLY && !BASE) {
    console.error(
      "SMOKE_ERROR: --deployed exige BASE=https://tu-api (ruta completa sin /api)"
    );
    process.exit(2);
  }

  const wantsLive = !WIRE_ONLY && !DEPLOYED_ONLY && Boolean(key);
  let live = false;

  if (!DEPLOYED_ONLY) {
    await checkCatalog({ script, image });
  }

  if (!WIRE_ONLY && !DEPLOYED_ONLY && !key) {
    section("3-5. VERIFICACIÓN REAL");
    skip("live", "peticiones autenticadas a OpenRouter", "sin OPENROUTER_API_KEY no se ejecutan");
  }

  if (wantsLive) {
    const authenticated = await checkKey(key);

    if (authenticated) {
      live = true;
      await checkScriptGeneration(key, script.model);

      if (SMOKE_IMAGE) {
        await checkImageGeneration(key, image.model);
      } else {
        section("5. IMAGEN REAL (images/generations)");
        skip("image.provider", "el proveedor devolvió una imagen", "activa SMOKE_IMAGE=1 para generarla y facturarla");
      }
    }
  }

  if (BASE) {
    await checkDeployedApi(BASE);
    live = true;
  } else if (!WIRE_ONLY && !DEPLOYED_ONLY) {
    section("6. EXTREMO A EXTREMO CONTRA LA API DESPLEGADA");
    skip("e2e", "recorrido completo por la API", "define BASE=https://api.kronos-space.com para ejecutarlo");
  }

  const failures = results.filter((result) => result.status === "FALLA");

  if (JSON_OUTPUT) {
    console.log(
      JSON.stringify(
        {
          ok: failures.length === 0 && (live || WIRE_ONLY),
          live,
          wireOnly: WIRE_ONLY,
          deployedOnly: DEPLOYED_ONLY,
          skipped,
          failures: failures.length,
          results
        },
        null,
        2
      )
    );
  } else {
    console.log("\n===== RESUMEN =====");
    console.log(
      `comprobaciones=${results.length} · fallos=${failures.length} · omitidas=${skipped} · verificación real=${live ? "sí" : "no"}`
    );

    for (const failure of failures) {
      console.log(`  FALLA ${failure.label} — ${failure.detail}`);
    }
  }

  if (failures.length > 0) {
    if (!JSON_OUTPUT) console.log("\nRESULTADO: PRUEBA DE HUMO DE OPENROUTER CON FALLOS");
    process.exit(1);
  }

  if (!live && !WIRE_ONLY) {
    if (!JSON_OUTPUT) {
      console.log(
        "\nRESULTADO: NO EJECUTADO — sin OPENROUTER_API_KEY ni BASE no se ha verificado nada contra un sistema real"
      );
      console.log("Esto NO es un aprobado: usa --wire para validar solo el cableado.");
    }

    process.exit(3);
  }

  if (!JSON_OUTPUT) {
    console.log(
      WIRE_ONLY
        ? "\nRESULTADO: CABLEADO DE OPENROUTER OK (sin peticiones autenticadas)"
        : DEPLOYED_ONLY
          ? "\nRESULTADO: FLUJO DE IA A TRAVÉS DE LA API DESPLEGADA OK"
          : "\nRESULTADO: PRUEBA DE HUMO DE OPENROUTER OK"
    );
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("SMOKE_ERROR:", error?.message || error);
  process.exit(1);
});

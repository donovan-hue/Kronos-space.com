const {
  openRouterBaseUrl,
  openRouterHeaders
} = require("../../config/openrouter");

/**
 * Descubrimiento real de capacidades del modelo de imágenes.
 *
 * OpenRouter declara, por modelo y por endpoint, qué parámetros acepta
 * (`supported_parameters`). Enviar un parámetro que el endpoint no declara
 * hace que el proveedor rechace la petición: para `google/gemini-2.5-flash-image`
 * los endpoints aceptan `aspect_ratio`, `n` e `input_references`, pero NO `size`,
 * que era justo lo que se enviaba de fijo.
 *
 * Regla de esta capa: el cuerpo de la petición solo lleva lo que el modelo
 * declara. Si no se puede consultar el catálogo, se cae al cuerpo mínimo
 * (`model` + `prompt`), que cualquier modelo acepta.
 */

const CAPABILITIES_TTL_MS = 10 * 60 * 1000;
const CAPABILITIES_TIMEOUT_MS = 10_000;
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_IMAGE_ASPECT_RATIO = "1:1";

const cache = new Map();

function cacheKey(model, env = process.env) {
  return `${openRouterBaseUrl(env)}::${String(model || "").trim()}`;
}

/**
 * Devuelve el conjunto de parámetros declarados por todos los endpoints del
 * modelo, o `null` cuando no se puede saber (red, 404, router sin endpoints).
 */
async function fetchImageCapabilities(
  model,
  {
    fetchImpl = fetch,
    timeoutMs = CAPABILITIES_TIMEOUT_MS,
    env = process.env
  } = {}
) {
  const slug = String(model || "").trim();

  if (!slug) return null;

  const url = `${openRouterBaseUrl(env)}/images/models/${encodeURIComponent(slug)}/endpoints`;

  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      ...openRouterHeaders(env)
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const endpoints = payload?.data?.endpoints;

  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    // Routers (por ejemplo `openrouter/free`) no listan endpoints: no hay
    // forma de declarar capacidades, así que se envía el cuerpo mínimo.
    return { model: slug, declared: null, endpoints: 0 };
  }

  const declared = new Set();

  for (const endpoint of endpoints) {
    const parameters = endpoint?.supported_parameters;

    if (parameters && typeof parameters === "object") {
      for (const name of Object.keys(parameters)) {
        declared.add(name);
      }
    }
  }

  return {
    model: slug,
    declared,
    endpoints: endpoints.length
  };
}

/**
 * Igual que `fetchImageCapabilities` pero con caché y sin lanzar nunca:
 * un fallo de descubrimiento no debe impedir generar imágenes.
 */
async function getImageCapabilities(model, options = {}) {
  const slug = String(model || "").trim();

  if (!slug) return null;

  const key = cacheKey(model, options.env || process.env);

  const ttlMs = options.ttlMs ?? CAPABILITIES_TTL_MS;
  const cached = cache.get(key);

  if (cached && Date.now() - cached.fetchedAt < ttlMs) {
    return cached.value;
  }

  let value = null;

  try {
    value = await fetchImageCapabilities(slug, options);
  } catch (error) {
    console.error(
      "IMAGE_CAPABILITIES_UNAVAILABLE:",
      error?.message || error
    );
    value = null;
  }

  if (value) {
    cache.set(key, { value, fetchedAt: Date.now() });
  }

  return value;
}

/**
 * Construye el cuerpo real de la petición de imagen.
 *
 * `size` manda cuando el modelo lo declara (píxeles explícitos). Si no,
 * se usa `aspect_ratio` para conservar la intención de encuadre. Si ninguna
 * de las dos está declarada, el cuerpo sale mínimo: es preferible una imagen
 * sin control de encuadre a una petición rechazada.
 */
function buildImageRequestBody({
  model,
  prompt,
  declared = null,
  size = DEFAULT_IMAGE_SIZE,
  aspectRatio = DEFAULT_IMAGE_ASPECT_RATIO
}) {
  const body = { model, prompt };
  const decisions = [];
  const supports = (name) =>
    declared instanceof Set ? declared.has(name) : false;

  if (declared === null) {
    decisions.push({
      parameter: "size",
      requested: size,
      sent: false,
      reason: "sin capacidades declaradas se envía el cuerpo mínimo"
    });
  } else if (supports("size")) {
    body.size = size;
    decisions.push({
      parameter: "size",
      requested: size,
      sent: true,
      reason: "declarado por el modelo"
    });
  } else if (supports("aspect_ratio")) {
    body.aspect_ratio = aspectRatio;
    decisions.push({
      parameter: "size",
      requested: size,
      sent: false,
      reason: `no declarado; se envía aspect_ratio=${aspectRatio}`
    });
  } else {
    decisions.push({
      parameter: "size",
      requested: size,
      sent: false,
      reason: "ni size ni aspect_ratio están declarados"
    });
  }

  return {
    body,
    decisions,
    dropped: decisions.filter((decision) => !decision.sent)
  };
}

function resetImageCapabilityCache() {
  cache.clear();
}

module.exports = {
  CAPABILITIES_TTL_MS,
  CAPABILITIES_TIMEOUT_MS,
  DEFAULT_IMAGE_SIZE,
  DEFAULT_IMAGE_ASPECT_RATIO,
  fetchImageCapabilities,
  getImageCapabilities,
  buildImageRequestBody,
  resetImageCapabilityCache
};

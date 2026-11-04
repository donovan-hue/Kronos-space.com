const ImageGeneration = require("./ImageGeneration");
const download = require("../../config/aiResultDownload");

/**
 * La política de descarga vive en `config/aiResultDownload` (la comparte con
 * video). Estos códigos son los que la imagen ya publicaba en `aiError`.
 */
const IMAGE_DOWNLOAD_CODES = {
  invalid: "IMAGE_RESULT_INVALID",
  unavailable: "IMAGE_RESULT_UNAVAILABLE",
  tooLarge: "IMAGE_RESULT_TOO_LARGE",
  timeout: "IMAGE_PROVIDER_TIMEOUT"
};

const isPrivateAddress = download.isPrivateAddress;

function assertSafeProviderUrl(parsed) {
  return download.assertSafeProviderUrl(parsed, IMAGE_DOWNLOAD_CODES);
}
const { saveBuffer } = require("../../config/storage");
const {
  getAIProviderConfig
} = require("../../config/aiProviders");
const {
  createOpenRouterClient
} = require("../../config/openrouter");
const {
  getImageCapabilities,
  buildImageRequestBody,
  DEFAULT_IMAGE_ASPECT_RATIO,
  MAX_IMAGE_VARIATIONS,
  isAllowedAspectRatio,
  sizeForAspectRatio
} = require("./image.capabilities");

const MAX_PROMPT_LENGTH = 4000;
const MAX_NEGATIVE_PROMPT_LENGTH = 2000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_PROVIDER_TIMEOUT_MS = 45_000;
const ALLOWED_STYLES = new Set(["cinematic", "editorial", "concept-art", "photorealistic"]);
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function buildImagePrompt({ prompt, negativePrompt = "", style = "cinematic" }) {
  const parts = [`Estilo visual: ${style}.`, prompt.trim()];
  const excluded = typeof negativePrompt === "string" ? negativePrompt.trim() : "";

  if (excluded) parts.push(`Evita: ${excluded}.`);

  return parts.join("\n");
}

function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return "";
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return "";
}

function ensureImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("IMAGE_RESULT_INVALID");
  }

  const mimetype = detectImageMime(buffer);
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimetype)) {
    throw new Error("IMAGE_RESULT_INVALID");
  }

  return { buffer, mimetype };
}

function decodeBase64Image(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("IMAGE_RESULT_INVALID");
  }

  const encoded = value.trim().replace(/\s+/g, "");
  let buffer;
  try {
    buffer = Buffer.from(encoded, "base64");
  } catch {
    throw new Error("IMAGE_RESULT_INVALID");
  }

  return ensureImageBuffer(buffer);
}

/**
 * La política vive en `config/aiResultDownload` (la comparte con video); este
 * adaptador solo fija los códigos de error que la imagen ya publicaba.
 */
function readProviderBody(response) {
  return download.readBodyWithLimit(response, {
    maxBytes: MAX_IMAGE_BYTES,
    codes: IMAGE_DOWNLOAD_CODES
  });
}

async function downloadProviderImage(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("IMAGE_RESULT_INVALID");
  }

  await assertSafeProviderUrl(parsed);

  let response;
  try {
    response = await fetch(parsed, {
      signal: AbortSignal.timeout(IMAGE_PROVIDER_TIMEOUT_MS),
      // Provider URLs must be final HTTPS URLs. Following redirects would
      // let a compromised provider response turn this into an SSRF primitive.
      redirect: "error"
    });
  } catch (error) {
    if (
      error?.name === "TimeoutError" ||
      error?.name === "AbortError" ||
      error?.code === "ETIMEDOUT"
    ) {
      throw new Error("IMAGE_PROVIDER_TIMEOUT");
    }
    throw new Error("IMAGE_RESULT_UNAVAILABLE");
  }

  if (!response.ok) throw new Error("IMAGE_RESULT_UNAVAILABLE");

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    throw new Error("IMAGE_RESULT_TOO_LARGE");
  }

  const buffer = await readProviderBody(response);
  return ensureImageBuffer(buffer);
}

async function persistProviderImage(image, ownerId) {
  let decoded;
  if (typeof image?.b64_json === "string" && image.b64_json.trim()) {
    decoded = decodeBase64Image(image.b64_json);
  } else if (typeof image?.url === "string" && image.url.trim()) {
    decoded = await downloadProviderImage(image.url.trim());
  } else {
    throw new Error("OPENROUTER_IMAGE_FORMAT_UNKNOWN");
  }

  const saved = await saveBuffer({
    buffer: decoded.buffer,
    mimetype: decoded.mimetype,
    originalname: `kairos-generated.${decoded.mimetype.split("/")[1]}`,
    subdir: "media",
    ownerId
  });

  return {
    url: saved.url,
    size: saved.size,
    mimetype: decoded.mimetype
  };
}

async function markFailed(generationId, errorCode) {
  try {
    await ImageGeneration.findByIdAndUpdate(generationId, {
      status: "failed",
      error: errorCode,
      imageUrl: ""
    });
  } catch (error) {
    console.error("IMAGE_HISTORY_FAILURE_UPDATE_ERROR:", error?.message || error);
  }
}

async function generateImage({
  prompt,
  negativePrompt = "",
  style = "cinematic",
  aspectRatio = DEFAULT_IMAGE_ASPECT_RATIO,
  variations = 1,
  userId
}) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("INVALID_IMAGE_PROMPT");
  }

  const cleanPrompt = prompt.trim();
  const cleanNegativePrompt = typeof negativePrompt === "string" ? negativePrompt.trim() : "";
  const cleanStyle = typeof style === "string" ? style.trim() : "cinematic";
  const cleanAspectRatio =
    typeof aspectRatio === "string" && aspectRatio.trim()
      ? aspectRatio.trim()
      : DEFAULT_IMAGE_ASPECT_RATIO;
  const cleanVariations = Number.isInteger(variations) ? variations : Number(variations);

  if (cleanPrompt.length > MAX_PROMPT_LENGTH) throw new Error("PROMPT_TOO_LONG");
  if (cleanNegativePrompt.length > MAX_NEGATIVE_PROMPT_LENGTH) throw new Error("NEGATIVE_PROMPT_TOO_LONG");
  if (!ALLOWED_STYLES.has(cleanStyle)) throw new Error("INVALID_IMAGE_STYLE");
  if (!isAllowedAspectRatio(cleanAspectRatio)) throw new Error("INVALID_IMAGE_ASPECT_RATIO");
  if (!Number.isInteger(cleanVariations) || cleanVariations < 1 || cleanVariations > MAX_IMAGE_VARIATIONS) {
    throw new Error("INVALID_IMAGE_VARIATIONS");
  }
  if (!userId) throw new Error("INVALID_USER_ID");

  const provider = getAIProviderConfig("image");
  const generation = await ImageGeneration.create({
    user: userId,
    prompt: cleanPrompt,
    negativePrompt: cleanNegativePrompt,
    style: cleanStyle,
    aspectRatio: cleanAspectRatio,
    variations: cleanVariations,
    model: provider.model,
    provider: provider.provider,
    status: "processing"
  });

  if (!provider.configured) {
    await markFailed(generation._id, "IMAGE_PROVIDER_UNAVAILABLE");
    throw new Error("IMAGE_PROVIDER_UNAVAILABLE");
  }

  const client = createOpenRouterClient({
    apiKey: provider.apiKey,
    timeout: IMAGE_PROVIDER_TIMEOUT_MS,
    maxRetries: 0
  });

  // El cuerpo solo lleva parámetros que el modelo declara: OpenRouter rechaza
  // los que el endpoint no soporta (por ejemplo `size` en
  // google/gemini-2.5-flash-image, que sí acepta `aspect_ratio`).
  const capabilities = await getImageCapabilities(provider.model);
  const { body, dropped } = buildImageRequestBody({
    model: provider.model,
    prompt: buildImagePrompt({
      prompt: cleanPrompt,
      negativePrompt: cleanNegativePrompt,
      style: cleanStyle
    }),
    declared: capabilities?.declared ?? null,
    size: sizeForAspectRatio(
      cleanAspectRatio,
      process.env.OPENROUTER_IMAGE_SIZE || undefined
    ),
    aspectRatio:
      process.env.OPENROUTER_IMAGE_ASPECT_RATIO || cleanAspectRatio,
    variations: cleanVariations
  });

  if (dropped.length > 0) {
    console.warn(
      "IMAGE_PARAMETERS_DROPPED:",
      provider.model,
      dropped.map((decision) => decision.parameter).join(",")
    );
  }

  let response;
  try {
    response = await client.images.generate(body);
  } catch (error) {
    const status = error?.status;
    const name = error?.name;
    const providerMessage = error?.error?.message || error?.message || String(error);
    console.error("IMAGE_PROVIDER_ERROR:", {
      status,
      name,
      message: providerMessage
    });

    let code = "IMAGE_PROVIDER_UNAVAILABLE";

    if (
      name === "APIConnectionTimeoutError" ||
      name === "TimeoutError" ||
      error?.code === "ETIMEDOUT" ||
      status === 408
    ) {
      code = "IMAGE_PROVIDER_TIMEOUT";
    } else if (status === 401 || status === 403) {
      code = "IMAGE_PROVIDER_AUTH_FAILED";
    } else if (status === 402) {
      code = "IMAGE_PROVIDER_INSUFFICIENT_CREDITS";
    } else if (status === 429) {
      code = "IMAGE_PROVIDER_RATE_LIMITED";
    } else if (status === 400 || status === 404) {
      code = "IMAGE_PROVIDER_BAD_REQUEST";
    } else if (status >= 500) {
      code = "IMAGE_PROVIDER_SERVER_ERROR";
    }

    await markFailed(generation._id, code);
    throw new Error(code);
  }

  const images = Array.isArray(response.data) ? response.data : [];
  if (!images.length) {
    await markFailed(generation._id, "OPENROUTER_NO_IMAGE");
    throw new Error("OPENROUTER_NO_IMAGE");
  }

  // Cuando el modelo no declara `n` se pide una sola imagen: se ignoran las
  // variaciones que el proveedor hubiera devuelto de más, para no guardar
  // archivos que el contrato no promete.
  const requested = images.slice(0, cleanVariations);

  const persisted = [];
  for (const image of requested) {
    try {
      persisted.push(await persistProviderImage(image, generation.user));
    } catch (error) {
      const resultCodes = new Set([
        "IMAGE_PROVIDER_TIMEOUT",
        "IMAGE_RESULT_INVALID",
        "IMAGE_RESULT_TOO_LARGE",
        "IMAGE_RESULT_UNAVAILABLE",
        "OPENROUTER_IMAGE_FORMAT_UNKNOWN"
      ]);
      const code = resultCodes.has(error?.message)
        ? error.message
        : "IMAGE_RESULT_PERSIST_FAILED";
      console.error("IMAGE_RESULT_PERSIST_ERROR:", code, `${persisted.length}/${requested.length}`);
      // Si no se guardó ninguna, la generación falla entera; si ya hay
      // variaciones guardadas, se devuelven esas y se anota el fallo parcial.
      if (!persisted.length) {
        await markFailed(generation._id, code);
        throw new Error(code);
      }
      break;
    }
  }

  const [primary, ...rest] = persisted;
  const variantUrls = persisted.map((item) => item.url);

  await ImageGeneration.findByIdAndUpdate(generation._id, {
    status: "completed",
    imageUrl: primary.url,
    variants: variantUrls,
    error: ""
  });

  return {
    id: generation._id,
    generationId: generation._id,
    url: primary.url,
    urls: variantUrls,
    variants: variantUrls.map((url, index) => ({
      url,
      size: persisted[index].size,
      mimeType: persisted[index].mimetype
    })),
    aspectRatio: cleanAspectRatio,
    variations: persisted.length,
    requestedVariations: cleanVariations,
    status: "completed",
    development: false,
    model: provider.model,
    provider: provider.provider,
    mimeType: primary.mimetype,
    size: primary.size,
    ...(rest.length < cleanVariations
      ? { message: `El modelo solo devolvió ${persisted.length} de ${cleanVariations} variaciones.` }
      : {})
  };
}

async function uploadImage({ file, userId }) {
  if (!file || !file.buffer) throw new Error("INVALID_IMAGE_FILE");
  if (!userId) throw new Error("INVALID_USER_ID");

  const saved = await saveBuffer({
    buffer: file.buffer,
    mimetype: file.mimetype,
    originalname: file.originalname,
    subdir: "media",
    ownerId: userId
  });

  const generation = await ImageGeneration.create({
    user: userId,
    prompt: "Imagen subida por el usuario",
    model: "upload",
    provider: "upload",
    status: "completed",
    imageUrl: saved.url
  });

  return {
    id: generation._id,
    generationId: generation._id,
    url: saved.url,
    status: "completed",
    development: false,
    model: "upload",
    mimeType: file.mimetype,
    size: saved.size
  };
}

module.exports = {
  buildImagePrompt,
  detectImageMime,
  ensureImageBuffer,
  decodeBase64Image,
  isPrivateAddress,
  assertSafeProviderUrl,
  persistProviderImage,
  generateImage,
  uploadImage,
  MAX_PROMPT_LENGTH,
  MAX_NEGATIVE_PROMPT_LENGTH,
  MAX_IMAGE_BYTES,
  IMAGE_PROVIDER_TIMEOUT_MS,
  MAX_IMAGE_VARIATIONS
};

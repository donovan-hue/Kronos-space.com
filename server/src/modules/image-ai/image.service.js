const dns = require("node:dns").promises;
const net = require("node:net");
const OpenAI = require("openai");
const ImageGeneration = require("./ImageGeneration");
const { saveBuffer } = require("../../config/storage");
const {
  getAIProviderConfig
} = require("../../config/aiProviders");

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

function isPrivateAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    const [a, b, c] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    if (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    ) {
      return true;
    }

    const mappedIpv4 = normalized.match(/^::ffff:(\\d+\\.\\d+\\.\\d+\\.\\d+)$/);
    return Boolean(mappedIpv4 && isPrivateAddress(mappedIpv4[1]));
  }

  return true;
}

async function assertSafeProviderUrl(parsed) {
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443")
  ) {
    throw new Error("IMAGE_RESULT_INVALID");
  }

  const hostname = parsed.hostname.replace(/\\.$/, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("IMAGE_RESULT_INVALID");
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("IMAGE_RESULT_INVALID");
    return;
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("IMAGE_RESULT_UNAVAILABLE");
  }

  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("IMAGE_RESULT_INVALID");
  }
}

async function readProviderBody(response) {
  if (!response.body || typeof response.body.getReader !== "function") {
    throw new Error("IMAGE_RESULT_UNAVAILABLE");
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value?.byteLength || 0;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error("IMAGE_RESULT_TOO_LARGE");
      }
      if (value?.byteLength) chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error?.message === "IMAGE_RESULT_TOO_LARGE") throw error;
    throw new Error("IMAGE_RESULT_UNAVAILABLE");
  }

  return Buffer.concat(chunks, total);
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

async function persistProviderImage(image) {
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
    subdir: "media"
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

async function generateImage({ prompt, negativePrompt = "", style = "cinematic", userId }) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("INVALID_IMAGE_PROMPT");
  }

  const cleanPrompt = prompt.trim();
  const cleanNegativePrompt = typeof negativePrompt === "string" ? negativePrompt.trim() : "";
  const cleanStyle = typeof style === "string" ? style.trim() : "cinematic";

  if (cleanPrompt.length > MAX_PROMPT_LENGTH) throw new Error("PROMPT_TOO_LONG");
  if (cleanNegativePrompt.length > MAX_NEGATIVE_PROMPT_LENGTH) throw new Error("NEGATIVE_PROMPT_TOO_LONG");
  if (!ALLOWED_STYLES.has(cleanStyle)) throw new Error("INVALID_IMAGE_STYLE");
  if (!userId) throw new Error("INVALID_USER_ID");

  const provider = getAIProviderConfig("image");
  const generation = await ImageGeneration.create({
    user: userId,
    prompt: cleanPrompt,
    negativePrompt: cleanNegativePrompt,
    style: cleanStyle,
    model: provider.model,
    provider: provider.provider,
    status: "processing"
  });

  if (!provider.configured) {
    await markFailed(generation._id, "IMAGE_PROVIDER_UNAVAILABLE");
    throw new Error("IMAGE_PROVIDER_UNAVAILABLE");
  }

  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: IMAGE_PROVIDER_TIMEOUT_MS,
    maxRetries: 0,
    defaultHeaders: {
      "HTTP-Referer":
        (process.env.CLIENT_URL || "http://localhost:3000")
          .split(",")[0]
          .trim(),
      "X-Title": "Kronos Space"
    }
  });

  let response;
  try {
    response = await client.images.generate({
      model: provider.model,
      prompt: buildImagePrompt({
        prompt: cleanPrompt,
        negativePrompt: cleanNegativePrompt,
        style: cleanStyle
      }),
      size: "1024x1024"
    });
  } catch (error) {
    console.error("IMAGE_PROVIDER_ERROR:", error?.message || error);
    const code =
      error?.name === "APIConnectionTimeoutError" ||
      error?.name === "TimeoutError" ||
      error?.code === "ETIMEDOUT" ||
      error?.status === 408
        ? "IMAGE_PROVIDER_TIMEOUT"
        : "IMAGE_PROVIDER_UNAVAILABLE";
    await markFailed(generation._id, code);
    throw new Error(code);
  }

  const image = response.data?.[0];
  if (!image) {
    await markFailed(generation._id, "OPENROUTER_NO_IMAGE");
    throw new Error("OPENROUTER_NO_IMAGE");
  }

  let persisted;
  try {
    persisted = await persistProviderImage(image);
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
    console.error("IMAGE_RESULT_PERSIST_ERROR:", code);
    await markFailed(generation._id, code);
    throw new Error(code);
  }

  await ImageGeneration.findByIdAndUpdate(generation._id, {
    status: "completed",
    imageUrl: persisted.url,
    error: ""
  });

  return {
    id: generation._id,
    generationId: generation._id,
    url: persisted.url,
    status: "completed",
    development: false,
    model: provider.model,
    provider: provider.provider,
    mimeType: persisted.mimetype,
    size: persisted.size
  };
}

async function uploadImage({ file, userId }) {
  if (!file || !file.buffer) throw new Error("INVALID_IMAGE_FILE");
  if (!userId) throw new Error("INVALID_USER_ID");

  const saved = await saveBuffer({
    buffer: file.buffer,
    mimetype: file.mimetype,
    originalname: file.originalname,
    subdir: "media"
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
  isPrivateAddress,
  assertSafeProviderUrl,
  persistProviderImage,
  generateImage,
  uploadImage,
  MAX_PROMPT_LENGTH,
  MAX_NEGATIVE_PROMPT_LENGTH,
  MAX_IMAGE_BYTES,
  IMAGE_PROVIDER_TIMEOUT_MS
};

const { getAIProviderConfig } = require("../../config/aiProviders");

const MAX_PROMPT_LENGTH = 4000;
const MAX_NEGATIVE_PROMPT_LENGTH = 2000;
const MAX_STYLE_LENGTH = 80;

function normalizeControls({ prompt, negativePrompt = "", style = "" }) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("INVALID_VIDEO_PROMPT");
  }

  const normalizedPrompt = prompt.trim();
  const normalizedNegativePrompt = typeof negativePrompt === "string" ? negativePrompt.trim() : "";
  const normalizedStyle = typeof style === "string" ? style.trim() : "";

  if (normalizedPrompt.length > MAX_PROMPT_LENGTH) throw new Error("PROMPT_TOO_LONG");
  if (normalizedNegativePrompt.length > MAX_NEGATIVE_PROMPT_LENGTH) throw new Error("NEGATIVE_PROMPT_TOO_LONG");
  if (normalizedStyle.length > MAX_STYLE_LENGTH) throw new Error("STYLE_TOO_LONG");

  return {
    prompt: normalizedPrompt,
    negativePrompt: normalizedNegativePrompt,
    style: normalizedStyle
  };
}

function statusFromProvider(value) {
  const status = String(value || "").toLowerCase();
  if (["completed", "complete", "succeeded", "success", "done"].includes(status)) return "completed";
  if (["failed", "error", "cancelled", "canceled"].includes(status)) return "failed";
  if (["processing", "running", "in_progress"].includes(status)) return "processing";
  return "queued";
}

function readProviderResult(data) {
  const output = data?.output || data?.result || data?.data || {};
  const videoUrl = data?.videoUrl || data?.video_url || data?.url || output.videoUrl || output.video_url || output.url || "";
  const providerJobId = String(data?.id || data?.jobId || data?.job_id || output.id || output.jobId || output.job_id || "");
  const status = statusFromProvider(data?.status || data?.state || output.status || output.state);
  const progress = Number(data?.progress ?? output.progress);

  return {
    providerJobId,
    videoUrl: typeof videoUrl === "string" ? videoUrl : "",
    status,
    progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : status === "completed" ? 100 : 0
  };
}

function providerRequestBody({ prompt, negativePrompt, style, model }) {
  return {
    model,
    prompt,
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(style ? { style } : {})
  };
}

async function requestProvider(url, { method = "POST", apiKey, body } = {}) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: method === "GET" ? undefined : JSON.stringify(body)
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) throw new Error("VIDEO_PROVIDER_ERROR");
  }

  if (!response.ok) {
    throw new Error("VIDEO_PROVIDER_ERROR");
  }

  return data || {};
}

/** Creates a provider job without pretending that an asynchronous provider is complete. */
async function createVideoJob({ prompt, negativePrompt = "", style = "" }) {
  const controls = normalizeControls({ prompt, negativePrompt, style });
  const provider = getAIProviderConfig("video");

  if (!provider.configured) {
    // No se crea una tarea ficticia: una generación sin proveedor real
    // quedaría eternamente en cola y engañaría a la interfaz.
    throw new Error("VIDEO_PROVIDER_UNAVAILABLE");
  }

  try {
    const data = await requestProvider(provider.endpoint, {
      apiKey: provider.apiKey,
      body: providerRequestBody({ ...controls, model: provider.model })
    });
    const result = readProviderResult(data);

    if (!result.providerJobId && !result.videoUrl) {
      throw new Error("VIDEO_JOB_ID_NOT_FOUND");
    }

    return {
      ...controls,
      ...result,
      status: result.videoUrl ? "completed" : result.status,
      development: false,
      message: result.videoUrl ? null : "La generación de video está en proceso."
    };
  } catch (error) {
    console.error("VIDEO_PROVIDER_NETWORK_ERROR:", error?.message || error);
    throw new Error(error.message === "VIDEO_JOB_ID_NOT_FOUND" ? error.message : "VIDEO_PROVIDER_UNAVAILABLE");
  }
}

/** Polls the provider only when the provider supplied a real job id. */
async function pollVideoJob({ providerJobId }) {
  if (!providerJobId) return null;

  const provider = getAIProviderConfig("video");
  if (!provider.configured) return null;

  const statusUrl = `${provider.endpoint.replace(/\/$/, "")}/${encodeURIComponent(providerJobId)}`;

  try {
    const data = await requestProvider(statusUrl, {
      method: "GET",
      apiKey: provider.apiKey
    });
    return readProviderResult(data);
  } catch (error) {
    console.error("VIDEO_PROVIDER_STATUS_ERROR:", error?.message || error);
    throw new Error("VIDEO_PROVIDER_UNAVAILABLE");
  }
}

module.exports = {
  createVideoJob,
  pollVideoJob,
  normalizeControls,
  readProviderResult
};

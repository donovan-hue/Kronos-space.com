const OpenAI = require("openai");
const ImageGeneration = require("./ImageGeneration");
const {
  getAIProviderConfig
} = require("../../config/aiProviders");

function buildImagePrompt({ prompt, negativePrompt = "", style = "cinematic" }) {
  const parts = [`Estilo visual: ${style}.`, prompt.trim()];
  const excluded = typeof negativePrompt === "string" ? negativePrompt.trim() : "";

  if (excluded) parts.push(`Evita: ${excluded}.`);

  return parts.join("\n");
}

async function generateImage({ prompt, negativePrompt = "", style = "cinematic", userId }) {
  if (
    typeof prompt !== "string" ||
    !prompt.trim()
  ) {
    throw new Error("INVALID_IMAGE_PROMPT");
  }

  if (!userId) {
    throw new Error("INVALID_USER_ID");
  }

  const provider =
    getAIProviderConfig("image");
  const cleanNegativePrompt = typeof negativePrompt === "string" ? negativePrompt.trim() : "";
  const cleanStyle = typeof style === "string" ? style.trim() : "cinematic";

  const generation = await ImageGeneration.create({
    user: userId,
    prompt: prompt.trim(),
    negativePrompt: cleanNegativePrompt,
    style: cleanStyle,
    model: provider.model,
    provider: provider.provider,
    status: "processing"
  });

  if (!provider.configured) {
    await ImageGeneration.findByIdAndUpdate(generation._id, {
      status: "failed",
      error: "IMAGE_PROVIDER_NOT_CONFIGURED"
    });

    return {
      id: generation._id,
      generationId: generation._id,
      url: "",
      status: "failed",
      development: true,
      model: provider.model,
      provider: provider.provider,
      message:
        "Configura OPENROUTER_API_KEY para activar la generación de imágenes."
    };
  }

  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: "https://openrouter.ai/api/v1",
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
        prompt,
        negativePrompt: cleanNegativePrompt,
        style: cleanStyle
      }),
      size: "1024x1024"
    });
  } catch (error) {
    console.error(
      "IMAGE_PROVIDER_ERROR:",
      error?.message || error
    );

    await ImageGeneration.findByIdAndUpdate(generation._id, {
      status: "failed",
      error: "IMAGE_PROVIDER_UNAVAILABLE"
    });

    throw new Error("IMAGE_PROVIDER_UNAVAILABLE");
  }
  const image = response.data?.[0];

  if (!image) {
    await ImageGeneration.findByIdAndUpdate(generation._id, {
      status: "failed",
      error: "OPENROUTER_NO_IMAGE"
    });
    throw new Error("OPENROUTER_NO_IMAGE");
  }

  let url = "";

  if (image.url) {
    url = image.url;
  } else if (image.b64_json) {
    url = `data:image/png;base64,${image.b64_json}`;
  } else {
    await ImageGeneration.findByIdAndUpdate(generation._id, {
      status: "failed",
      error: "OPENROUTER_IMAGE_FORMAT_UNKNOWN"
    });
    throw new Error(
      "OPENROUTER_IMAGE_FORMAT_UNKNOWN"
    );
  }

  await ImageGeneration.findByIdAndUpdate(generation._id, {
    status: "completed",
    imageUrl: url,
    error: ""
  });

  return {
    id: generation._id,
    generationId: generation._id,
    url,
    status: "completed",
    development: false,
    model: provider.model,
    provider: provider.provider
  };
}

async function uploadImage({ file, userId }) {
  if (!file || !file.buffer) {
    throw new Error("INVALID_IMAGE_FILE");
  }

  if (!userId) {
    throw new Error("INVALID_USER_ID");
  }

  const imageUrl =
    `data:${file.mimetype};base64,` +
    file.buffer.toString("base64");

  const generation = await ImageGeneration.create({
    user: userId,
    prompt: "Imagen subida por el usuario",
    model: "upload",
    provider: "upload",
    status: "completed",
    imageUrl
  });

  return {
    id: generation._id,
    generationId: generation._id,
    url: imageUrl,
    status: "completed",
    development: false,
    model: "upload"
  };
}

module.exports = {
  buildImagePrompt,
  generateImage,
  uploadImage
};

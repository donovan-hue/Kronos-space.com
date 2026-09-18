const OpenAI = require("openai");
const ImageGeneration = require("./ImageGeneration");
const {
  getAIProviderConfig
} = require("../../config/aiProviders");

async function generateImage({ prompt, negativePrompt = "", style = "", userId }) {
  if (
    typeof prompt !== "string" ||
    !prompt.trim()
  ) {
    throw new Error("INVALID_IMAGE_PROMPT");
  }

  if (!userId) {
    throw new Error("INVALID_USER_ID");
  }

  const normalizedNegativePrompt = typeof negativePrompt === "string" ? negativePrompt.trim() : "";
  const normalizedStyle = typeof style === "string" ? style.trim() : "";
  const provider =
    getAIProviderConfig("image");

  const generation = await ImageGeneration.create({
    user: userId,
    prompt: prompt.trim(),
    negativePrompt: normalizedNegativePrompt,
    style: normalizedStyle,
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
      negativePrompt: normalizedNegativePrompt,
      style: normalizedStyle,
      message:
        "Configura OPENROUTER_API_KEY para activar la generación de imágenes."
    };
  }

  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer":
        process.env.CLIENT_URL ||
        "http://localhost:3000",
      "X-Title": "Kronos Social AI"
    }
  });
  let response;

  try {
    const providerPrompt = [
      prompt.trim(),
      normalizedStyle ? `Visual style: ${normalizedStyle}` : "",
      normalizedNegativePrompt ? `Avoid: ${normalizedNegativePrompt}` : ""
    ].filter(Boolean).join("\n\n");

    response = await client.images.generate({
      model: provider.model,
      prompt: providerPrompt,
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
    provider: provider.provider,
    negativePrompt: normalizedNegativePrompt,
    style: normalizedStyle
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
  generateImage,
  uploadImage
};

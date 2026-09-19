const OpenAI = require("openai");
const {
  getAIProviderConfig
} = require("../../config/aiProviders");

const MAX_PROMPT_LENGTH = 10000;
const MAX_OUTPUT_TOKENS = 3000;
const PROVIDER_TIMEOUT_MS = 45000;
const SCRIPT_TYPES = new Set([
  "video",
  "reel",
  "youtube",
  "advertisement",
  "story",
  "presentation",
  "custom"
]);

function normalizeScriptStructure(value) {
  if (!value || typeof value !== "object") {
    throw new Error("SCRIPT_INVALID_RESPONSE");
  }

  if (
    typeof value.title !== "string" ||
    !value.title.trim() ||
    typeof value.logline !== "string" ||
    !value.narrative ||
    typeof value.narrative !== "object" ||
    typeof value.narrative.beginning !== "string" ||
    typeof value.narrative.middle !== "string" ||
    typeof value.narrative.ending !== "string" ||
    typeof value.closing !== "string" ||
    !Array.isArray(value.scenes) ||
    value.scenes.length === 0
  ) {
    throw new Error("SCRIPT_INVALID_RESPONSE");
  }

  const scenes = value.scenes.map((scene, index) => {
    if (
      !scene ||
      typeof scene !== "object" ||
      typeof scene.heading !== "string" ||
      typeof scene.action !== "string" ||
      !Array.isArray(scene.characters) ||
      !scene.characters.every(
        character => typeof character === "string"
      ) ||
      !Array.isArray(scene.dialogue) ||
      typeof scene.directions !== "string" ||
      typeof scene.transition !== "string"
    ) {
      throw new Error("SCRIPT_INVALID_RESPONSE");
    }

    return {
      number: Number.isInteger(scene?.number)
        ? scene.number
        : index + 1,
      heading: scene.heading.trim(),
      action: scene.action.trim(),
      characters: scene.characters.map(
        character => character.trim()
      ),
      dialogue: scene.dialogue.map(line => {
        if (
          !line ||
          typeof line !== "object" ||
          typeof line.character !== "string" ||
          typeof line.text !== "string" ||
          typeof line.direction !== "string"
        ) {
          throw new Error("SCRIPT_INVALID_RESPONSE");
        }

        return {
          character: line.character.trim(),
          text: line.text.trim(),
          direction: line.direction.trim()
        };
      }),
      directions: scene.directions.trim(),
      transition: scene.transition.trim()
    };
  });

  return {
    title: value.title.trim(),
    logline: value.logline.trim(),
    narrative: {
      beginning: typeof value.narrative?.beginning === "string"
        ? value.narrative.beginning.trim()
        : "",
      middle: typeof value.narrative?.middle === "string"
        ? value.narrative.middle.trim()
        : "",
      ending: typeof value.narrative?.ending === "string"
        ? value.narrative.ending.trim()
        : ""
    },
    scenes,
    closing: typeof value.closing === "string"
      ? value.closing.trim()
      : ""
  };
}

function formatScriptResult(structure) {
  const lines = [
    `TITULO: ${structure.title}`,
    `PREMISA: ${structure.logline}`,
    "",
    "ESTRUCTURA NARRATIVA",
    `INICIO: ${structure.narrative.beginning}`,
    `DESARROLLO: ${structure.narrative.middle}`,
    `CIERRE: ${structure.narrative.ending}`,
    ""
  ];

  structure.scenes.forEach(scene => {
    lines.push(`ESCENA ${scene.number}: ${scene.heading}`);
    lines.push(`ACCION: ${scene.action}`);

    if (scene.characters.length > 0) {
      lines.push(`PERSONAJES: ${scene.characters.join(", ")}`);
    }

    scene.dialogue.forEach(line => {
      const direction = line.direction
        ? ` (${line.direction})`
        : "";
      lines.push(`${line.character}${direction}: ${line.text}`);
    });

    if (scene.directions) {
      lines.push(`INDICACIONES: ${scene.directions}`);
    }

    if (scene.transition) {
      lines.push(`TRANSICION: ${scene.transition}`);
    }

    lines.push("");
  });

  lines.push(`CIERRE: ${structure.closing}`);
  return lines.join("\n").trim();
}

async function generateScript({
  prompt,
  type = "custom",
  genre = "general",
  format = "standard",
  durationMinutes = 5,
  tone = "",
  audience = ""
}) {
  const provider =
    getAIProviderConfig("script");

  if (!provider.configured) {
    throw new Error("OPENROUTER_API_KEY_NOT_CONFIGURED");
  }

  if (
    typeof prompt !== "string" ||
    !prompt.trim()
  ) {
    throw new Error("PROMPT_REQUIRED");
  }

  const cleanPrompt = prompt.trim();

  if (!SCRIPT_TYPES.has(type)) {
    throw new Error("INVALID_SCRIPT_TYPE");
  }

  if (cleanPrompt.length > MAX_PROMPT_LENGTH) {
    throw new Error("PROMPT_TOO_LONG");
  }

  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: PROVIDER_TIMEOUT_MS,
    defaultHeaders: {
      "HTTP-Referer":
        (process.env.CLIENT_URL || "http://localhost:3000")
          .split(",")[0]
          .trim(),
      "X-Title": "Kronos Space"
    }
  });

  try {
    const response =
      await client.chat.completions.create({
        model: provider.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content:
              "Eres un guionista profesional de Kronos Space. Devuelve únicamente un JSON válido, sin markdown ni texto adicional, con esta forma exacta: {\"title\":\"string\",\"logline\":\"string\",\"narrative\":{\"beginning\":\"string\",\"middle\":\"string\",\"ending\":\"string\"},\"scenes\":[{\"number\":1,\"heading\":\"INT./EXT. - LUGAR - MOMENTO\",\"action\":\"string\",\"characters\":[\"string\"],\"dialogue\":[{\"character\":\"string\",\"text\":\"string\",\"direction\":\"string\"}],\"directions\":\"string\",\"transition\":\"string\"}],\"closing\":\"string\"}. Escribe en español, adapta el ritmo a la duración, conserva una estructura narrativa clara y no inventes datos concretos que el usuario no haya proporcionado."
          },
          {
            role: "user",
            content:
              `Tipo: ${type}\nGénero: ${genre}\nFormato: ${format}\nDuración objetivo: ${durationMinutes} minutos\nTono: ${tone || "por definir"}\nAudiencia: ${audience || "general"}\n\nSolicitud: ${cleanPrompt}`
          }
        ]
      });

    if (
      response.choices?.[0]?.finish_reason === "length"
    ) {
      throw new Error("SCRIPT_INCOMPLETE_RESPONSE");
    }

    const rawContent =
      response.choices?.[0]?.message?.content;
    const content =
      typeof rawContent === "string"
        ? rawContent.trim()
        : "";

    if (!content) {
      throw new Error("SCRIPT_INVALID_RESPONSE");
    }

    let structure;

    try {
      structure = normalizeScriptStructure(
        JSON.parse(content)
      );
    } catch (error) {
      if (error?.message === "SCRIPT_INVALID_RESPONSE") {
        throw error;
      }

      throw new Error("SCRIPT_INVALID_RESPONSE");
    }

    return {
      result: formatScriptResult(structure),
      structure
    };
  } catch (error) {
    console.error(
      "SCRIPT_PROVIDER_ERROR:",
      error?.message || error
    );

    if (
      error?.message === "SCRIPT_INVALID_RESPONSE" ||
      error?.message === "SCRIPT_INCOMPLETE_RESPONSE"
    ) {
      throw error;
    }

    if (error?.name === "APIConnectionTimeoutError" ||
        error?.code === "ETIMEDOUT" ||
        error?.status === 408) {
      throw new Error("SCRIPT_PROVIDER_TIMEOUT");
    }

    throw new Error("SCRIPT_PROVIDER_ERROR");
  }
}

module.exports = {
  generateScript,
  normalizeScriptStructure,
  formatScriptResult
};

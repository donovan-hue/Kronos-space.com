const AI_ERRORS = {
  MESSAGE_REQUIRED: {
    status: 400,
    message: "El mensaje es obligatorio"
  },
  MESSAGE_TOO_LONG: {
    status: 400,
    message: "El mensaje supera el límite permitido"
  },
  HISTORY_INVALID: {
    status: 400,
    message: "El historial no es válido"
  },
  HISTORY_TOO_LONG: {
    status: 400,
    message: "El historial supera el límite permitido"
  },
  HISTORY_ITEM_TOO_LONG: {
    status: 400,
    message: "Una entrada del historial supera el límite permitido"
  },
  PROMPT_TOO_LONG: {
    status: 400,
    message: "La solicitud de IA supera el límite permitido"
  },
  NEGATIVE_PROMPT_TOO_LONG: {
    status: 400,
    message: "El negative prompt supera el límite permitido"
  },
  INVALID_IMAGE_STYLE: {
    status: 400,
    message: "El estilo de imagen no es válido"
  },
  PROMPT_REQUIRED: {
    status: 400,
    message: "El prompt es obligatorio"
  },
  INVALID_IMAGE_PROMPT: {
    status: 400,
    message: "El prompt de imagen es obligatorio"
  },
  INVALID_VIDEO_PROMPT: {
    status: 400,
    message: "El prompt de video es obligatorio"
  },
  INVALID_USER_ID: {
    status: 401,
    message: "Usuario autenticado inválido"
  },
  OPENROUTER_API_KEY_NOT_CONFIGURED: {
    status: 503,
    message: "El proveedor de IA no está configurado"
  },
  GEMINI_API_KEY_NOT_CONFIGURED: {
    status: 503,
    message: "El proveedor de IA no está configurado"
  },
  IMAGE_PROVIDER_UNAVAILABLE: {
    status: 503,
    message: "El proveedor de imágenes no está disponible"
  },
  IMAGE_PROVIDER_TIMEOUT: {
    status: 504,
    message: "El proveedor de imágenes tardó demasiado en responder"
  },
  IMAGE_RESULT_INVALID: {
    status: 502,
    message: "El proveedor devolvió una imagen inválida"
  },
  IMAGE_RESULT_TOO_LARGE: {
    status: 502,
    message: "El proveedor devolvió una imagen demasiado grande"
  },
  IMAGE_RESULT_UNAVAILABLE: {
    status: 502,
    message: "No se pudo descargar el resultado del proveedor de imágenes"
  },
  IMAGE_RESULT_PERSIST_FAILED: {
    status: 503,
    message: "No se pudo guardar de forma durable la imagen generada"
  },
  OPENROUTER_NO_IMAGE: {
    status: 502,
    message: "El proveedor no devolvió una imagen"
  },
  OPENROUTER_IMAGE_FORMAT_UNKNOWN: {
    status: 502,
    message: "El proveedor devolvió un formato de imagen no compatible"
  },
  UPLOAD_STORAGE_UNAVAILABLE: {
    status: 503,
    message: "El almacenamiento de archivos no está disponible"
  },
  SCRIPT_PROVIDER_ERROR: {
    status: 503,
    message: "El proveedor de guiones no está disponible"
  },
  SCRIPT_PROVIDER_TIMEOUT: {
    status: 504,
    message: "El proveedor de guiones tardó demasiado en responder"
  },
  SCRIPT_INCOMPLETE_RESPONSE: {
    status: 502,
    message: "El proveedor de guiones devolvió una respuesta incompleta"
  },
  SCRIPT_INVALID_RESPONSE: {
    status: 502,
    message: "El proveedor de guiones devolvió una respuesta inválida"
  },
  VIDEO_PROVIDER_UNAVAILABLE: {
    status: 503,
    message: "El proveedor de video no está disponible"
  },
  VIDEO_INVALID_RESPONSE: {
    status: 502,
    message: "El proveedor de video devolvió una respuesta inválida"
  }
};

function getAIErrorResponse(error) {
  const requestedCode = typeof error?.message === "string" ? error.message : "";
  const code = Object.prototype.hasOwnProperty.call(AI_ERRORS, requestedCode)
    ? requestedCode
    : "AI_PROVIDER_ERROR";
  const knownError = AI_ERRORS[code];

  return {
    status: knownError?.status || 502,
    code,
    message: knownError?.message || "No se pudo completar la operación de IA"
  };
}

module.exports = {
  getAIErrorResponse
};

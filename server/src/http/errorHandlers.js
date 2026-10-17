"use strict";

const { describeClientError, isStorageUnavailable } = require("../middleware/httpErrors");

function notFound(req, res) {
  return res.status(404).json({
    error: "Recurso no encontrado", code: "NOT_FOUND",
    path: req.originalUrl.split("?")[0]
  });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.statusCode) ? err.statusCode : Number.isInteger(err.status) ? err.status : 500;
  console.error("API_ERROR", {
    requestId: req.requestId || "",
    method: req.method,
    path: req.originalUrl?.split("?")[0] || "",
    status,
    name: err?.name || "Error",
    code: err?.code || ""
  });

  // Fallos de infraestructura reconocidos (cuerpo ilegible, demasiado
  // grande, codificación no soportada): se responden con un contrato
  // estable en español en lugar del mensaje en inglés del runtime.
  const described = describeClientError(err);

  if (described) {
    return res.status(described.status).json({
      error: described.message,
      code: described.code
    });
  }

  // Sin almacenamiento no se puede atender la petición ahora mismo: 503 es
  // la respuesta honesta y evita que un corte temporal se confunda con un
  // fallo del programa o, peor, con un 401 que cerraría la sesión.
  if (isStorageUnavailable(err)) {
    return res.status(503).json({
      error: "Servicio de autenticación no disponible",
      code: "STORAGE_UNAVAILABLE"
    });
  }

  return res.status(status).json({ error: status >= 500 ? "Error interno del servidor" : err.message || "Error de solicitud" });
}

module.exports = { notFound, errorHandler };

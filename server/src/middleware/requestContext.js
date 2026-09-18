const crypto = require("crypto");

const MAX_REQUEST_ID_LENGTH = 80;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

function safeRequestId(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (candidate && candidate.length <= MAX_REQUEST_ID_LENGTH && REQUEST_ID_PATTERN.test(candidate)) return candidate;
  return crypto.randomUUID();
}

/**
 * BLOQUE 015 — trazabilidad mínima sin guardar tokens, cuerpos ni secretos.
 * También acumula métricas efímeras por proceso para diagnóstico protegido.
 */
function requestContext(req, res, next) {
  const requestId = safeRequestId(req.get("x-request-id"));
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const metrics = req.app?.locals?.requestMetrics;
    if (!metrics) return;
    metrics.total += 1;
    const group = `${Math.floor(res.statusCode / 100)}xx`;
    metrics.byStatus[group] = (metrics.byStatus[group] || 0) + 1;
    metrics.lastRequestAt = new Date().toISOString();
    if (res.statusCode >= 500) {
      console.error("HTTP_SERVER_ERROR", {
        requestId,
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode
      });
    }
  });

  next();
}

module.exports = { requestContext, safeRequestId };

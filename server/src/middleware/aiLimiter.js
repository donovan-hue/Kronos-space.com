const rateLimit = require("express-rate-limit");

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: {
    error: "Límite de uso de IA alcanzado. Intenta más tarde."
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = aiLimiter;

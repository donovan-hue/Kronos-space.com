const express = require("express");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const requireAdmin = require("../../middleware/requireAdmin");

const router = express.Router();

// Métricas de proceso deliberadamente efímeras: no añaden telemetry de
// usuarios ni una dependencia externa; sirven al diagnóstico operacional.
router.get("/summary", auth, requireUser, requireAdmin, (req, res) => {
  const metrics = req.app.locals.requestMetrics || { total: 0, byStatus: {}, startedAt: null, lastRequestAt: null };
  return res.json({
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: metrics.startedAt,
    lastRequestAt: metrics.lastRequestAt,
    requests: { total: metrics.total, byStatus: metrics.byStatus }
  });
});

module.exports = router;

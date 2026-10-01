const express = require("express");
const mcpAuth = require("../../middleware/mcpAuth");

const router = express.Router();

router.get("/status", mcpAuth, (req, res) => {
  return res.json({
    ok: true,
    service: "kronos-mcp",
    authenticated: true,
    identity: req.mcp.name,
    permissions: req.mcp.permissions
  });
});

router.get("/me", mcpAuth, (req, res) => {
  return res.json({
    ok: true,
    service: "kronos-mcp",
    identity: req.mcp.name,
    permissions: req.mcp.permissions
  });
});

module.exports = router;

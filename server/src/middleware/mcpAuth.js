const crypto = require("crypto");
const McpServiceCredential = require("../modules/mcp/McpServiceCredential");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function mcpAuth(req, res, next) {
  try {
    const authorization = req.get("Authorization") || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Credencial MCP requerida",
        code: "MCP_AUTH_REQUIRED"
      });
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        error: "Credencial MCP inválida",
        code: "MCP_AUTH_INVALID"
      });
    }

    const tokenHash = hashToken(token);

    const credential = await McpServiceCredential
      .findOne({ tokenHash, active: true })
      .select("+tokenHash")
      .lean();

    if (!credential) {
      return res.status(401).json({
        error: "Credencial MCP inválida",
        code: "MCP_AUTH_INVALID"
      });
    }

    if (
      credential.expiresAt &&
      new Date(credential.expiresAt).getTime() <= Date.now()
    ) {
      return res.status(401).json({
        error: "Credencial MCP expirada",
        code: "MCP_AUTH_EXPIRED"
      });
    }

    req.mcp = {
      id: credential._id.toString(),
      name: credential.name,
      permissions: credential.permissions || []
    };

    await McpServiceCredential.updateOne(
      { _id: credential._id },
      { $set: { lastUsedAt: new Date() } }
    );

    return next();
  } catch (error) {
    console.error("MCP_AUTH_ERROR:", error);

    return res.status(503).json({
      error: "No se pudo validar la credencial MCP",
      code: "MCP_AUTH_UNAVAILABLE"
    });
  }
}

module.exports = mcpAuth;

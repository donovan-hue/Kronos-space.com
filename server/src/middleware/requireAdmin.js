const User = require("../modules/users/User");
const { isModerator } = require("../modules/moderation/moderation.service");

/** Reusable server-side role check; JWT claims never decide admin access. */
async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.user?.id).select("role").lean();
    if (!isModerator(user)) {
      return res.status(403).json({
        error: "Solo administradores pueden realizar esta acción",
        code: "ADMIN_ONLY"
      });
    }
    req.admin = user;
    return next();
  } catch (error) {
    console.error("ADMIN_CHECK_ERROR:", error);
    return res.status(503).json({
      error: "No se pudo verificar el rol. Inténtalo nuevamente.",
      code: "ADMIN_UNAVAILABLE"
    });
  }
}

module.exports = requireAdmin;

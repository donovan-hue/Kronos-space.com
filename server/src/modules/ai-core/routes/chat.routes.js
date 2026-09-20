const express = require("express");
const { chat } = require("../services/chat.service");
const auth = require("../../../middleware/auth");
const { requireUser } = require("../../../middleware/permissions");
const aiLimiter = require("../../../middleware/aiLimiter");
const User = require("../../users/User");
const {
  getAIErrorResponse
} = require("../../../middleware/aiError");

const router = express.Router();

router.post("/chat", auth, requireUser, aiLimiter, async (req, res) => {
  try {
    const { message, history } = req.body;
    const user = await User.findById(req.user.id)
      .select("preferences.aiPersonality preferences.language")
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado", code: "USER_NOT_FOUND" });
    }

    const result = await chat({
      message,
      history,
      personality: user.preferences?.aiPersonality,
      language: user.preferences?.language
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("Kronos AI chat error:", error);

    const aiError = getAIErrorResponse(error);

    res.status(aiError.status).json({
      success: false,
      error: aiError.message,
      code: aiError.code
    });
  }
});

module.exports = router;

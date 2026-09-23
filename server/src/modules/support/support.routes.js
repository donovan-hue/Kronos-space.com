const express = require("express");
const mongoose = require("mongoose");
const User = require("../users/User");
const SupportTransaction = require("./SupportTransaction");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { isBlockedBetween } = require("../moderation/moderation.service");

const router = express.Router();

/**
 * Apoyo simbólico en créditos Kronos (★), NO dinero: la plataforma no
 * tiene pasarela de pago, así que ni el backend ni la interfaz pueden
 * presentar importes monetarios. `amount` es la cantidad de estrellas.
 */
const MAX_SUPPORT_AMOUNT = 1000;

function parseSupportAmount(value) {
  const amount = Number(value);

  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_SUPPORT_AMOUNT) return null;

  return amount;
}

const SUPPORT_TIERS = [
  { id: "stardust", name: "Básico", amount: 10, label: "10 ★", description: "Apoyo inicial" },
  { id: "meteor", name: "Impulso", amount: 50, label: "50 ★", description: "Apoyo medio" },
  { id: "supernova", name: "Destacado", amount: 200, label: "200 ★", description: "Apoyo destacado" }
];

/**
 * POST /api/support/tip
 * Envía propina/apoyo a un creador
 */
router.post("/tip", auth, requireUser, async (req, res) => {
  try {
    const { creatorId, amount, tier, message, anonymous } = req.body;

    if (!mongoose.isValidObjectId(creatorId)) {
      return res.status(400).json({ error: "ID de creador inválido" });
    }

    if (String(creatorId) === String(req.user.id)) {
      return res.status(400).json({ error: "No puedes enviarte apoyo a ti mismo" });
    }

    const tipAmount = parseSupportAmount(amount);
    if (!tipAmount) {
      return res.status(400).json({ error: `El apoyo debe ser un número entero entre 1 y ${MAX_SUPPORT_AMOUNT} créditos.` });
    }

    if (await isBlockedBetween(req.user.id, creatorId)) {
      return res.status(403).json({ error: "No puedes apoyar a este usuario por un bloqueo", code: "BLOCKED_RELATION" });
    }

    const creator = await User.findById(creatorId).select("_id username displayName");
    if (!creator) {
      return res.status(404).json({ error: "Creador no encontrado" });
    }

    const transaction = await SupportTransaction.create({
      sender: req.user.id,
      creator: creatorId,
      amount: tipAmount,
      tier: ["stardust", "meteor", "supernova", "custom"].includes(tier) ? tier : "stardust",
      message: typeof message === "string" ? message.trim().slice(0, 280) : "",
      anonymous: Boolean(anonymous)
    });

    // Notificación al creador
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${creatorId}`).emit("creator:support-received", {
        amount: tipAmount,
        tier: transaction.tier,
        message: transaction.message,
        senderUsername: anonymous ? "Usuario Anónimo" : req.user.username
      });
    }

    return res.status(201).json({
      success: true,
      transaction: {
        _id: transaction._id,
        creatorId,
        amount: tipAmount,
        tier: transaction.tier,
        createdAt: transaction.createdAt
      }
    });
  } catch (error) {
    console.error("SUPPORT_TIP_ERROR:", error);
    return res.status(500).json({ error: "Error procesando apoyo al creador" });
  }
});

/**
 * GET /api/support/creator/:userId
 * Obtiene métricas y niveles de apoyo de un creador
 */
router.get("/creator/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: "ID de creador inválido" });
    }

    const creator = await User.findById(userId)
      .select("_id username displayName avatar bio")
      .lean();

    if (!creator) {
      return res.status(404).json({ error: "Creador no encontrado" });
    }

    const stats = await SupportTransaction.aggregate([
      { $match: { creator: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalStardust: { $sum: "$amount" },
          supportersCount: { $addToSet: "$sender" },
          totalTips: { $sum: 1 }
        }
      }
    ]);

    const result = stats[0] || { totalStardust: 0, supportersCount: [], totalTips: 0 };

    return res.json({
      creator: {
        _id: creator._id,
        username: creator.username,
        displayName: creator.displayName,
        avatar: creator.avatar
      },
      tiers: SUPPORT_TIERS,
      stats: {
        totalStardust: result.totalStardust || 0,
        uniqueSupporters: Array.isArray(result.supportersCount) ? result.supportersCount.length : 0,
        totalTips: result.totalTips || 0
      }
    });
  } catch (error) {
    console.error("GET_CREATOR_SUPPORT_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo datos del creador" });
  }
});

/**
 * GET /api/support/history
 * Historial de apoyos recibidos o enviados
 */
router.get("/history", auth, requireUser, async (req, res) => {
  try {
    const role = req.query.role === "sent" ? "sent" : "received";
    const filter = role === "sent" ? { sender: req.user.id } : { creator: req.user.id };

    const transactions = await SupportTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("sender", "_id username displayName avatar")
      .populate("creator", "_id username displayName avatar")
      .lean();

    return res.json({
      role,
      transactions: transactions.map((t) => ({
        _id: t._id,
        sender: t.anonymous && role !== "sent" ? { displayName: "Usuario Anónimo" } : t.sender,
        creator: t.creator,
        amount: t.amount,
        tier: t.tier,
        message: t.message,
        createdAt: t.createdAt
      }))
    });
  } catch (error) {
    console.error("GET_SUPPORT_HISTORY_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo historial" });
  }
});

module.exports = router;
module.exports.parseSupportAmount = parseSupportAmount;
module.exports.MAX_SUPPORT_AMOUNT = MAX_SUPPORT_AMOUNT;

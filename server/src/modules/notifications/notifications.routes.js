const express = require("express");
const mongoose = require("mongoose");
const Notification = require("./Notification");
const { NOTIFICATION_TYPES } = require("./Notification");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");

const { parsePagination } = require("../../utils/queryHelpers");

const router = express.Router();

// KRONOS-UI-024 — paginación por defecto (el límite histórico de 100
// sigue disponible como máximo por petición).
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/** KRONOS-UI-024 — valida el filtro `?type=` contra el catálogo. */
function parseTypeFilter(query = {}) {
  const raw = typeof query.type === "string" ? query.type.trim() : "";

  if (!raw) {
    return { types: null, error: null };
  }

  const types = [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))];

  const invalid = types.find((type) => !NOTIFICATION_TYPES.includes(type));

  if (invalid || types.length === 0) {
    return {
      types: null,
      error: {
        status: 400,
        body: {
          error: `Tipo de notificación no válido. Catálogo: ${NOTIFICATION_TYPES.join(", ")}`,
          code: "INVALID_TYPE"
        }
      }
    };
  }

  return { types, error: null };
}

// ---------------------------------------------------------------
// Lista de notificaciones (contrato original: { notifications,
// unreadCount }). Extensiones de este bloque:
//   023 — cada `type` viene del catálogo (NOTIFICATION_TYPES).
//   024 — `?type=follow,like&page=&limit=` con total/hasMore.
// `unreadCount` sigue siendo el total de no leídas (sin filtro).
// ---------------------------------------------------------------
router.get("/", auth, requireUser, async (req, res) => {
  try {
    const { types, error } = parseTypeFilter(req.query);

    if (error) {
      return res.status(error.status).json(error.body);
    }

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: DEFAULT_LIMIT, maxLimit: MAX_LIMIT });

    const filter = { recipient: req.user.id };

    if (types) {
      filter.type = { $in: types };
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .populate("actor", "username displayName avatar")
        .populate("post", "_id content")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({
        recipient: req.user.id,
        read: false
      })
    ]);

    return res.json({
      notifications,
      unreadCount,
      page,
      limit,
      total,
      hasMore: skip + notifications.length < total
    });
  } catch (error) {
    console.error("GET_NOTIFICATIONS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo notificaciones" });
  }
});

router.patch("/read-all", auth, requireUser, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, read: false },
      { $set: { read: true } }
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error("MARK_ALL_NOTIFICATIONS_READ_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando notificaciones" });
  }
});

router.patch("/:notificationId/read", auth, requireUser, async (req, res) => {
  try {
    const { notificationId } = req.params;

    if (!mongoose.isValidObjectId(notificationId)) {
      return res.status(400).json({ error: "ID de notificación inválido" });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: req.user.id },
      { $set: { read: true } },
      { new: true }
    ).lean();

    if (!notification) {
      return res.status(404).json({ error: "Notificación no encontrada" });
    }

    return res.json({ notification });
  } catch (error) {
    console.error("MARK_NOTIFICATION_READ_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando notificación" });
  }
});

module.exports = router;

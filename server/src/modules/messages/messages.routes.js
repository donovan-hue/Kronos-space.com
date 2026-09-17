const express = require("express");
const mongoose = require("mongoose");
const Message = require("./Message");
const User = require("../users/User");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const moderation = require("../moderation/moderation.service");

const router = express.Router();

const MAX_MESSAGE_LENGTH = 5000;

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

router.get("/", auth, requireUser, async (req, res) => {
  try {
    const currentUserId = new mongoose.Types.ObjectId(
      req.user.id
    );

    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: currentUserId },
            { receiver: currentUserId }
          ]
        }
      },
      {
        $sort: {
          createdAt: -1
        }
      },
      {
        $group: {
          _id: {
            $cond: [
              {
                $eq: ["$sender", currentUserId]
              },
              "$receiver",
              "$sender"
            ]
          },
          latestMessage: {
            $first: "$$ROOT"
          },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $eq: [
                        "$receiver",
                        currentUserId
                      ]
                    },
                    {
                      $eq: ["$read", false]
                    }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: {
          "latestMessage.createdAt": -1
        }
      },
      {
        $limit: 100
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: "$user"
      },
      {
        $project: {
          _id: 0,
          user: {
            _id: "$user._id",
            username: "$user.username",
            displayName: "$user.displayName",
            avatar: "$user.avatar"
          },
          latestMessage: {
            _id: "$latestMessage._id",
            text: "$latestMessage.text",
            sender: "$latestMessage.sender",
            receiver: "$latestMessage.receiver",
            createdAt: "$latestMessage.createdAt"
          },
          unreadCount: 1
        }
      }
    ]);

    return res.json({
      conversations
    });
  } catch (error) {
    console.error(
      "GET_CONVERSATIONS_ERROR:",
      error
    );

    return res.status(500).json({
      error: "Error obteniendo conversaciones"
    });
  }
});

router.get("/:userId", auth, requireUser, async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        error: "ID de usuario inválido"
      });
    }

    if (userId === req.user.id) {
      return res.status(400).json({
        error: "No puedes abrir una conversación contigo mismo"
      });
    }

    const user = await User.exists({
      _id: userId
    });

    if (!user) {
      return res.status(404).json({
        error: "Usuario no encontrado"
      });
    }

    if (await moderation.isBlockedBetween(req.user.id, userId)) {
      return res.status(403).json({
        error: "No puedes ver esta conversación por un bloqueo",
        code: "BLOCKED_RELATION"
      });
    }

    const messages = await Message.find({
      $or: [
        {
          sender: req.user.id,
          receiver: userId
        },
        {
          sender: userId,
          receiver: req.user.id
        }
      ]
    })
      .populate(
        "sender",
        "username displayName avatar"
      )
      .populate(
        "receiver",
        "username displayName avatar"
      )
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    return res.json({
      messages
    });
  } catch (error) {
    console.error(
      "GET_MESSAGES_ERROR:",
      error
    );

    return res.status(500).json({
      error: "Error obteniendo mensajes"
    });
  }
});

router.post("/:userId", auth, requireUser, async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        error: "ID de usuario inválido"
      });
    }

    if (userId === req.user.id) {
      return res.status(400).json({
        error: "No puedes enviarte mensajes a ti mismo"
      });
    }

    const user = await User.exists({
      _id: userId
    });

    if (!user) {
      return res.status(404).json({
        error: "Usuario no encontrado"
      });
    }

    if (await moderation.isBlockedBetween(req.user.id, userId)) {
      return res.status(403).json({
        error: "No puedes enviar mensajes por un bloqueo",
        code: "BLOCKED_RELATION"
      });
    }

    const text =
      typeof req.body.text === "string"
        ? req.body.text.trim()
        : "";

    if (!text) {
      return res.status(400).json({
        error: "El mensaje está vacío"
      });
    }

    if (text.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error:
          "El mensaje no puede superar 5000 caracteres"
      });
    }

    const message = await Message.create({
      sender: req.user.id,
      receiver: userId,
      text
    });

    await message.populate(
      "sender",
      "username displayName avatar"
    );

    await message.populate(
      "receiver",
      "username displayName avatar"
    );

    const io = req.app.get("io");

    if (io) {
      io.to(`user:${userId}`).emit(
        "message:new",
        message
      );
    }

    return res.status(201).json({
      message
    });
  } catch (error) {
    console.error(
      "SEND_MESSAGE_ERROR:",
      error
    );

    return res.status(500).json({
      error: "Error enviando mensaje"
    });
  }
});

router.patch(
  "/:userId/read",
  auth,
  requireUser,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      if (!isValidObjectId(userId)) {
        return res.status(400).json({
          error: "ID de usuario inválido"
        });
      }

      if (await moderation.isBlockedBetween(req.user.id, userId)) {
        return res.status(403).json({
          error: "Conversación no disponible por un bloqueo",
          code: "BLOCKED_RELATION"
        });
      }

      await Message.updateMany(
        {
          sender: userId,
          receiver: req.user.id,
          read: false
        },
        {
          $set: {
            read: true
          }
        }
      );

      return res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "MARK_MESSAGES_READ_ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "Error actualizando mensajes"
      });
    }
  }
);

module.exports = router;

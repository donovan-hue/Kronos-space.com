"use strict";

// Punto único de montaje HTTP: conserva el orden y los presupuestos.
const authRoutes = require("../modules/auth/auth.routes");
const sessionRoutes = require("../modules/auth/session.routes");
const userRoutes = require("../modules/users/users.routes");
const postRoutes = require("../modules/posts/posts.routes");
const messageRoutes = require("../modules/messages/messages.routes");
const conversationRoutes = require("../modules/conversations/conversations.routes");
const notificationRoutes = require("../modules/notifications/notifications.routes");
const moderationRoutes = require("../modules/moderation/moderation.routes");
const draftRoutes = require("../modules/drafts/drafts.routes");
const projectRoutes = require("../modules/projects/projects.routes");
const collectionRoutes = require("../modules/collections/collections.routes");
const circleRoutes = require("../modules/circles/circles.routes");
const orbitRoutes = require("../modules/orbits/orbits.routes");
const channelRoutes = require("../modules/channels/channels.routes");
const storyRoutes = require("../modules/stories/stories.routes");
const capsuleRoutes = require("../modules/capsules/capsules.routes");
const pulseRoutes = require("../modules/pulse/pulse.routes");
const analyticsRoutes = require("../modules/analytics/analytics.routes");
const musicRoutes = require("../modules/music/music.routes");
const voiceRoutes = require("../modules/voices/voices.routes");
const kairosRoutes = require("../modules/ai-core/routes/kairos.routes");
const audioUploadRoutes = require("../modules/music/audio.routes");
const imageRoutes = require("../modules/image-ai/image.routes");
const videoRoutes = require("../modules/video-ai/video.routes");
const scriptRoutes = require("../modules/script-ai/script.routes");
const chatRoutes = require("../modules/ai-core/routes/chat.routes");
const { router: searchRoutes } = require("../modules/search/search.routes");
const adminRoutes = require("../modules/admin/admin.routes");
const observabilityRoutes = require("../modules/observability/observability.routes");
const exportRoutes = require("../modules/export/export.routes");
const federationRoutes = require("../modules/federation/federation.routes");
const liveRoutes = require("../modules/live/live.routes");
const supportRoutes = require("../modules/support/support.routes");
const mcpRoutes = require("../modules/mcp/mcp.routes");

function registerRoutes(app, { authLimiter, abuseLimiter }) {
  // Ciclo de vida de la sesión (KRONOS-AUDIT-002). Se monta antes del
  // limitador estricto de credenciales: hidratar la sesión o cerrarla no
  // debe consumir el presupuesto de intentos de login.
  app.use("/api/auth", sessionRoutes);

  app.use(
    "/api/auth",
    authLimiter,
    authRoutes
  );

  app.use("/api/users", userRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/admin", abuseLimiter, adminRoutes);
  app.use("/api/observability", observabilityRoutes);
  app.use("/api/export", abuseLimiter, exportRoutes);
  app.use("/", federationRoutes);
  app.use("/api/live", abuseLimiter, liveRoutes);
  app.use("/api/support", abuseLimiter, supportRoutes);
  app.use("/api/mcp", mcpRoutes);
  app.use("/api/posts", abuseLimiter, postRoutes);
  app.use("/api/messages", abuseLimiter, messageRoutes);
  app.use("/api/conversations", abuseLimiter, conversationRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/moderation", abuseLimiter, moderationRoutes);
  app.use("/api/drafts", draftRoutes);
  app.use("/api/projects", abuseLimiter, projectRoutes);
  app.use("/api/collections", abuseLimiter, collectionRoutes);
  app.use("/api/circles", abuseLimiter, circleRoutes);
  app.use("/api/orbits", abuseLimiter, orbitRoutes);
  app.use("/api/channels", abuseLimiter, channelRoutes);
  app.use("/api/stories", abuseLimiter, storyRoutes);
  app.use("/api/capsules", abuseLimiter, capsuleRoutes);
  app.use("/api/pulse", abuseLimiter, pulseRoutes);
  app.use("/api/analytics", abuseLimiter, analyticsRoutes);
  app.use("/api/music", musicRoutes);
  app.use("/api/voices", voiceRoutes);
  app.use("/api/kairos", kairosRoutes);
  app.use("/api/uploads", abuseLimiter, audioUploadRoutes);
  app.use("/api/ai/images", imageRoutes);
  app.use("/api/ai/videos", videoRoutes);
  app.use("/api/ai/scripts", scriptRoutes);
  app.use("/api/ai", chatRoutes);
}

module.exports = { registerRoutes };

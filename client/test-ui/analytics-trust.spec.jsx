import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Analytics from "../src/features/analytics/Analytics";
import ModerationCenter from "../src/features/moderation/ModerationCenter";
import * as analyticsService from "../src/services/analyticsService";
import * as moderationService from "../src/services/moderationService";

vi.mock("../src/services/analyticsService", () => ({
  getCreatorAnalytics: vi.fn()
}));

vi.mock("../src/services/moderationService", () => ({
  getModerationOverview: vi.fn(),
  getBlockedUsers: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  getMutedUsers: vi.fn(),
  muteUser: vi.fn(),
  unmuteUser: vi.fn(),
  getHiddenPosts: vi.fn(),
  hidePost: vi.fn(),
  unhidePost: vi.fn(),
  createReport: vi.fn(),
  getMyReports: vi.fn(),
  getReportQueue: vi.fn(),
  updateReport: vi.fn(),
  appealReport: vi.fn(),
  getCommunityHealth: vi.fn(),
  hidePostAsModerator: vi.fn(),
  restorePostAsModerator: vi.fn()
}));

function analyticsPayload() {
  return {
    window: { from: "2026-08-22T00:00:00.000Z", to: "2026-09-21T00:00:00.000Z", days: 30 },
    followers: 12,
    totals: { posts: 3, likes: 10, comments: 4, saves: 2, remixes: 1 },
    timeline: [
      { date: "2026-09-20", posts: 1, interactions: 5 },
      { date: "2026-09-21", posts: 2, interactions: 0 }
    ],
    topPosts: [
      { _id: "p1", content: "La que resonó", mediaUrl: "", likes: 6, comments: 3, saves: 2, interactions: 11, createdAt: "2026-09-20T10:00:00.000Z" }
    ],
    scope: "Publicaciones creadas en la ventana; interacciones contadas sobre esas publicaciones."
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  analyticsService.getCreatorAnalytics.mockResolvedValue(analyticsPayload());
  moderationService.getModerationOverview.mockResolvedValue({ blocks: 0, mutes: 0, hidden: 0, reports: 0, isModerator: false });
  moderationService.getMyReports.mockResolvedValue({ reports: [], total: 0, page: 1, limit: 20, hasMore: false });
});

afterEach(() => cleanup());

test("la analítica muestra totales privados, serie y top con alcance honesto", async () => {
  render(
    <MemoryRouter>
      <Analytics />
    </MemoryRouter>
  );

  expect(await screen.findByText("La que resonó")).toBeTruthy();
  expect(screen.getByText("12")).toBeTruthy();
  expect(screen.getByText(/6 me gusta · 3 comentarios · 2 guardados/)).toBeTruthy();
  expect(screen.getByText(/Publicaciones creadas en la ventana/)).toBeTruthy();
  expect(analyticsService.getCreatorAnalytics).toHaveBeenCalledWith(30);
});

test("la ventana de la analítica se cambia y recarga", async () => {
  render(
    <MemoryRouter>
      <Analytics />
    </MemoryRouter>
  );

  await screen.findByText("La que resonó");
  fireEvent.click(screen.getByRole("tab", { name: "7 días" }));
  await waitFor(() => expect(analyticsService.getCreatorAnalytics).toHaveBeenCalledWith(7));
});

test("un reporte descartado se puede apelar y el estado queda visible", async () => {
  const dismissedReport = {
    _id: "report-1",
    targetType: "post",
    reason: "spam",
    details: "Enlace repetido",
    status: "dismissed",
    createdAt: "2026-09-18T10:00:00.000Z",
    appeal: null
  };
  moderationService.getMyReports.mockResolvedValue({ reports: [dismissedReport], total: 1, page: 1, limit: 20, hasMore: false });
  moderationService.appealReport.mockResolvedValue({ ...dismissedReport, appeal: { status: "submitted", text: "Revisen el historial completo, por favor." } });

  render(
    <MemoryRouter>
      <ModerationCenter />
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByRole("tab", { name: "Mis reportes" }));
  fireEvent.click(await screen.findByRole("button", { name: "Apelar este descarte" }));

  const textarea = await screen.findByLabelText("¿Por qué debe revisarse de nuevo?");
  fireEvent.change(textarea, { target: { value: "Revisen el historial completo, por favor." } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar apelación" }));

  await waitFor(() => expect(moderationService.appealReport).toHaveBeenCalledWith("report-1", "Revisen el historial completo, por favor."));
  expect(await screen.findByText(/Apelación enviada, en revisión/)).toBeTruthy();
});

test("la salud de comunidad solo aparece para moderadores", async () => {
  moderationService.getModerationOverview.mockResolvedValue({ blocks: 0, mutes: 0, hidden: 0, reports: 0, isModerator: true });
  moderationService.getReportQueue.mockResolvedValue({ reports: [], total: 0, page: 1, limit: 20, hasMore: false });
  moderationService.getCommunityHealth.mockResolvedValue({
    windowDays: 30,
    last30: {
      byStatus: { pending: 2, reviewing: 1, resolved: 5, dismissed: 3 },
      byReason: [{ reason: "spam", count: 4 }, { reason: "harassment", count: 2 }]
    },
    appeals: { submitted: 1, accepted: 0, rejected: 1 },
    queue: { totalReports: 11, pending: 2, reviewing: 1 }
  });

  render(
    <MemoryRouter>
      <ModerationCenter />
    </MemoryRouter>
  );

  expect(await screen.findByText("SALUD DE COMUNIDAD · ÚLTIMOS 30 DÍAS")).toBeTruthy();
  expect(screen.getByText("Motivos más frecuentes: spam (4) · harassment (2)")).toBeTruthy();

  // Con isModerator false la sección no existe.
  cleanup();
  moderationService.getModerationOverview.mockResolvedValue({ blocks: 0, mutes: 0, hidden: 0, reports: 0, isModerator: false });
  render(
    <MemoryRouter>
      <ModerationCenter />
    </MemoryRouter>
  );
  await screen.findByText("Bloqueados");
  expect(screen.queryByText("SALUD DE COMUNIDAD · ÚLTIMOS 30 DÍAS")).toBeNull();
  expect(moderationService.getCommunityHealth).toHaveBeenCalledTimes(1);
});

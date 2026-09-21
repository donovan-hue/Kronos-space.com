import { api } from "./apiClient";

/**
 * KRONOS-UI-014 — borradores del composer.
 * Los borradores siempre son del usuario autenticado: el cliente nunca
 * envía un `userId` para elegir dueño.
 */

function normalizeMedia(media) {
  if (!media?.url) return null;
  return {
    url: media.url,
    type: media.type === "video" ? "video" : "image",
    mimeType: media.mimeType || "",
    size: media.size || 0,
    alt: typeof media.alt === "string" ? media.alt.trim().slice(0, 500) : "",
    posterUrl: media.type === "video" && typeof media.posterUrl === "string" ? media.posterUrl.trim().slice(0, 2000) : ""
  };
}

function normalizeMediaItems(mediaItems) {
  const rawItems = Array.isArray(mediaItems) ? mediaItems.filter((item) => item?.url) : [];
  if (rawItems.length > 4) throw new Error("El carrusel no puede superar 4 imágenes");
  if (rawItems.some((item) => item.type === "video" || String(item.mimeType || "").startsWith("video/"))) {
    throw new Error("El carrusel solo acepta imágenes");
  }
  return rawItems.map((item) => ({
    url: item.url,
    type: "image",
    mimeType: item.mimeType || "",
    size: item.size || 0,
    alt: typeof item.alt === "string" ? item.alt.trim().slice(0, 500) : ""
  }));
}

function normalizeAudience(audience) {
  if (audience && typeof audience === "object" && audience.type === "circle") {
    return { type: "circle", circleId: String(audience.circleId || "") };
  }
  if (audience && typeof audience === "object" && audience.type === "orbit") {
    return { type: "orbit", orbitId: String(audience.orbitId || "") };
  }
  if (typeof audience === "string" && audience.startsWith("circle:")) {
    return { type: "circle", circleId: audience.slice("circle:".length) };
  }
  if (typeof audience === "string" && audience.startsWith("orbit:")) {
    return { type: "orbit", orbitId: audience.slice("orbit:".length) };
  }
  return { type: typeof audience === "string" ? audience : "public" };
}

function normalizePoll(poll) {
  if (!poll) return null;
  const question = typeof poll.question === "string" ? poll.question.trim() : "";
  const options = [...new Set((Array.isArray(poll.options) ? poll.options : []).map((option) => String(option?.text ?? option).trim()).filter(Boolean))];
  if (!question || question.length > 200 || options.length < 2 || options.length > 6 || options.some((option) => option.length > 120)) {
    throw new Error("La encuesta necesita una pregunta y entre 2 y 6 opciones válidas");
  }
  return { question, options, ...(poll.closesAt ? { closesAt: poll.closesAt } : {}) };
}

function normalizeEvent(event) {
  if (!event) return null;
  const title = typeof event.title === "string" ? event.title.trim() : "";
  const description = typeof event.description === "string" ? event.description.trim() : "";
  const locationType = event.locationType === "in_person" ? "in_person" : event.locationType === "online" ? "online" : "";
  const location = typeof event.location === "string" ? event.location.trim() : "";
  if (!title || title.length > 160 || description.length > 1000 || !event.startsAt || !locationType || location.length > 300 || (locationType === "in_person" && !location)) {
    throw new Error("El evento necesita título, fecha y datos válidos");
  }
  return {
    title,
    description,
    startsAt: event.startsAt,
    endsAt: event.endsAt || null,
    timezone: typeof event.timezone === "string" && event.timezone.trim() ? event.timezone.trim().slice(0, 64) : "UTC",
    locationType,
    location
  };
}

function buildPayload({ content, media, mediaItems, audience = "public", poll, event }) {
  const value = typeof content === "string" ? content.trim() : "";
  const normalizedPoll = normalizePoll(poll);
  const normalizedEvent = normalizeEvent(event);

  if (value.length > 5000) {
    throw new Error("El borrador no puede superar 5000 caracteres");
  }

  const payload = { content: value, audience: normalizeAudience(audience) };
  if (normalizedPoll) payload.poll = normalizedPoll;
  if (normalizedEvent) payload.event = normalizedEvent;
  const normalizedItems = normalizeMediaItems(mediaItems);
  if (normalizedItems.length) {
    payload.mediaItems = normalizedItems;
    payload.media = normalizedItems[0];
  } else {
    const normalizedMedia = normalizeMedia(media);
    if (normalizedMedia) payload.media = normalizedMedia;
  }

  if (!payload.content && !payload.media && !payload.mediaItems?.length && !payload.poll && !payload.event) {
    throw new Error("El borrador no puede quedar vacío");
  }

  return payload;
}

export async function getDrafts({ page = 1, limit = 20 } = {}) {
  const { data } = await api.get("/drafts", { params: { page, limit } });

  return data;
}

export async function createDraft({ content, media, mediaItems = [], audience = "public", poll, event } = {}) {
  const { data } = await api.post("/drafts", buildPayload({ content, media, mediaItems, audience, poll, event }));

  return data.draft;
}

export async function updateDraft(draftId, { content, media, mediaItems = [], audience = "public", poll, event } = {}) {
  const { data } = await api.patch(`/drafts/${draftId}`, buildPayload({ content, media, mediaItems, audience, poll, event }));

  return data.draft;
}

export async function deleteDraft(draftId) {
  const { data } = await api.delete(`/drafts/${draftId}`);

  return data;
}

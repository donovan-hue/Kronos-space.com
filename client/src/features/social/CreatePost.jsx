import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { createPost, uploadMedia } from "../../services/postsService";
import { subirVoz } from "../../services/voiceService";
import { sendKairosMessage } from "../../services/aiService";
import { createDraft, deleteDraft, getDrafts, updateDraft } from "../../services/draftsService";
import { getCircles } from "../../services/circlesService";
import { mediaUrl } from "../../services/mediaUrl";
import ImageEditor from "../../components/media/ImageEditor";
import { formatearTiempo } from "../../lib/mediaStudio";
import MediaStudio from "../../components/media/MediaStudio";

/**
 * Composer de publicaciones.
 * - KRONOS-UI-013: texto + imagen/video con texto alternativo.
 * - KRONOS-UI-014: borradores persistidos (no viven en el navegador),
 *   con reanudación y borrado explícito.
 */
// Bloque 14: los borradores persistidos forman parte de la experiencia
// principal del editor; nunca se almacenan únicamente en el navegador.
const DRAFTS_ENABLED = true;
const MAX_DRAFTS_SHOWN = 5;
const MAX_CAROUSEL_IMAGES = 4;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function formatDraftDate(value) {
  if (!value) return "Sin fecha";

  try {
    return new Date(value).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "Sin fecha";
  }
}

function objectUrl(file) {
  return URL.createObjectURL(file);
}

function revokeObjectUrl(url) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

function localId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isUploadedUrl(value) {
  return typeof value === "string" && (value.startsWith("/uploads/") || /^https?:\/\//i.test(value));
}

function mediaSource(value) {
  return value?.startsWith("/uploads/") ? mediaUrl(value) : value;
}

function toExistingItem(item) {
  return {
    id: localId(),
    file: null,
    url: item.url,
    preview: item.url,
    type: item.type === "video" ? "video" : "image",
    mimeType: item.mimeType || "",
    size: item.size || 0,
    alt: item.alt || ""
  };
}

function draftMediaItems(draft) {
  const items = Array.isArray(draft.mediaItems) ? draft.mediaItems.filter((item) => item?.url) : [];
  if (items.length) return items.map(toExistingItem).slice(0, MAX_CAROUSEL_IMAGES);
  if (draft.media?.url && draft.media.type !== "video") return [toExistingItem(draft.media)];
  return [];
}

export default function CreatePost({ onCreated, compact = false, embedded = false }) {
  const [searchParams] = useSearchParams();
  // En el feed (compact) el composer inicia plegado: solo una fila.
  // Se expande al tocarla y se vuelve a plegar tras publicar.
  const [expanded, setExpanded] = useState(!compact);
  const [content, setContent] = useState("");
  const [poll, setPoll] = useState(null);
  const [event, setEvent] = useState(null);
  const [audience, setAudience] = useState("public");
  const [circles, setCircles] = useState([]);
  const [file, setFile] = useState(null); // video local; imágenes viven en carouselItems
  const [imageEditorTarget, setImageEditorTarget] = useState(null);
  const [estudio, setEstudio] = useState(null);
  const [videoReceta, setVideoReceta] = useState(null);
  // Línea de tiempo del video: los clips en orden con su referencia, y los
  // archivos que hay que subir al publicar (el clip 1 ya es el video subido).
  const [videoLinea, setVideoLinea] = useState(null);
  // Voz en off grabada en el estudio: se sube al publicar, como los clips.
  const [vozEnOff, setVozEnOff] = useState(null);
  const [preview, setPreview] = useState(""); // video o media legacy reanudada
  const [mediaType, setMediaType] = useState("");
  const [carouselItems, setCarouselItems] = useState([]);
  const [alt, setAlt] = useState("");
  const [videoPoster, setVideoPoster] = useState("");
  const [videoSize, setVideoSize] = useState(null); // dimensiones reales del video (para el feed vertical)
  const [videoTrim, setVideoTrim] = useState({ start: 0, end: 0, muted: false });
  const [videoDuration, setVideoDuration] = useState(0);
  const [kairos, setKairos] = useState({ loading: false, suggestion: "", error: "" });
  const [posterUploading, setPosterUploading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inputRef = useRef(null);
  const [drafts, setDrafts] = useState([]);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsError, setDraftsError] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    if (compact || !DRAFTS_ENABLED) return undefined;

    let active = true;

    setDraftsLoading(true);

    getDrafts({ limit: MAX_DRAFTS_SHOWN })
      .then((data) => {
        if (active) setDrafts(Array.isArray(data?.drafts) ? data.drafts : []);
      })
      .catch((requestError) => {
        if (active) setDraftsError(requestError.response?.data?.error || "No se pudieron cargar los borradores.");
      })
      .finally(() => {
        if (active) setDraftsLoading(false);
      });

    return () => { active = false; };
  }, [compact]);

  useEffect(() => {
    let active = true;
    getCircles()
      .then((items) => {
        if (active) setCircles(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (active) setCircles([]);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const circleParam = searchParams.get("circleId");
    if (circleParam) setAudience(`circle:${circleParam}`);
  }, [searchParams]);

  function clearMedia() {
    revokeObjectUrl(preview);
    carouselItems.forEach((item) => revokeObjectUrl(item.preview));
    setFile(null);
    setImageEditorTarget(null);
    setPreview("");
    setMediaType("");
    setCarouselItems([]);
    setAlt("");
    setVideoPoster("");
    setVideoSize(null);
    setVideoLinea(null);
    setVozEnOff(null);
    setPosterUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function requestCancel() {
    if (content.trim() || preview || carouselItems.length || poll || event) {
      setConfirmingCancel(true);
      return;
    }
    if (compact) setExpanded(false);
  }

  function discardComposer() {
    setContent("");
    setPoll(null);
    setEvent(null);
    setAudience("public");
    clearMedia();
    setError("");
    setSuccess("");
    setActiveDraftId("");
    setConfirmingCancel(false);
    if (compact) setExpanded(false);
  }

  function validateImage(fileToCheck) {
    if (!IMAGE_TYPES.has(fileToCheck.type)) return "Formato no permitido. Usa imagen JPG, PNG o WebP.";
    if (fileToCheck.size > 10 * 1024 * 1024) return "La imagen no puede superar 10 MB";
    return "";
  }

  function validateVideo(fileToCheck) {
    if (!VIDEO_TYPES.has(fileToCheck.type)) return "Formato no permitido. Usa video MP4, WebM o MOV.";
    if (fileToCheck.size > 50 * 1024 * 1024) return "El video no puede superar 50 MB";
    return "";
  }

  // Fase 7 — Kairos contextual en el compositor. Sugiere, nunca publica:
  // el texto solo cambia si el usuario lo confirma.
  async function improveWithKairos() {
    if (kairos.loading) return;
    setKairos({ loading: true, suggestion: "", error: "" });
    try {
      const data = await sendKairosMessage({
        message: `Mejora este texto para una publicación social, manteniendo el sentido y el idioma. Devuelve solo el texto mejorado, sin explicaciones:\n\n${content.trim() || "(escribe un borrador primero)"}`
      });
      const suggestion = typeof data?.text === "string" ? data.text.trim() : "";
      if (!suggestion) throw new Error("Kairos no devolvió una sugerencia.");
      setKairos({ loading: false, suggestion, error: "" });
    } catch (requestError) {
      setKairos({
        loading: false,
        suggestion: "",
        error: requestError?.response?.data?.error || requestError?.message || "Kairos no pudo sugerir ahora."
      });
    }
  }

  // Fase 3: las dimensiones reales del video viajan con la publicación
  // para que el feed vertical separe verticales de horizontales.
  function handleVideoMetadata(event) {
    const video = event.currentTarget;
    if (video?.videoWidth && video?.videoHeight) {
      setVideoSize({ width: video.videoWidth, height: video.videoHeight });
    }
    if (video?.duration && Number.isFinite(video.duration)) {
      const dur = Math.round(video.duration);
      setVideoDuration(dur);
      setVideoTrim((prev) => ({ ...prev, end: prev.end || dur }));
    }
  }

  function handleFileChange(event) {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length) return;

    const images = selectedFiles.filter((selected) => IMAGE_TYPES.has(selected.type));
    const videos = selectedFiles.filter((selected) => VIDEO_TYPES.has(selected.type));

    if (images.length + videos.length !== selectedFiles.length) {
      setError("Formato no permitido. Usa imágenes JPG/PNG/WebP o video MP4/WebM/MOV.");
      return;
    }

    if (images.length && videos.length) {
      setError("Elige hasta 4 imágenes o un solo video, no ambos en la misma publicación.");
      return;
    }

    if (videos.length) {
      if (videos.length > 1) {
        setError("Solo puedes adjuntar un video por publicación.");
        return;
      }
      const validation = validateVideo(videos[0]);
      if (validation) {
        setError(validation);
        return;
      }
      clearMedia();
      setError("");
      setFile(videos[0]);
      setPreview(objectUrl(videos[0]));
      setMediaType("video");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (images.length > MAX_CAROUSEL_IMAGES) {
      setError(`Puedes publicar de 1 a ${MAX_CAROUSEL_IMAGES} imágenes por carrusel.`);
      return;
    }

    const invalidImage = images.map(validateImage).find(Boolean);
    if (invalidImage) {
      setError(invalidImage);
      return;
    }

    clearMedia();
    setError("");
    setMediaType("image");

    if (images.length === 1) {
      setEstudio({ kind: "image", file: images[0], itemId: "" });
      return;
    }

    setCarouselItems(images.map((imageFile) => ({
      id: localId(),
      file: imageFile,
      url: "",
      preview: objectUrl(imageFile),
      type: "image",
      mimeType: imageFile.type,
      size: imageFile.size,
      alt: ""
    })));
    if (inputRef.current) inputRef.current.value = "";
  }

  // Adopta una imagen ya editada (del editor clásico o del estudio) dentro
  // del compositor. `itemId` vacío significa "foto nueva".
  function adoptarImagenEditada(editedFile, itemId, meta = null) {
    if (!editedFile) return;
    const nextPreview = objectUrl(editedFile);
    const focalPoint = meta?.focalPoint
      ? { x: Math.min(1, Math.max(0, Number(meta.focalPoint.x) || 0.5)), y: Math.min(1, Math.max(0, Number(meta.focalPoint.y) || 0.5)) }
      : null;
    const nextItem = {
      id: itemId || localId(),
      file: editedFile,
      url: "",
      preview: nextPreview,
      type: "image",
      mimeType: editedFile.type,
      size: editedFile.size,
      alt: "",
      focalPoint
    };

    setCarouselItems((currentItems) => {
      if (!itemId) return [nextItem];
      return currentItems.map((item) => {
        if (item.id !== itemId) return item;
        revokeObjectUrl(item.preview);
        return { ...nextItem, alt: item.alt || "" };
      });
    });
    setFile(null);
    setPreview("");
    setMediaType("image");
    if (inputRef.current) inputRef.current.value = "";
  }

  // El editor clásico (carrusel y ajustes finos) sigue existiendo: solo
  // aporta su propio destino y cierra su diálogo.
  function applyEditedImage(editedFile, meta = null) {
    if (!editedFile || !imageEditorTarget) return;
    adoptarImagenEditada(editedFile, imageEditorTarget.itemId, meta);
    setImageEditorTarget(null);
  }

  function applyStudio(resultado) {
    if (!resultado) return;
    if (resultado.tipo === "video" && resultado.archivo) {
      const errorVideo = validateVideo(resultado.archivo);
      if (errorVideo) { setError(errorVideo); return; }
      clearMedia(); setError(""); setFile(resultado.archivo); setPreview(objectUrl(resultado.archivo)); setMediaType("video");
      setVideoReceta(null); setVideoDuration(resultado.duration); setVideoSize({ width: resultado.width, height: resultado.height });
      setVideoTrim({ start: 0, end: resultado.duration, muted: false }); setEstudio(null);
      return;
    }
    if (resultado.tipo === "video") {
      setVideoReceta(resultado.receta);
      setVideoLinea(resultado.receta.clips?.length > 0 ? { clips: resultado.linea, archivos: resultado.archivos || [] } : null);
      setVozEnOff(resultado.voz?.file ? resultado.voz : null);
      setVideoTrim({
        start: resultado.receta.corte.inicio,
        end: resultado.receta.corte.fin,
        muted: resultado.receta.corte.silenciar
      });
      if (resultado.portada) {
        setPosterUploading(true);
        uploadMedia(resultado.portada)
          .then((subida) => setVideoPoster(subida?.url || ""))
          .catch(() => setError("No se pudo subir la portada elegida."))
          .finally(() => setPosterUploading(false));
      }
      setEstudio(null);
      return;
    }
    adoptarImagenEditada(resultado.archivo, estudio?.itemId || "");
    setEstudio(null);
  }

  // Sube los clips agregados y arma la línea de tiempo con direcciones
  // reales: el clip principal usa la dirección del video que ya se subió.
  async function componerLineaDeTiempo(urlPrincipal) {
    const clips = videoLinea?.clips || [];
    if (!clips.length) return null;

    const subidas = new Map();
    for (const archivo of videoLinea.archivos || []) {
      if (!archivo?.file) continue;
      const subido = await uploadMedia(archivo.file);
      if (subido?.url) subidas.set(archivo.ref, subido.url);
    }

    const armados = clips
      .map((clip) => ({
        url: clip.ref === "principal" ? urlPrincipal : subidas.get(clip.ref) || "",
        tipo: clip.tipo === "image" ? "image" : "video",
        duracion: Number(clip.duracion) || 0,
        inicio: Number(clip.inicio) || 0,
        fin: Number(clip.fin) || Number(clip.duracion) || 0,
        velocidad: Number(clip.velocidad) || 1,
        transicion: {
          tipo: clip.transicion?.tipo || "corte",
          duracion: Number(clip.transicion?.duracion) || 0
        }
      }));

    if (armados.some((clip) => !clip.url)) throw new Error("No se pudieron subir todos los clips. Reintenta antes de publicar la secuencia.");

    // La duración es la de la pieza ya montada: el tramo repartido entre la
    // velocidad, igual que lo cuenta el motor del estudio.
    const duracionTotal = Math.round(armados.reduce(
      (suma, clip) => suma + (clip.tipo === "video" ? Math.max(0, clip.fin - clip.inicio) / (clip.velocidad || 1) : clip.duracion),
      0
    ) * 100) / 100;

    return { clips: armados, duracionTotal };
  }

  function cancelImageEditor() {
    setImageEditorTarget(null);
    if (!carouselItems.length) setMediaType("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function editCarouselItem(item) {
    if (!item.file) {
      setError("Esta imagen ya está subida. Para volver a editarla, selecciónala de nuevo.");
      return;
    }
    setError("");
    setImageEditorTarget({ file: item.file, itemId: item.id });
  }

  function removeCarouselItem(itemId) {
    setCarouselItems((currentItems) => {
      const target = currentItems.find((item) => item.id === itemId);
      revokeObjectUrl(target?.preview);
      const nextItems = currentItems.filter((item) => item.id !== itemId);
      if (!nextItems.length) setMediaType("");
      return nextItems;
    });
  }

  function setCarouselAlt(itemId, value) {
    setCarouselItems((currentItems) => currentItems.map((item) => (
      item.id === itemId ? { ...item, alt: value.slice(0, 500) } : item
    )));
  }

  async function uploadCarouselItems() {
    const uploaded = await Promise.all(carouselItems.map(async (item) => {
      if (item.url) {
        return {
          url: item.url,
          type: "image",
          mimeType: item.mimeType || "",
          size: item.size || 0,
          alt: item.alt.trim().slice(0, 500),
          ...(item.focalPoint ? { focalPoint: item.focalPoint } : {})
        };
      }

      if (!item.file) throw new Error("No se pudo leer una imagen del carrusel.");
      const media = await uploadMedia(item.file);
      if (media.type === "video") throw new Error("El carrusel solo acepta imágenes.");
      return {
        url: media.url,
        type: "image",
        mimeType: media.mimeType || item.mimeType || "",
        size: media.size || item.size || 0,
        ...(item.focalPoint ? { focalPoint: item.focalPoint } : {}),
        alt: item.alt.trim().slice(0, 500)
      };
    }));

    return uploaded;
  }

  function startPoll() {
    setPoll({ question: "", options: ["", ""] });
    setError("");
  }

  function startEvent() {
    const startsAt = new Date(Date.now() + 60 * 60 * 1000);
    startsAt.setSeconds(0, 0);
    const defaultStart = new Date(startsAt.getTime() - startsAt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEvent({ title: "", description: "", startsAt: defaultStart, endsAt: null, timezone: "UTC", locationType: "online", location: "" });
    setError("");
  }

  function updateEventField(field, value) {
    setEvent((current) => current ? { ...current, [field]: value } : current);
  }

  function updatePollField(field, value) {
    setPoll((current) => current ? { ...current, [field]: value } : current);
  }

  function updatePollOption(index, value) {
    setPoll((current) => current ? {
      ...current,
      options: current.options.map((option, optionIndex) => optionIndex === index ? value : option)
    } : current);
  }

  function addPollOption() {
    setPoll((current) => current && current.options.length < 6 ? { ...current, options: [...current.options, ""] } : current);
  }

  function removePollOption(index) {
    setPoll((current) => current && current.options.length > 2
      ? { ...current, options: current.options.filter((_, optionIndex) => optionIndex !== index) }
      : current);
  }

  async function handleSaveDraft() {
    if (savingDraft || uploading) return;
    const value = content.trim();

    if (!value && !preview && !carouselItems.length && !poll && !event) {
      setError("Escribe algo, añade una imagen/video o crea una encuesta antes de guardar el borrador.");
      return;
    }

    setSavingDraft(true);
    setError("");
    setSuccess("");
    setDraftsError("");

    try {
      const payload = {
        content: value,
        audience,
        media: undefined,
        mediaItems: undefined,
        poll,
        event
      };

      setUploading(true);
      try {
        if (carouselItems.length) {
          const mediaItems = await uploadCarouselItems();
          payload.mediaItems = mediaItems;
          payload.media = mediaItems[0];
        } else if (file) {
          const media = await uploadMedia(file);
          payload.media = { url: media.url, type: media.type, mimeType: media.mimeType, size: media.size, alt, posterUrl: media.type === "video" ? videoPoster : "", ...(media.type === "video" && videoSize ? { width: videoSize.width, height: videoSize.height } : {}) };
        } else if (preview && isUploadedUrl(preview)) {
          payload.media = { url: preview, type: mediaType === "video" ? "video" : "image", alt, posterUrl: mediaType === "video" ? videoPoster : "", ...(mediaType === "video" && videoSize ? { width: videoSize.width, height: videoSize.height } : {}) };
        }
      } finally {
        setUploading(false);
      }

      const draft = activeDraftId
        ? await updateDraft(activeDraftId, payload)
        : await createDraft(payload);

      setActiveDraftId(draft._id);
      setDrafts(current => [draft, ...current.filter(item => item._id !== draft._id)].slice(0, MAX_DRAFTS_SHOWN));
      setSuccess("Borrador guardado. Puedes salir y continuar después.");
    } catch (requestError) {
      const code = requestError.response?.data?.code;
      setError(
        code === "DRAFT_LIMIT"
          ? requestError.response.data.error
          : requestError.response?.data?.error || requestError.message || "No se pudo guardar el borrador."
      );
    } finally {
      setSavingDraft(false);
      setUploading(false);
    }
  }

  function resumeDraft(draft) {
    clearMedia();
    setContent(draft.content || "");
    setPoll(draft.poll ? {
      question: draft.poll.question || "",
      options: Array.isArray(draft.poll.options) ? draft.poll.options.map((option) => option.text || option).slice(0, 6) : [],
      ...(draft.poll.closesAt ? { closesAt: String(draft.poll.closesAt).slice(0, 16) } : {})
    } : null);
    setEvent(draft.event ? {
      title: draft.event.title || "",
      description: draft.event.description || "",
      startsAt: draft.event.startsAt ? String(draft.event.startsAt).slice(0, 16) : "",
      endsAt: draft.event.endsAt ? String(draft.event.endsAt).slice(0, 16) : null,
      timezone: draft.event.timezone || "UTC",
      locationType: draft.event.locationType || "online",
      location: draft.event.location || ""
    } : null);
    setAudience(
      draft.audience?.type === "circle"
        ? `circle:${draft.audience.circleId}`
        : draft.audience?.type || "public"
    );
    setActiveDraftId(draft._id);
    setSuccess("Borrador reanudado.");
    setError("");

    const draftImages = draftMediaItems(draft);
    if (draftImages.length) {
      setCarouselItems(draftImages);
      setMediaType("image");
      return;
    }

    if (draft.media?.url) {
      setPreview(draft.media.url);
      setMediaType(draft.media.type === "video" ? "video" : "image");
      setAlt(draft.media.alt || "");
      setVideoPoster(draft.media.type === "video" ? draft.media.posterUrl || "" : "");
    }
  }

  async function removeDraft(draftId) {
    setDraftsError("");

    try {
      await deleteDraft(draftId);
      setDrafts(current => current.filter(item => item._id !== draftId));
      if (activeDraftId === draftId) setActiveDraftId("");
    } catch (requestError) {
      setDraftsError(requestError.response?.data?.error || "No se pudo eliminar el borrador.");
    }
  }

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
    const value = content.trim();
    const hasMedia = Boolean(file || preview || carouselItems.length);
    if ((!value && !hasMedia && !poll && !event) || creating || uploading) return;
    if (value.length > 5000) {
      setError("La publicación no puede superar 5000 caracteres");
      return;
    }
    if (alt.length > 500 || carouselItems.some((item) => item.alt.length > 500)) {
      setError("El texto alternativo no puede superar 500 caracteres");
      return;
    }
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      let media = null;
      let mediaItems = [];
      setUploading(true);
      try {
        if (carouselItems.length) {
          mediaItems = await uploadCarouselItems();
          media = mediaItems[0];
        } else if (file) {
          const uploaded = await uploadMedia(file);
          media = {
            ...uploaded,
            posterUrl: uploaded.type === "video" ? videoPoster : "",
            ...(uploaded.type === "video" ? {
              width: videoSize?.width || 0,
              height: videoSize?.height || 0,
              duration: videoDuration,
              trim: videoTrim,
              music: videoReceta?.musica || null,
              edit: videoReceta || null,
              // Sin subtítulos. Antes se fabricaba una pista con el texto del
              // post como `vttContent`: no es WebVTT válido (falta la cabecera
              // y los tiempos), el navegador no podía parsearla y el feed
              // vertical la pintaba encima del video duplicando el texto. No
              // hay control que los capture, así que no se envía nada. La ruta
              // PATCH /api/posts/:id/subtitles y el render de <track> siguen en
              // pie para cuando exista VTT de verdad.
              subtitles: []
            } : {})
          };
        } else if (preview && isUploadedUrl(preview)) {
          media = {
            url: preview,
            type: mediaType === "video" ? "video" : "image",
            alt,
            posterUrl: mediaType === "video" ? videoPoster : "",
            ...(mediaType === "video" ? {
              width: videoSize?.width || 0,
              height: videoSize?.height || 0,
              duration: videoDuration,
              trim: videoTrim,
              music: videoReceta?.musica || null,
              edit: videoReceta || null,
              // Sin subtítulos. Antes se fabricaba una pista con el texto del
              // post como `vttContent`: no es WebVTT válido (falta la cabecera
              // y los tiempos), el navegador no podía parsearla y el feed
              // vertical la pintaba encima del video duplicando el texto. No
              // hay control que los capture, así que no se envía nada. La ruta
              // PATCH /api/posts/:id/subtitles y el render de <track> siguen en
              // pie para cuando exista VTT de verdad.
              subtitles: []
            } : {})
          };
        }

        // La línea de tiempo y la voz en off se componen al final, cuando ya
        // existe la dirección del clip principal: aquí se sube lo demás.
        if (media?.type === "video" && vozEnOff?.file) {
          const subida = await subirVoz(vozEnOff.file);
          const { file, ...vozConTramo } = vozEnOff;
          media.edit = {
            ...(media.edit || {}),
            version: media.edit?.version || 1,
            voz: { ...vozConTramo, url: subida.url, tipo: "propia", voiceId: "" }
          };
        }

        if (media?.type === "video" && videoLinea?.clips?.length > 0) {
          const linea = await componerLineaDeTiempo(media.url);
          const receta = { ...(media.edit || {}), version: media.edit?.version || 1 };
          if (linea) {
            receta.clips = linea.clips;
            receta.duracionTotal = linea.duracionTotal;
          } else {
            // Sin direcciones para todos los clips, la pieza sale con el
            // video completo: más vale eso que una receta que no se puede leer.
            delete receta.clips;
            delete receta.duracionTotal;
          }
          media.edit = receta;
        }
      } finally {
        setUploading(false);
      }
      const postOptions = { media, mediaItems, alt };
      if (poll) postOptions.poll = poll;
      if (event) postOptions.event = event;
      if (audience !== "public") postOptions.audience = audience;
      const post = await createPost(value, postOptions);
      if (!post) throw new Error("INVALID_POST_RESPONSE");
      setContent("");
      setPoll(null);
      setEvent(null);
      setAudience("public");
      clearMedia();
      setSuccess("Publicación creada.");
      if (compact) setExpanded(false);
      // El borrador que se acaba de publicar ya no sirve: se elimina
      // para que no quede contenido duplicado en la lista.
      if (activeDraftId) {
        const publishedDraftId = activeDraftId;
        setActiveDraftId("");
        setDrafts(current => current.filter(item => item._id !== publishedDraftId));
        deleteDraft(publishedDraftId).catch(() => {});
      }
      if (typeof onCreated === "function") onCreated(post);
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 401) setError("Tu sesión expiró. Inicia sesión de nuevo.");
      else if (status === 429) setError("Demasiadas publicaciones. Espera un momento.");
      else setError(requestError.response?.data?.error || requestError.message || "No se pudo crear la publicación.");
    } finally {
      setCreating(false);
      setUploading(false);
    }
  }

  const isBusy = creating || uploading || posterUploading;
  const canSubmit = Boolean(content.trim() || preview || carouselItems.length || poll?.question?.trim() || event?.title?.trim());
  const isVideoPreview = mediaType === "video" || Boolean(file?.type?.startsWith("video/"));
  const previewLabel = isVideoPreview ? "Descripción del video (opcional, máx 500)" : "Texto alternativo (opcional, máx 500)";

  // Modo compacto plegado (feed): una sola fila, sin cuadro gigante.
  if (compact && !expanded) {
    return (
      <section className="k-composer k-composer-collapsed">
        <button
          type="button"
          className="k-composer-trigger"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
        >
          <span className="k-composer-trigger-hint">¿Qué quieres compartir?</span>
        </button>
        {success && (
          <p className="k-state k-state-success" role="status">
            {success}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className={compact ? "k-composer" : embedded ? "k-create-page" : "page k-create-page"}>
      {!compact && !embedded && (
        <header className="k-page-header">
          <div>
            <p className="k-eyebrow">KRONOS SOCIAL</p>
            <h1>Crear publicación</h1>
            <p>Comparte texto, imágenes, video o un carrusel con tu comunidad.</p>
          </div>
          <Link className="k-button k-button-ghost" to="/home">
            Volver a Inicio
          </Link>
        </header>
      )}

      <div className={compact ? undefined : "k-composer"}>
        <div className="k-composer-heading">
          <div>
            <h2>¿Qué quieres compartir?</h2>
          </div>
          {compact && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                className="k-button k-button-ghost"
                onClick={requestCancel}
                aria-label="Cancelar edición"
              >
                Cancelar
              </button>
              <Link className="k-button k-button-ghost" to="/create/post">
                Editor completo
              </Link>
            </div>
          )}
        </div>
      {error && (
        <p className="k-state k-state-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="k-state k-state-success" role="status">
          {success}
        </p>
      )}
      <MediaStudio
          open={Boolean(estudio)}
          kind={estudio?.kind === "video" ? "video" : "image"}
          file={estudio?.file || null}
          previewUrl={estudio?.kind === "video" ? preview : ""}
          duracionInicial={videoTrim.end || videoDuration || 0}
          guion={content}
          onApply={applyStudio}
          onCancel={() => setEstudio(null)}
          title={estudio?.kind === "video" ? "Estudio del video" : "Estudio de la foto"}
        />
        <ImageEditor
        file={imageEditorTarget?.file}
        onApply={applyEditedImage}
        onCancel={cancelImageEditor}
        title="Editar imagen del post"
        description="Recorta, centra, ajusta zoom, rota y elige JPG, PNG o WebP antes de publicar."
        defaultAspect="original"
        outputNamePrefix="kronos-post"
      />
      <form onSubmit={handleSubmit}>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={5000}
          placeholder="Escribe una idea, una observación o una pregunta..."
          aria-label="Contenido de la publicación"
          disabled={isBusy}
        />
        <div className="k-composer-kairos">
          <button type="button" className="k-button k-button-ghost" onClick={improveWithKairos} disabled={isBusy || kairos.loading}>
            {kairos.loading ? "Pensando..." : "Mejorar con Kairos"}
          </button>
          {kairos.error && <span className="k-state k-state-error" role="alert">{kairos.error}</span>}
          {kairos.suggestion && (
            <div className="k-composer-kairos-suggestion" role="region" aria-label="Sugerencia de Kairos">
              <p>{kairos.suggestion}</p>
              <span className="k-inline-actions">
                <button
                  type="button"
                  className="k-button k-button-primary"
                  onClick={() => {
                    setContent(kairos.suggestion.slice(0, 5000));
                    setKairos({ loading: false, suggestion: "", error: "" });
                  }}
                >
                  Usar esta versión
                </button>
                <button
                  type="button"
                  className="k-button k-button-ghost"
                  onClick={() => setKairos({ loading: false, suggestion: "", error: "" })}
                >
                  Descartar
                </button>
              </span>
            </div>
          )}
        </div>

        {!poll && (
          <button type="button" className="k-button k-button-ghost" onClick={startPoll} disabled={isBusy} style={{ marginTop: 8 }}>
            Añadir encuesta
          </button>
        )}
        {poll && (
          <fieldset className="k-poll-composer">
            <legend>Encuesta</legend>
            <label>
              Pregunta
              <input value={poll.question} onChange={(event) => updatePollField("question", event.target.value.slice(0, 200))} maxLength={200} placeholder="¿Qué opinas?" disabled={isBusy} />
            </label>
            {poll.options.map((option, index) => (
              <label key={`poll-option-${index}`} className="k-poll-option-input">
                <span>{index + 1}.</span>
                <input value={option} onChange={(event) => updatePollOption(index, event.target.value.slice(0, 120))} maxLength={120} placeholder={`Opción ${index + 1}`} disabled={isBusy} />
                {poll.options.length > 2 && <button type="button" className="k-button k-button-ghost" onClick={() => removePollOption(index)} disabled={isBusy} aria-label={`Quitar opción ${index + 1}`}>×</button>}
              </label>
            ))}
            <div className="k-button-group">
              {poll.options.length < 6 && <button type="button" className="k-button k-button-ghost" onClick={addPollOption} disabled={isBusy}>Añadir opción</button>}
              <label>
                Cierra el
                <input type="datetime-local" value={poll.closesAt || ""} onChange={(event) => updatePollField("closesAt", event.target.value || null)} disabled={isBusy} />
              </label>
              <button type="button" className="k-button k-button-ghost" onClick={() => setPoll(null)} disabled={isBusy}>Quitar encuesta</button>
            </div>
            <small className="k-muted">Entre 2 y 6 opciones. Puedes cambiar tu voto mientras esté abierta. Cierre opcional, máximo 30 días.</small>
          </fieldset>
        )}

        {!event && (
          <button type="button" className="k-button k-button-ghost" onClick={startEvent} disabled={isBusy} style={{ marginTop: 8 }}>
            Añadir evento
          </button>
        )}
        {event && (
          <fieldset className="k-event-composer">
            <legend>Evento</legend>
            <label>
              Título del evento
              <input value={event.title} onChange={(inputEvent) => updateEventField("title", inputEvent.target.value.slice(0, 160))} maxLength={160} placeholder="Nombre del encuentro" disabled={isBusy} />
            </label>
            <label>
              Descripción
              <textarea value={event.description} onChange={(inputEvent) => updateEventField("description", inputEvent.target.value.slice(0, 1000))} maxLength={1000} placeholder="¿Qué sucederá?" disabled={isBusy} />
            </label>
            <div className="k-event-dates">
              <label>
                Comienza
                <input type="datetime-local" value={event.startsAt || ""} onChange={(inputEvent) => updateEventField("startsAt", inputEvent.target.value)} disabled={isBusy} />
              </label>
              <label>
                Termina (opcional)
                <input type="datetime-local" value={event.endsAt || ""} onChange={(inputEvent) => updateEventField("endsAt", inputEvent.target.value || null)} disabled={isBusy} />
              </label>
            </div>
            <label>
              Modalidad
              <select value={event.locationType} onChange={(inputEvent) => updateEventField("locationType", inputEvent.target.value)} disabled={isBusy} aria-label="Tipo de ubicación del evento">
                <option value="online">En línea</option>
                <option value="in_person">Presencial</option>
              </select>
            </label>
            <label>
              {event.locationType === "in_person" ? "Ubicación" : "Enlace o ubicación (opcional)"}
              <input value={event.location} onChange={(inputEvent) => updateEventField("location", inputEvent.target.value.slice(0, 300))} maxLength={300} placeholder={event.locationType === "in_person" ? "Dirección o lugar" : "https://..."} disabled={isBusy} />
            </label>
            <label>
              Zona horaria
              <input value={event.timezone} onChange={(inputEvent) => updateEventField("timezone", inputEvent.target.value.slice(0, 64))} maxLength={64} placeholder="America/Mexico_City" disabled={isBusy} />
            </label>
            <div className="k-button-group">
              <button type="button" className="k-button k-button-ghost" onClick={() => setEvent(null)} disabled={isBusy}>Quitar evento</button>
              <small className="k-muted">Los eventos pueden recibir respuestas de interés o asistencia.</small>
            </div>
          </fieldset>
        )}
        {/* media preview */}
        {preview && (
          <div className="k-composer-media">
            <div style={{ position: "relative", overflow: "hidden", borderRadius: 12, border: "1px solid var(--k-border)", background: "var(--k-surface-2)" }}>
              {isVideoPreview ? (
                <video ref={videoRef} controls preload="metadata" crossOrigin="anonymous" onLoadedMetadata={handleVideoMetadata} poster={videoPoster ? mediaSource(videoPoster) : undefined} src={mediaSource(preview)} aria-label={alt || "Vista previa de video"} style={{ width: "100%", maxHeight: 380, objectFit: "contain", display: "block", background: "#000" }} />
              ) : (
                <img src={mediaSource(preview)} alt={alt || "Vista previa"} style={{ width: "100%", maxHeight: 380, objectFit: "cover", display: "block" }} />
              )}
              <button type="button" onClick={clearMedia} disabled={isBusy} aria-label="Quitar archivo" style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--k-border)", background: "rgba(0,0,0,0.6)", color: "#fff" }}>
                ×
              </button>
            </div>
            {isVideoPreview && (
                <section className="k-video-editor" aria-label="Edición del video">
                  <div className="k-video-editor-cabeza">
                    <div>
                      <strong>Edición del video</strong>
                      <small>
                        {formatearTiempo(videoTrim.end ? videoTrim.end - videoTrim.start : 0)} de corte
                        {videoTrim.muted ? " · sin audio original" : ""}
                        {videoReceta?.filtro?.id && videoReceta.filtro.id !== "original" ? " · con filtro" : ""}
                        {videoReceta?.musica ? " · con música" : ""}
                        {videoLinea?.clips?.length > 1 ? ` · ${videoLinea.clips.length} clips` : ""}
                        {videoReceta?.voz || vozEnOff ? " · con voz en off" : ""}
                      </small>
                    </div>
                    <button type="button" className="k-button k-button-primary" onClick={() => setEstudio({ kind: "video" })} disabled={isBusy}>
                      Abrir estudio
                    </button>
                  </div>
                  <p className="k-video-editor-nota">
                    Corte, filtros, tono, texto, música y portada en una sola pantalla, sin nada encimado.
                    {videoPoster ? " Portada lista." : ""}
                  </p>
                </section>
              )}
            <label style={{ display: "grid", gap: 4, fontSize: "0.85rem", color: "var(--k-muted)" }}>
              {previewLabel}
              <input type="text" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={500} placeholder={isVideoPreview ? "Describe el video" : "Describe la imagen para accesibilidad"} disabled={isBusy} style={{ padding: 10, border: "1px solid var(--k-border)", borderRadius: 10, background: "var(--k-bg)", color: "var(--k-text)" }} />
            </label>
            {uploading && <span className="k-muted" style={{ fontSize: "0.85rem" }}>Subiendo archivo...</span>}
          </div>
        )}

        {carouselItems.length > 0 && (
          <div className="k-composer-carousel" aria-label="Imágenes del carrusel">
            <div className="k-composer-carousel-heading">
              <span className="k-muted">Carrusel · {carouselItems.length}/{MAX_CAROUSEL_IMAGES} imágenes</span>
              <button type="button" className="k-button k-button-ghost" onClick={clearMedia} disabled={isBusy}>Quitar carrusel</button>
            </div>
            <div className="k-composer-carousel-grid">
              {carouselItems.map((item, index) => (
                <article className="k-composer-carousel-item" key={item.id}>
                  <img src={mediaSource(item.preview)} alt={item.alt || `Vista previa ${index + 1}`} />
                  <div className="k-composer-carousel-controls">
                    <span>{index + 1}</span>
                    {item.file && (
                      <button type="button" className="k-button k-button-ghost" onClick={() => editCarouselItem(item)} disabled={isBusy}>Editar</button>
                    )}
                    <button type="button" className="k-button k-button-ghost" onClick={() => removeCarouselItem(item.id)} disabled={isBusy}>Quitar</button>
                  </div>
                  <label>
                    Texto alternativo {index + 1}
                    <input type="text" value={item.alt} onChange={(event) => setCarouselAlt(item.id, event.target.value)} maxLength={500} placeholder="Describe esta imagen" disabled={isBusy} />
                  </label>
                </article>
              ))}
            </div>
            {uploading && <span className="k-muted" style={{ fontSize: "0.85rem" }}>Subiendo carrusel...</span>}
          </div>
        )}

        <input ref={inputRef} multiple type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={handleFileChange} disabled={isBusy} style={{ display: "none" }} aria-label="Seleccionar imagen o video" />

        <label className="k-post-audience-picker">
          <span>Audiencia</span>
          <select value={audience} onChange={(event) => setAudience(event.target.value)} disabled={isBusy} aria-label="Audiencia de la publicación">
            <option value="public">Pública · cualquiera puede verla</option>
            <option value="followers">Seguidores · solo quienes te siguen</option>
            <option value="private">Privada · solo tú</option>
            {circles.length > 0 && <option disabled value="circle-heading">Mis círculos</option>}
            {circles.map((circle) => (
              <option key={circle._id} value={`circle:${circle._id}`}>
                {circle.name} · círculo privado
              </option>
            ))}
          </select>
        </label>

        <div className="k-composer-footer">
          <div className="k-composer-media-actions" role="group" aria-label="Archivos de la publicación">
            <button type="button" className="k-button k-button-secondary" onClick={() => inputRef.current?.click()} disabled={isBusy}>
              {preview || carouselItems.length ? "Cambiar archivo" : "Añadir imagen/video"}
            </button>
            {file && preview && !isVideoPreview && (
              <button type="button" className="k-button k-button-ghost" onClick={() => setImageEditorTarget({ file, itemId: "" })} disabled={isBusy}>
                Editar imagen
              </button>
            )}
            {(preview || carouselItems.length > 0) && (
              <span className="k-muted" style={{ fontSize: "0.85rem" }}>
                {carouselItems.length > 1
                  ? `${carouselItems.length} imágenes · carrusel`
                  : file
                    ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB`
                    : carouselItems.length === 1
                      ? `${carouselItems[0].file?.name || "Imagen"} · ${((carouselItems[0].file?.size || carouselItems[0].size || 0) / 1024).toFixed(0)} KB`
                      : "Media lista"}
              </span>
            )}
          </div>
          <div className="k-composer-publish-actions" role="group" aria-label="Guardar o publicar">
            <span className="k-composer-count">{content.length}/5000</span>
            {DRAFTS_ENABLED && (
              <button
                className="k-button k-button-secondary"
                type="button"
                onClick={handleSaveDraft}
                disabled={isBusy || savingDraft || (!content.trim() && !preview && !carouselItems.length && !poll && !event)}
              >
                {savingDraft ? "Guardando..." : activeDraftId ? "Actualizar borrador" : "Guardar borrador"}
              </button>
            )}
            {!compact && canSubmit && (
              <button className="k-button k-button-ghost" type="button" onClick={requestCancel} disabled={isBusy}>
                Cancelar
              </button>
            )}
            <button className="k-button k-button-primary" type="submit" disabled={isBusy || !canSubmit}>
              {uploading ? "Subiendo..." : creating ? "Publicando..." : "Publicar"}
            </button>
          </div>
        </div>
      </form>

      {confirmingCancel && createPortal(
        <div className="k-discard-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setConfirmingCancel(false);
        }}>
          <section className="k-discard-dialog" role="dialog" aria-modal="true" aria-labelledby="discard-post-title">
            <span className="k-eyebrow">PUBLICACIÓN SIN TERMINAR</span>
            <h3 id="discard-post-title">¿Qué quieres hacer?</h3>
            <p>Si eliminas los cambios, el texto y la multimedia seleccionada se perderán.</p>
            <div>
              <button type="button" className="k-button k-button-danger" onClick={discardComposer}>Eliminar cambios</button>
              <button type="button" className="k-button k-button-primary" onClick={() => setConfirmingCancel(false)}>Seguir editando</button>
            </div>
          </section>
        </div>, document.body
      )}

      {DRAFTS_ENABLED && !compact && (
      <div className="k-drafts">
        <div className="k-composer-heading">
          <p className="k-eyebrow">BORRADORES</p>
          {activeDraftId && (
            <button
              className="k-button k-button-ghost"
              type="button"
              onClick={() => { setActiveDraftId(""); setContent(""); setPoll(null); setEvent(null); clearMedia(); }}
            >
              Empezar de cero
            </button>
          )}
        </div>

        {draftsError && <p className="k-state k-state-error" role="alert">{draftsError}</p>}

        {draftsLoading ? (
          <div className="k-feed-state"><span className="k-skeleton" /></div>
        ) : drafts.length === 0 ? (
          <p className="k-muted">No tienes borradores guardados.</p>
        ) : (
          <ul className="k-draft-list">
            {drafts.map(draft => {
              const draftItemsCount = Array.isArray(draft.mediaItems) ? draft.mediaItems.filter((item) => item?.url).length : 0;
              return (
                <li key={draft._id} className={activeDraftId === draft._id ? "is-active" : ""}>
                  <button
                    type="button"
                    className="k-draft-open"
                    onClick={() => resumeDraft(draft)}
                    aria-current={activeDraftId === draft._id}
                  >
                    <span>{draft.content ? draft.content.slice(0, 80) : draftItemsCount > 1 ? "Borrador con carrusel" : "Borrador con media"}</span>
                    <small className="k-muted">
                      {formatDraftDate(draft.updatedAt)}
                      {draftItemsCount > 1 ? ` · ${draftItemsCount} imágenes` : draft.media?.url ? " · con media" : ""}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="k-button k-button-ghost"
                    onClick={() => removeDraft(draft._id)}
                    aria-label="Eliminar borrador"
                  >
                    Eliminar
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      )}
      </div>
    </section>
  );
}

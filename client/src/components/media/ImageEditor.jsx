import { useEffect, useMemo, useState } from "react";

const ASPECT_OPTIONS = [
  { value: "original", label: "Original", ratio: null },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:5", label: "4:5", ratio: 4 / 5 },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "3:1", label: "Portada 3:1", ratio: 3 }
];

const FORMAT_OPTIONS = [
  { value: "image/jpeg", label: "JPG" },
  { value: "image/png", label: "PNG" },
  { value: "image/webp", label: "WebP" }
];

const FILTER_OPTIONS = [
  { value: "none", label: "Original", css: "none" },
  { value: "bright", label: "Brillo", css: "brightness(1.12)" },
  { value: "contrast", label: "Contraste", css: "contrast(1.2)" },
  { value: "saturated", label: "Saturado", css: "saturate(1.35)" },
  { value: "mono", label: "Blanco y negro", css: "grayscale(1)" },
  { value: "sepia", label: "Sepia", css: "sepia(.85)" }
];

const FRAME_OPTIONS = [
  { value: "none", label: "Sin marco", color: "transparent", width: 0 },
  { value: "white", label: "Marco blanco", color: "#ffffff", width: 34 },
  { value: "black", label: "Marco negro", color: "#000000", width: 34 },
  { value: "aqua", label: "Marco aqua", color: "#6df5e5", width: 28 }
];

const STICKER_OPTIONS = [
  { value: "none", label: "Sin sticker", emoji: "" },
  { value: "sparkles", label: "Destellos", emoji: "✨" },
  { value: "heart", label: "Corazón", emoji: "❤️" },
  { value: "fire", label: "Fuego", emoji: "🔥" },
  { value: "rainbow", label: "Arcoíris", emoji: "🌈" },
  { value: "camera", label: "Cámara", emoji: "📸" }
];

function extensionFor(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function safeName(prefix, mimeType) {
  return `${prefix || "kronos-image"}-${Date.now()}.${extensionFor(mimeType)}`;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo leer la imagen."));
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("No se pudo generar la imagen editada."));
      else resolve(blob);
    }, type, quality);
  });
}

function outputSize(naturalWidth, naturalHeight, ratio) {
  const naturalRatio = naturalWidth && naturalHeight ? naturalWidth / naturalHeight : 1;
  const targetRatio = ratio || naturalRatio || 1;
  const baseWidth = targetRatio >= 1 ? 1600 : 1200;
  let width = baseWidth;
  let height = Math.round(width / targetRatio);

  if (height > 1600) {
    height = 1600;
    width = Math.round(height * targetRatio);
  }

  return { width, height };
}

async function createEditedFile({
  sourceUrl,
  file,
  ratio,
  zoom,
  rotation,
  offsetX,
  offsetY,
  format,
  namePrefix,
  filter,
  frame,
  sticker,
  overlayText,
  overlayDate,
  overlayLocation
}) {
  const image = await loadImage(sourceUrl);
  const canvas = document.createElement("canvas");
  const { width, height } = outputSize(image.naturalWidth, image.naturalHeight, ratio);
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no pudo preparar el editor de imagen.");

  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const selectedFilter = FILTER_OPTIONS.find((option) => option.value === filter) || FILTER_OPTIONS[0];
  const selectedFrame = FRAME_OPTIONS.find((option) => option.value === frame) || FRAME_OPTIONS[0];
  const selectedSticker = STICKER_OPTIONS.find((option) => option.value === sticker) || STICKER_OPTIONS[0];

  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const rotatedWidth = normalizedRotation === 90 || normalizedRotation === 270 ? image.naturalHeight : image.naturalWidth;
  const rotatedHeight = normalizedRotation === 90 || normalizedRotation === 270 ? image.naturalWidth : image.naturalHeight;
  const baseScale = Math.max(width / rotatedWidth, height / rotatedHeight);
  const translateX = (Number(offsetX) / 100) * width * 0.5;
  const translateY = (Number(offsetY) / 100) * height * 0.5;

  context.save();
  context.filter = selectedFilter.css;
  context.translate(width / 2 + translateX, height / 2 + translateY);
  context.rotate((normalizedRotation * Math.PI) / 180);
  context.scale(baseScale * Number(zoom), baseScale * Number(zoom));
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
  context.filter = "none";

  if (selectedFrame.width) {
    context.fillStyle = selectedFrame.color;
    context.fillRect(0, 0, width, selectedFrame.width);
    context.fillRect(0, height - selectedFrame.width, width, selectedFrame.width);
    context.fillRect(0, selectedFrame.width, selectedFrame.width, height - selectedFrame.width * 2);
    context.fillRect(width - selectedFrame.width, selectedFrame.width, selectedFrame.width, height - selectedFrame.width * 2);
  }

  const overlayLines = [
    typeof overlayText === "string" ? overlayText.trim() : "",
    typeof overlayLocation === "string" ? overlayLocation.trim() : "",
    overlayDate ? new Date().toLocaleDateString("es-MX") : ""
  ].filter(Boolean);
  if (overlayLines.length) {
    const padding = Math.max(18, Math.round(width * 0.018));
    const lineHeight = Math.max(28, Math.round(width * 0.028));
    context.font = `600 ${Math.max(22, Math.round(width * 0.024))}px sans-serif`;
    context.textAlign = "left";
    context.textBaseline = "top";
    const maxLineWidth = Math.max(...overlayLines.map((line) => context.measureText(line).width));
    const boxHeight = padding * 2 + lineHeight * overlayLines.length;
    context.fillStyle = "rgba(0, 0, 0, 0.58)";
    context.fillRect(padding / 2, height - boxHeight - padding / 2, maxLineWidth + padding * 2, boxHeight);
    context.fillStyle = "#ffffff";
    overlayLines.forEach((line, index) => {
      context.fillText(line, padding, height - boxHeight + padding / 2 + index * lineHeight);
    });
  }

  if (selectedSticker.emoji) {
    context.font = `${Math.max(48, Math.round(width * 0.09))}px sans-serif`;
    context.textAlign = "right";
    context.textBaseline = "top";
    context.shadowColor = "rgba(0, 0, 0, 0.55)";
    context.shadowBlur = 12;
    context.fillText(selectedSticker.emoji, width - Math.max(22, width * 0.03), Math.max(22, height * 0.03));
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
  }

  const blob = await canvasToBlob(canvas, format, format === "image/png" ? undefined : 0.9);
  return new File([blob], safeName(namePrefix || file?.name?.replace(/\.[^.]+$/, "") || "kronos-image", format), {
    type: format,
    lastModified: Date.now()
  });
}

export default function ImageEditor({
  file,
  open = Boolean(file),
  onApply,
  onCancel,
  title = "Editor de imagen",
  description = "Recorta, centra, ajusta zoom, rota y elige formato antes de subir.",
  defaultAspect = "original",
  aspectOptions = ASPECT_OPTIONS,
  defaultFormat = "image/jpeg",
  outputNamePrefix = "kronos-image"
}) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [aspect, setAspect] = useState(defaultAspect);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [format, setFormat] = useState(defaultFormat);
  const [filter, setFilter] = useState("none");
  const [focalPoint, setFocalPoint] = useState({ x: 0.5, y: 0.5 });
  const [frame, setFrame] = useState("none");
  const [sticker, setSticker] = useState("none");
  const [overlayText, setOverlayText] = useState("");
  const [overlayDate, setOverlayDate] = useState(false);
  const [overlayLocation, setOverlayLocation] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file || !open) {
      setSourceUrl("");
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setError("");
    setAspect(defaultAspect);
    setZoom(1);
    setRotation(0);
    setOffsetX(0);
    setOffsetY(0);
    setFormat(file.type && FORMAT_OPTIONS.some((option) => option.value === file.type) ? file.type : defaultFormat);
    setFilter("none");
    setFrame("none");
    setSticker("none");
    setOverlayText("");
    setOverlayDate(false);
    setOverlayLocation("");

    const image = new Image();
    image.onload = () => setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => setError("No se pudo abrir la imagen seleccionada.");
    image.src = url;

    return () => URL.revokeObjectURL(url);
  }, [file, open, defaultAspect, defaultFormat]);

  const selectedAspect = useMemo(
    () => aspectOptions.find((option) => option.value === aspect) || aspectOptions[0] || ASPECT_OPTIONS[0],
    [aspect, aspectOptions]
  );
  const previewRatio = selectedAspect?.ratio || (naturalSize.width && naturalSize.height ? naturalSize.width / naturalSize.height : 1);
  const selectedFilter = FILTER_OPTIONS.find((option) => option.value === filter) || FILTER_OPTIONS[0];
  const selectedFrame = FRAME_OPTIONS.find((option) => option.value === frame) || FRAME_OPTIONS[0];
  const selectedSticker = STICKER_OPTIONS.find((option) => option.value === sticker) || STICKER_OPTIONS[0];
  const previewOverlay = [overlayText.trim(), overlayLocation.trim(), overlayDate ? new Date().toLocaleDateString("es-MX") : ""].filter(Boolean);

  if (!open || !file) return null;

  function handleFocalClick(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    setFocalPoint({ x, y });
  }

  async function applyEdit() {
    if (processing || !sourceUrl) return;
    setProcessing(true);
    setError("");
    try {
      const edited = await createEditedFile({
        sourceUrl,
        file,
        ratio: selectedAspect?.ratio,
        zoom,
        rotation,
        offsetX,
        offsetY,
        format,
        namePrefix: outputNamePrefix,
        filter,
        frame,
        sticker,
        overlayText,
        overlayDate,
        overlayLocation
      });
      onApply?.(edited, { focalPoint: { x: focalPoint.x, y: focalPoint.y } });
    } catch (requestError) {
      setError(requestError.message || "No se pudo aplicar la edición.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section className="k-image-editor" aria-label={title}>
      <div className="k-image-editor-panel" role="dialog" aria-modal="false" aria-labelledby="k-image-editor-title">
        <header className="k-image-editor-header">
          <div>
            <p className="k-eyebrow">MEDIA / IMAGEN</p>
            <h3 id="k-image-editor-title">{title}</h3>
            <p>{description}</p>
          </div>
          <button className="k-button k-button-ghost" type="button" onClick={onCancel} disabled={processing}>
            Cerrar
          </button>
        </header>

        {error && <p className="k-state k-state-error" role="alert">{error}</p>}

        <div className="k-image-editor-layout">
          <div className="k-image-editor-stage-wrap">
            <div className="k-image-editor-stage" style={{ aspectRatio: previewRatio }}>
              {sourceUrl && (
                <button
                  type="button"
                  className="k-image-editor-focal-stage"
                  onClick={handleFocalClick}
                  aria-label="Elegir punto focal: haz clic en la parte de la imagen que debe permanecer visible"
                  title="Punto focal: clic para elegir qué parte se ve al recortar"
                  disabled={processing}
                />
              )}
              <span
                className="k-image-editor-focal-marker"
                aria-hidden="true"
                style={{ left: `${focalPoint.x * 100}%`, top: `${focalPoint.y * 100}%` }}
              />
              {sourceUrl && (
                <img
                  src={sourceUrl}
                  alt="Vista previa de edición"
                  style={{
                    filter: selectedFilter.css,
                    transform: `translate(${offsetX}%, ${offsetY}%) rotate(${rotation}deg) scale(${zoom})`
                  }}
                />
              )}
              <span
                className="k-image-editor-frame"
                aria-hidden="true"
                style={{
                  borderColor: selectedFrame.width ? selectedFrame.color : undefined,
                  borderWidth: selectedFrame.width ? `${Math.max(4, selectedFrame.width / 2)}px` : undefined
                }}
              />
              {selectedSticker.emoji && <span style={{ position: "absolute", top: 18, right: 18, zIndex: 2, fontSize: "clamp(2rem, 8vw, 4rem)", filter: "drop-shadow(0 4px 8px rgba(0,0,0,.6))" }} aria-label={selectedSticker.label}>{selectedSticker.emoji}</span>}
              {previewOverlay.length > 0 && (
                <span style={{ position: "absolute", left: 16, bottom: 16, zIndex: 2, maxWidth: "calc(100% - 32px)", padding: "8px 12px", borderRadius: 8, color: "#fff", background: "rgba(0,0,0,.58)", fontSize: "clamp(.72rem, 2vw, 1rem)", whiteSpace: "pre-wrap" }}>
                  {previewOverlay.join(" · ")}
                </span>
              )}
            </div>
          </div>

          <div className="k-image-editor-controls">
            <label>
              Recorte
              <select value={aspect} onChange={(event) => setAspect(event.target.value)} disabled={processing}>
                {aspectOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label>
              Formato
              <select value={format} onChange={(event) => setFormat(event.target.value)} disabled={processing}>
                {FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label>
              Filtro
              <select value={filter} onChange={(event) => setFilter(event.target.value)} disabled={processing}>
                {FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label>
              Marco
              <select value={frame} onChange={(event) => setFrame(event.target.value)} disabled={processing}>
                {FRAME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label>
              Sticker
              <select value={sticker} onChange={(event) => setSticker(event.target.value)} disabled={processing}>
                {STICKER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label>
              Texto superpuesto
              <input type="text" value={overlayText} onChange={(event) => setOverlayText(event.target.value)} maxLength={120} placeholder="Mensaje breve" disabled={processing} />
            </label>

            <label>
              Ubicación
              <input type="text" value={overlayLocation} onChange={(event) => setOverlayLocation(event.target.value)} maxLength={80} placeholder="Ciudad o lugar" disabled={processing} />
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={overlayDate} onChange={(event) => setOverlayDate(event.target.checked)} disabled={processing} />
              Añadir fecha
            </label>

            <label>
              Zoom · {Number(zoom).toFixed(2)}x
              <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} disabled={processing} />
            </label>

            <label>
              Centrado horizontal · {offsetX}
              <input type="range" min="-50" max="50" step="1" value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} disabled={processing} />
            </label>

            <label>
              Centrado vertical · {offsetY}
              <input type="range" min="-50" max="50" step="1" value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} disabled={processing} />
            </label>

            <div className="k-button-group k-image-editor-rotate">
              <button type="button" className="k-button k-button-secondary" onClick={() => setRotation((value) => value - 90)} disabled={processing}>Rotar -90°</button>
              <button type="button" className="k-button k-button-secondary" onClick={() => setRotation((value) => value + 90)} disabled={processing}>Rotar +90°</button>
            </div>

            <div className="k-button-group">
              <button type="button" className="k-button k-button-ghost" onClick={() => { setOffsetX(0); setOffsetY(0); }} disabled={processing}>Centrar</button>
              <button type="button" className="k-button k-button-secondary" onClick={() => onApply?.(file)} disabled={processing}>Usar original</button>
              <button type="button" className="k-button k-button-secondary" onClick={onCancel} disabled={processing}>Cancelar</button>
              <button type="button" className="k-button k-button-primary" onClick={applyEdit} disabled={processing || !sourceUrl}>
                {processing ? "Aplicando..." : "Aplicar imagen"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

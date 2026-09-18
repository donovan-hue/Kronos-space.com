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

async function createEditedFile({ sourceUrl, file, ratio, zoom, rotation, offsetX, offsetY, format, namePrefix }) {
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

  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const rotatedWidth = normalizedRotation === 90 || normalizedRotation === 270 ? image.naturalHeight : image.naturalWidth;
  const rotatedHeight = normalizedRotation === 90 || normalizedRotation === 270 ? image.naturalWidth : image.naturalHeight;
  const baseScale = Math.max(width / rotatedWidth, height / rotatedHeight);
  const translateX = (Number(offsetX) / 100) * width * 0.5;
  const translateY = (Number(offsetY) / 100) * height * 0.5;

  context.save();
  context.translate(width / 2 + translateX, height / 2 + translateY);
  context.rotate((normalizedRotation * Math.PI) / 180);
  context.scale(baseScale * Number(zoom), baseScale * Number(zoom));
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();

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

  if (!open || !file) return null;

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
        namePrefix: outputNamePrefix
      });
      onApply?.(edited);
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
                <img
                  src={sourceUrl}
                  alt="Vista previa de edición"
                  style={{ transform: `translate(${offsetX}%, ${offsetY}%) rotate(${rotation}deg) scale(${zoom})` }}
                />
              )}
              <span className="k-image-editor-frame" aria-hidden="true" />
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

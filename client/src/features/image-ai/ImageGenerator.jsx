import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { generateImage, getImageHistory } from "../../services/aiService";
import { mediaUrl } from "../../services/mediaUrl";
import { imagePromptSchema } from "../../schemas";
import EmptyState from "../../components/ui/EmptyState";
import PromptLibrary from "./PromptLibrary";

/* Estilos de fábrica. La lista viva llega del servidor
   (`/prompts/catalog`); esta copia solo evita que el selector parpadee vacío
   mientras carga. */
const STYLES = [
  { codigo: "cinematic", nombre: "Cinemático" },
  { codigo: "editorial", nombre: "Editorial" },
  { codigo: "concept-art", nombre: "Concept art" },
  { codigo: "photorealistic", nombre: "Fotorrealista" },
];
const STYLE_CODES = STYLES.map((estilo) => estilo.codigo);

/* Se une lo que manda el servidor con los cuatro de fábrica: si el catálogo
   llegara incompleto o fallara, el formulario no puede quedarse sin la opción
   que ya tenía guardada una generación del historial. */
function opcionesDeEstilo(delServidor) {
  const vistos = new Set();
  return [...delServidor, ...STYLES].filter((estilo) => {
    if (!estilo?.codigo || vistos.has(estilo.codigo)) return false;
    vistos.add(estilo.codigo);
    return true;
  });
}

/* Encuadres con el nombre que ve el usuario. La lista es la misma que valida
   el servidor; si aquí se ofrece uno que el servidor rechaza, el formulario
   mentiría. */
const ASPECT_RATIOS = [
  ["1:1", "Cuadrado", "Publicación"],
  ["4:5", "Vertical", "Retrato"],
  ["9:16", "Historia", "Historia"],
  ["16:9", "Apaisado", "Cabecera"],
  ["3:4", "Retrato", "Retrato"],
  ["4:3", "Clásico", "Foto"],
  ["3:2", "Cámara", "Foto"]
];

const ASPECT_VALUES = ASPECT_RATIOS.map(([value]) => value);

export default function ImageGenerator() {
  const location = useLocation();
  const [imageUrl, setImageUrl] = useState("");
  const [variants, setVariants] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [estilos, setEstilos] = useState(STYLES);
  // Estilo propio elegido: va aparte del `style` del formulario porque el
  // servidor recibe el id y resuelve él el texto.
  const [estiloPropio, setEstiloPropio] = useState(null);
  // Imagen que se está editando (`/uploads/...`). Mientras haya una, el
  // formulario dice «Editar» en vez de «Generar»: son la misma petición, pero
  // no la misma promesa.
  const [referencia, setReferencia] = useState("");

  // RHF + Zod con las reglas del backend: prompt obligatorio ≤4000,
  // negativePrompt ≤2000, estilo y encuadre del catálogo, 1-4 variaciones.
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(imagePromptSchema),
    defaultValues: {
      prompt: "",
      negativePrompt: "",
      style: "cinematic",
      aspectRatio: "1:1",
      variations: 1,
    },
  });

  async function loadHistory() {
    try {
      const data = await getImageHistory();
      setHistory(Array.isArray(data?.generations) ? data.generations : []);
    } catch (error) {
      setMessage(error.response?.data?.error || "No se pudo cargar el historial visual.");
    }
  }

  useEffect(() => { loadHistory(); }, []);
  /** Catálogo de estilos del servidor; si falla, se queda el de fábrica. */
  useEffect(() => {
    let vivo = true;
    import("../../services/promptService")
      .then(({ getPromptCatalog }) => getPromptCatalog())
      .then((data) => {
        if (vivo && data.estilos.length) setEstilos(opcionesDeEstilo(data.estilos));
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    const reuseState = location.state || {};
    if (reuseState.reusePrompt) setValue("prompt", reuseState.reusePrompt);
    if (Object.prototype.hasOwnProperty.call(reuseState, "reuseNegativePrompt")) {
      setValue("negativePrompt", reuseState.reuseNegativePrompt || "");
    }
    if (STYLE_CODES.includes(reuseState.reuseStyle)) setValue("style", reuseState.reuseStyle);
    if (ASPECT_VALUES.includes(reuseState.reuseAspectRatio)) {
      setValue("aspectRatio", reuseState.reuseAspectRatio);
    }
    if (Number(reuseState.reuseVariations) >= 1 && Number(reuseState.reuseVariations) <= 4) {
      setValue("variations", Number(reuseState.reuseVariations));
    }
  }, [location.state, setValue]);

  const generate = handleSubmit(async (data) => {
    if (loading) return;
    setLoading(true);
    setMessage("");

    try {
      const result = await generateImage({
        prompt: data.prompt.trim(),
        negativePrompt: data.negativePrompt.trim(),
        style: data.style,
        // Solo viaja cuando hay uno: mandar `estiloId: ""` haría que el
        // servidor buscara un estilo vacío en vez de quedarse con el de
        // fábrica.
        ...(estiloPropio?._id ? { estiloId: estiloPropio._id } : {}),
        ...(referencia ? { inputReferences: [referencia] } : {}),
        aspectRatio: data.aspectRatio,
        variations: Number(data.variations)
      });
      const urls = Array.isArray(result?.urls) && result.urls.length
        ? result.urls
        : [result?.url || result?.imageUrl].filter(Boolean);
      setVariants(urls);
      setImageUrl(urls[0] || "");
      // Si se pidió editar y el modelo no admite referencias, se dice: el
      // resultado es una imagen nueva, no la editada.
      const avisoEdicion = referencia && result?.editApplied === false
        ? " El modelo no admite edición sobre una imagen: esto es una generación nueva."
        : "";
      setMessage(
        (result?.message ||
          (urls.length > 1
            ? `${urls.length} variaciones listas.`
            : referencia ? "Edición completada." : "Generación completada.")) + avisoEdicion
      );
      await loadHistory();
    } catch (error) {
      setMessage(error.response?.data?.error || "Error generando imagen.");
    } finally {
      setLoading(false);
    }
  });

  /** Editar una imagen: misma imagen como referencia y su prompt de partida. */
  function editar(url, item = {}) {
    if (!url) return;
    setReferencia(url);
    if (item.prompt) setValue("prompt", item.prompt);
    if (Object.prototype.hasOwnProperty.call(item, "negativePrompt")) {
      setValue("negativePrompt", item.negativePrompt || "");
    }
    setVariants([]);
    setImageUrl("");
    setMessage("Editando una imagen de tu biblioteca. Describe el cambio y pulsa Editar imagen.");
  }

  /** Reutilizar una generación del historial llena el formulario. */
  function reuse(item) {
    setValue("prompt", item.prompt || "");
    setValue("negativePrompt", item.negativePrompt || "");
    setValue("style", STYLE_CODES.includes(item.style) ? item.style : "cinematic");
    setEstiloPropio(null);
    setValue("aspectRatio", ASPECT_VALUES.includes(item.aspectRatio) ? item.aspectRatio : "1:1");
    setValue(
      "variations",
      Number(item.variations) >= 1 && Number(item.variations) <= 4 ? Number(item.variations) : 1
    );
    const urls = Array.isArray(item.variants) && item.variants.length ? item.variants : [item.imageUrl];
    setVariants(urls.filter(Boolean));
    setImageUrl(item.imageUrl);
  }

  return (
    <section className="page k-kairos-tool-page">
      <header className="k-page-header">
        <div><h1>Generar imagen</h1><p>Describe la dirección visual. Kairos se encarga del primer pase.</p></div>
        <Link className="k-button k-button-ghost" to="/kairos">Volver a Kairos</Link>
      </header>
      <div className="k-ai-workspace">
        <form className="k-ai-form k-surface" onSubmit={generate} noValidate>
          <label>Prompt<textarea placeholder="Una ciudad de titanio bajo la lluvia..." {...register("prompt")} /></label>
          {errors.prompt && <p className="k-field-error" role="alert">{errors.prompt.message}</p>}
          <label>Negative prompt<textarea placeholder="Elementos que quieres evitar" {...register("negativePrompt")} /></label>
          {errors.negativePrompt && <p className="k-field-error" role="alert">{errors.negativePrompt.message}</p>}
          <label>Estilo
            <select
              {...register("style")}
              onChange={(event) => { setEstiloPropio(null); register("style").onChange(event); }}
            >{estilos.map((estilo) => <option key={estilo.codigo} value={estilo.codigo}>{estilo.nombre}</option>)}</select>
          </label>
          <PromptLibrary
            onUsePrompt={(texto) => setValue("prompt", texto)}
            onUseStyle={(preset) => {
              // El estilo propio se suma al de fábrica sin borrar el prompt:
              // el servidor lo prefiere cuando llega `estiloId`, así que el
              // selector de estilos no se toca y se puede quitar después.
              setEstiloPropio(preset);
            }}
          />
          {estiloPropio && (
            <p className="k-muted k-field-hint" role="status">
              Estilo propio: <strong>{estiloPropio.nombre}</strong>.{" "}
              <button className="k-link-button" type="button" onClick={() => setEstiloPropio(null)}>Quitar</button>
            </p>
          )}
          <label>Encuadre
            <select {...register("aspectRatio")}>
              {ASPECT_RATIOS.map(([value, nombre, uso]) => (
                <option key={value} value={value}>{nombre} · {value} ({uso})</option>
              ))}
            </select>
          </label>
          {errors.aspectRatio && <p className="k-field-error" role="alert">{errors.aspectRatio.message}</p>}
          <label>Variaciones
            <select {...register("variations")}>
              {[1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>{value === 1 ? "Una imagen" : `${value} imágenes`}</option>
              ))}
            </select>
          </label>
          {errors.variations && <p className="k-field-error" role="alert">{errors.variations.message}</p>}
          <p className="k-muted k-field-hint">
            Cada variación se guarda en tu biblioteca. Si el modelo no admite varias a la vez, Kairos devuelve una y lo dice.
          </p>
          {referencia && (
            <div className="k-edit-reference" role="group" aria-label="Imagen de referencia">
              <img src={mediaUrl(referencia)} alt="Imagen que se va a editar" />
              <div>
                <strong>Editando esta imagen</strong>
                <p className="k-muted k-field-hint">
                  Describe solo el cambio. Lo que no menciones debería conservarse.
                </p>
                <button className="k-button k-button-ghost" type="button" onClick={() => setReferencia("")}>
                  Quitar referencia
                </button>
              </div>
            </div>
          )}
          <button className="k-button k-button-secondary" type="submit" disabled={loading}>
            {loading ? "KAIROS procesando..." : referencia ? "Editar imagen" : "Generar imagen"}
          </button>
        </form>
        <div className="k-ai-result k-card-ai">
          {variants.length > 1 ? (
            <div className="k-ai-variants" role="list">
              {variants.map((url, index) => (
                <button
                  className={`k-ai-variant${url === imageUrl ? " is-active" : ""}`}
                  key={url}
                  type="button"
                  role="listitem"
                  aria-label={`Variación ${index + 1}`}
                  aria-pressed={url === imageUrl}
                  onClick={() => setImageUrl(url)}
                >
                  <img src={mediaUrl(url)} alt="" />
                </button>
              ))}
            </div>
          ) : imageUrl ? <img src={mediaUrl(imageUrl)} alt="" /> : <EmptyState icon={<SparklesPlaceholder />} title="Tu resultado aparecerá aquí" description="Genera una imagen para iniciar." />}
          {message && <p className="k-state" role="status">{message}</p>}
        </div>
      </div>
      <section className="k-history">
        <div className="k-section-heading"><h2>Últimas generaciones</h2><Link to="/kairos/history">Ver todo</Link></div>
        {history.length === 0 ? <p className="k-muted">Todavía no hay generaciones.</p> : <div className="k-history-grid">{history.filter((item) => item.imageUrl).map((item) => (
          <div className="k-history-cell" key={item._id}>
            <button className="k-history-item" type="button" onClick={() => reuse(item)}>
              <img src={mediaUrl(item.imageUrl)} alt={item.prompt || "Generación de Kairos"} />
            </button>
            <button className="k-button k-button-ghost" type="button" onClick={() => editar(item.imageUrl, item)}>
              Editar
            </button>
          </div>
        ))}</div>}
      </section>
    </section>
  );
}

function SparklesPlaceholder() { return <div className="k-kairos-placeholder" aria-hidden="true">✦</div>; }

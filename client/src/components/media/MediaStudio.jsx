import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AJUSTES_BASE,
  CALIDADES,
  FILTROS,
  LIMITES_AJUSTE,
  MEDIDAS,
  POSICIONES,
  TEXTOS_BASE,
  cajaRecorte,
  calidadPorId,
  cssAjustes,
  cssCombinado,
  formatearTiempo,
  normalizarAjustes,
  normalizarTexto,
  recetaVideo,
  recortarMusica,
  recortarVoz,
  validarReceta,
  VOZ_BASE,
  LIMITE_CLIPS,
  TRANSICIONES,
  VELOCIDADES,
  agregarClip,
  dividirClip,
  duracionDeClip,
  duracionTotalClips,
  largosVecinos,
  moverClip,
  normalizarClip,
  quitarClip,
  topeTransicion
} from "../../lib/mediaStudio";
import { filtrarCatalogo, obtenerCatalogoMusica } from "../../services/musicService";
import { filtrarVoces, generarLocucion, obtenerVoces } from "../../services/voiceService";

/* ============================================================
   ESTUDIO DE MEDIOS — pantalla completa

   Una sola pantalla para foto y video. La vista previa ocupa el
   centro y todo lo demás vive en un panel ordenado por pestañas:
   Filtros, Ajustes, Música, Texto y (en video) Corte. Nada se
   encima a la foto: los mandos nunca la tapan.
   ============================================================ */

const ETIQUETAS_AJUSTE = {
  brillo: "Brillo",
  contraste: "Contraste",
  saturacion: "Saturación",
  calidez: "Calidez",
  exposicion: "Exposición",
  desenfoque: "Suavizado",
  vineta: "Viñeta",
  grano: "Grano"
};

const PASOS_AJUSTE = {
  brillo: 0.01, contraste: 0.01, saturacion: 0.02, calidez: 0.01, exposicion: 0.01, desenfoque: 0.1, vineta: 0.02, grano: 0.02
};

function nombreArchivo(kind) {
  const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `kronos-estudio-${kind === "video" ? "video" : "foto"}-${sello}`;
}

export default function MediaStudio({
  open,
  kind = "image",
  file = null,
  previewUrl = "",
  guion = "",
  duracionInicial = 0,
  onApply,
  onCancel,
  title
}) {
  const esVideo = kind === "video";
  const [tab, setTab] = useState(esVideo ? "corte" : "filtros");
  const [filtroId, setFiltroId] = useState("original");
  const [intensidad, setIntensidad] = useState(1);
  const [ajustes, setAjustes] = useState(AJUSTES_BASE);
  const [texto, setTexto] = useState(TEXTOS_BASE);
  const [medida, setMedida] = useState(esVideo ? "9:16" : "original");
  const [calidad, setCalidad] = useState("alta");
  const [corte, setCorte] = useState({ inicio: 0, fin: duracionInicial || 0, silenciar: false });
  const [duracion, setDuracion] = useState(duracionInicial || 0);
  const [musica, setMusica] = useState({ trackId: "", titulo: "", inicio: 0, fin: 0, volumen: 0.8, fundidoEntrada: 0, fundidoSalida: 0 });
  const [catalogo, setCatalogo] = useState({ pistas: [], motivo: "" });
  const [busqueda, setBusqueda] = useState("");
  const [aviso, setAviso] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [portada, setPortada] = useState(null);
  // Línea de tiempo: el primer clip es el archivo que se abrió; los demás se
  // agregan desde aquí. Cada uno guarda su archivo para subirlo al publicar.
  const [clips, setClips] = useState([]);
  const [clipActivo, setClipActivo] = useState(0);
  // Segundo del archivo por el que se va a partir la toma en foco.
  const [puntoDivision, setPuntoDivision] = useState(0);
  // Voz en off: el catálogo de voces, la voz elegida y la grabación hecha
  // con el micrófono (que se sube al publicar, como los clips).
  const [voces, setVoces] = useState({ voces: [], servicio: { listo: false }, motivo: "" });
  const [busquedaVoz, setBusquedaVoz] = useState("");
  const [voz, setVoz] = useState(VOZ_BASE);
  const [vozArchivo, setVozArchivo] = useState(null);
  const [vozPreview, setVozPreview] = useState("");
  const [grabando, setGrabando] = useState(false);
  // El texto que se convierte en voz: arranca con el guion de la publicación.
  const [textoLocucion, setTextoLocucion] = useState("");
  const [generandoVoz, setGenerandoVoz] = useState(false);
  const grabadoraRef = useRef(null);
  const trozosRef = useRef([]);
  const videoRef = useRef(null);
  const cerrarRef = useRef(null);
  const clipInputRef = useRef(null);

  const url = useMemo(() => previewUrl || (file ? URL.createObjectURL(file) : ""), [file, previewUrl]);

  useEffect(() => () => {
    if (!previewUrl && url) URL.revokeObjectURL(url);
  }, [previewUrl, url]);

  useEffect(() => {
    if (open) setTextoLocucion(String(guion || ""));
    // El ?. evita el aviso de dependencia que no se puede cumplir en pruebas;
    // `guion` llega como cadena del compositor.
  }, [guion, open]);

  useEffect(() => {
    if (!open) return undefined;
    let vivo = true;
    obtenerCatalogoMusica().then((respuesta) => {
      if (vivo) setCatalogo(respuesta);
    });
    obtenerVoces().then((respuesta) => {
      if (vivo) setVoces(respuesta);
    });
    return () => {
      vivo = false;
    };
  }, [open]);

  // Al cerrar el estudio se suelta el micrófono y se olvida la grabación: no
  // se queda un micrófono abierto ni un archivo suelto en memoria.
  useEffect(() => {
    if (open) return undefined;
    return () => {
      grabadoraRef.current?.stop?.();
      grabadoraRef.current = null;
      setGrabando(false);
      setVozArchivo(null);
      setVozPreview("");
      setVoz(VOZ_BASE);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previo = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cerrarRef.current?.focus();
    function onKeyDown(evento) {
      if (evento.key === "Escape" && !procesando) {
        evento.stopPropagation();
        onCancel?.();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      if (previo instanceof HTMLElement) previo.focus?.();
    };
  }, [onCancel, open, procesando]);

  // La línea de tiempo arranca con el archivo que se abrió: es el clip 1.
  // Se reinicia cada vez que el estudio se abre con otro archivo.
  useEffect(() => {
    if (!open) return;
    setClips([
      {
        id: "principal",
        fuente: "principal",
        file: file || null,
        url: url || "",
        tipo: esVideo ? "video" : "image",
        nombre: file?.name || "",
        duracion: esVideo ? Math.max(0, Number(duracionInicial) || 0) : 0,
        inicio: 0,
        fin: esVideo ? Math.max(0, Number(duracionInicial) || 0) : 0
      }
    ]);
    setClipActivo(0);
  }, [duracionInicial, esVideo, file, open, url]);

  // Los clips nuevos se leen del disco: se calcula su duración real con un
  // elemento de video temporal y se guarda su archivo, para subirlo al
  // publicar. Nada de duraciones inventadas.
  const agregarArchivoComoClip = useCallback((evento) => {
    const archivo = evento.target.files?.[0];
    if (evento.target) evento.target.value = "";
    if (!archivo) return;

    const esImagen = archivo.type.startsWith("image/");
    if (!esImagen && !archivo.type.startsWith("video/")) {
      setAviso("Solo se pueden agregar videos o imágenes a la línea de tiempo.");
      return;
    }

    const urlClip = URL.createObjectURL(archivo);
    const id = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const meter = (duracionClip) => {
      setClips((previos) => {
        const resultado = agregarClip(previos, {
          id,
          fuente: id,
          file: archivo,
          tipo: esImagen ? "image" : "video",
          url: urlClip,
          nombre: archivo.name,
          duracion: duracionClip,
          inicio: 0,
          fin: duracionClip
        });
        if (resultado.error) {
          setAviso(resultado.error);
          URL.revokeObjectURL(urlClip);
          return previos;
        }
        setClipActivo(previos.length);
        return resultado.clips;
      });
    };

    if (esImagen) {
      meter(0);
      return;
    }

    const sonda = document.createElement("video");
    sonda.preload = "metadata";
    sonda.src = urlClip;
    sonda.onloadedmetadata = () => {
      const segundos = Number.isFinite(sonda.duration) ? Math.max(0, sonda.duration) : 0;
      meter(segundos);
    };
    sonda.onerror = () => {
      setAviso("No se pudo leer ese video para agregarlo a la línea de tiempo.");
      URL.revokeObjectURL(urlClip);
    };
  }, []);

  // La duración de la grabación se lee del archivo, no se cuenta a ojo.
  function leerDuracionDeAudio(urlAudio, alTerminar) {
    const sonda = document.createElement("audio");
    sonda.preload = "metadata";
    sonda.src = urlAudio;
    sonda.onloadedmetadata = () => alTerminar(Number.isFinite(sonda.duration) ? Math.max(0, sonda.duration) : 0);
    sonda.onerror = () => alTerminar(0);
  }

  async function empezarGrabacion() {
    setAviso("");
    try {
      const microfono = await navigator.mediaDevices.getUserMedia({ audio: true });
      const grabadora = new MediaRecorder(microfono);
      trozosRef.current = [];
      grabadora.ondataavailable = (evento) => {
        if (evento.data?.size) trozosRef.current.push(evento.data);
      };
      grabadora.onstop = () => {
        microfono.getTracks().forEach((pista) => pista.stop());
        const tipo = grabadora.mimeType || "audio/webm";
        const blob = new Blob(trozosRef.current, { type: tipo });
        const archivo = new File([blob], `voz-${Date.now()}.${tipo.includes("mp4") ? "m4a" : "webm"}`, { type: tipo });
        const urlLocal = URL.createObjectURL(blob);
        setVozArchivo(archivo);
        setVozPreview(urlLocal);
        leerDuracionDeAudio(urlLocal, (largo) => {
          setVoz((previo) => ({
            ...previo,
            voiceId: "",
            nombre: previo.nombre || "Voz grabada",
            url: "",
            tipo: "propia",
            inicio: 0,
            fin: largo
          }));
        });
      };
      grabadora.start();
      grabadoraRef.current = grabadora;
      setGrabando(true);
    } catch {
      setAviso("No se pudo abrir el micrófono. Revisa el permiso del navegador.");
    }
  }

  function terminarGrabacion() {
    grabadoraRef.current?.stop();
    grabadoraRef.current = null;
    setGrabando(false);
  }

  // Generar la voz desde el texto con el modelo del servidor. La toma queda
  // como una voz del catálogo: ya tiene dirección, así que entra en la
  // receta tal cual y no hay nada que subir al publicar.
  async function generarLaVoz() {
    setAviso("");
    setGenerandoVoz(true);
    try {
      const toma = await generarLocucion({ texto: textoLocucion, voiceId: voz.voiceId });
      setVozArchivo(null);
      // La grabación anterior (si era un blob del navegador) se suelta; la
      // locución recién generada se deja puesta para poder oírla.
      if (vozPreview.startsWith("blob:")) URL.revokeObjectURL(vozPreview);
      setVozPreview(toma.url);
      setVoz({
        ...VOZ_BASE,
        voiceId: voz.voiceId,
        nombre: voz.nombre || "Locución",
        url: toma.url,
        tipo: "catalogo",
        inicio: 0,
        fin: voz.fin || 0
      });
    } catch (error) {
      setAviso(error?.response?.data?.error || error?.message || "No se pudo generar la locución.");
    } finally {
      setGenerandoVoz(false);
    }
  }

  function quitarVoz() {
    if (vozPreview) URL.revokeObjectURL(vozPreview);
    setVozArchivo(null);
    setVozPreview("");
    setVoz(VOZ_BASE);
  }

  const filtroCss = cssCombinado(filtroId, ajustes, intensidad);
  const musicaRecortada = recortarMusica({ ...musica, duracion: musica.fin || duracion || 0 });

  const restablecer = useCallback(() => {
    setVozArchivo(null);
    setVozPreview("");
    setVoz(VOZ_BASE);
    setClips((previos) => (
      previos.length
        ? [{ ...previos[0], duracion: esVideo ? Math.max(0, Number(duracionInicial) || 0) : 0, inicio: 0, fin: esVideo ? Math.max(0, Number(duracionInicial) || 0) : 0 }]
        : previos
    ));
    setClipActivo(0);
    setFiltroId("original");
    setIntensidad(1);
    setAjustes(AJUSTES_BASE);
    setTexto(TEXTOS_BASE);
    setCorte({ inicio: 0, fin: duracion || duracionInicial || 0, silenciar: false });
    setMusica({ trackId: "", titulo: "", inicio: 0, fin: 0, volumen: 0.8, fundidoEntrada: 0, fundidoSalida: 0 });
    setAviso("");
    // `esVideo` decide si el clip conserva su duración o se pone a 0; sin ella
    // en el array, restablecer sobre un medio distinto del que se capturó
    // aplicaba la lógica del tipo anterior.
  }, [duracion, duracionInicial, esVideo]);

  function capturarPortada() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setAviso("Espera a que el video cargue para elegir la portada.");
      return;
    }
    const lienzo = document.createElement("canvas");
    lienzo.width = video.videoWidth;
    lienzo.height = video.videoHeight;
    const ctx = lienzo.getContext("2d");
    if (!ctx) {
      setAviso("Este navegador no permitió tomar el fotograma.");
      return;
    }
    ctx.filter = filtroCss;
    ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    lienzo.toBlob?.((blob) => {
      if (!blob) {
        setAviso("No se pudo guardar el fotograma.");
        return;
      }
      setPortada(new File([blob], `${nombreArchivo("video")}-portada.jpg`, { type: "image/jpeg" }));
      setAviso("Portada lista: se usará en el feed.");
    }, "image/jpeg", 0.9);
  }

  function pintarTexto(ctx, ancho, alto) {
    const limpio = normalizarTexto(texto);
    if (!limpio.contenido) return;
    const margen = Math.round(ancho * 0.06);
    const tamano = Math.max(14, Math.round(ancho * 0.055 * limpio.tamano));
    ctx.font = `700 ${tamano}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lineas = [];
    let actual = "";
    limpio.contenido.split(/\s+/).forEach((palabra) => {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (ctx.measureText(prueba).width > ancho - margen * 2 && actual) {
        lineas.push(actual);
        actual = palabra;
      } else {
        actual = prueba;
      }
    });
    if (actual) lineas.push(actual);
    const altoLinea = tamano * 1.25;
    const bloque = lineas.length * altoLinea;
    const y = limpio.posicion === "arriba" ? margen + bloque / 2 : limpio.posicion === "centro" ? alto / 2 : alto - margen - bloque / 2;
    lineas.forEach((linea, indice) => {
      const posY = y + indice * altoLinea;
      if (limpio.fondo) {
        const anchoTexto = ctx.measureText(linea).width;
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(ancho / 2 - anchoTexto / 2 - 12, posY - altoLinea / 2, anchoTexto + 24, altoLinea);
      }
      ctx.fillStyle = limpio.color;
      ctx.fillText(linea, ancho / 2, posY);
    });
  }

  function pintarVineta(ctx, ancho, alto) {
    const fuerza = normalizarAjustes(ajustes).vineta;
    if (fuerza <= 0) return;
    const gradiente = ctx.createRadialGradient(ancho / 2, alto / 2, Math.min(ancho, alto) * 0.25, ancho / 2, alto / 2, Math.max(ancho, alto) * 0.72);
    gradiente.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradiente.addColorStop(1, `rgba(0, 0, 0, ${(0.75 * fuerza).toFixed(2)})`);
    ctx.fillStyle = gradiente;
    ctx.fillRect(0, 0, ancho, alto);
  }

  async function exportarImagen() {
    const imagen = new Image();
    imagen.crossOrigin = "anonymous";
    imagen.src = url;
    // `decode` no existe en todos los navegadores ni en las pruebas: si no
    // está, se sigue de largo y basta con que la imagen ya esté cargada.
    if (typeof imagen.decode === "function") await imagen.decode().catch(() => {});
    if (!imagen.naturalWidth) throw new Error("No se pudo leer la imagen.");
    const caja = cajaRecorte(imagen.naturalWidth, imagen.naturalHeight, medida);
    const factor = calidadPorId(calidad).escala;
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(caja.ancho * factor));
    lienzo.height = Math.max(1, Math.round(caja.alto * factor));
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("Este navegador no permitió procesar la imagen.");
    ctx.filter = filtroCss;
    ctx.drawImage(imagen, caja.x, caja.y, caja.ancho, caja.alto, 0, 0, lienzo.width, lienzo.height);
    pintarVineta(ctx, lienzo.width, lienzo.height);
    pintarTexto(ctx, lienzo.width, lienzo.height);
    const blob = await new Promise((resolver) => lienzo.toBlob?.(resolver, "image/jpeg", calidadPorId(calidad).jpeg));
    if (!blob) throw new Error("No se pudo generar la imagen editada.");
    return new File([blob], `${nombreArchivo("imagen")}.jpg`, { type: "image/jpeg" });
  }

  async function aplicar() {
    setAviso("");
    setProcesando(true);
    try {
      if (esVideo) {
        // La línea de tiempo viaja con referencias: el clip 1 es el archivo
        // principal y los demás se suben al publicar. Así la receta nunca
        // guarda una dirección temporal del navegador.
        const linea = clips.map((clip, indice) => ({
          // La referencia apunta a la fuente, no a la pieza: al dividir una
          // toma, las dos mitades salen del mismo archivo y se sube una vez.
          ref: clip.fuente || (indice === 0 ? "principal" : clip.id),
          tipo: clip.tipo,
          duracion: clip.duracion,
          inicio: clip.inicio,
          fin: clip.fin || clip.duracion,
          velocidad: clip.velocidad,
          transicion: clip.transicion
        }));
        // La voz del catálogo entra en la receta tal cual; la grabación
        // todavía no tiene dirección, así que viaja aparte y se sube al
        // publicar, cuando ya puede tener su url.
        const vozCatalogo = !vozArchivo && (voz.voiceId || voz.url)
          ? recortarVoz(voz)
          : null;
        const receta = recetaVideo({
          duracion: duracion || corte.fin,
          corte,
          filtroId,
          intensidad,
          ajustes,
          musica: musica.trackId ? { ...musicaRecortada, trackId: musica.trackId, titulo: musica.titulo } : null,
          texto,
          medida,
          clips: linea.map(({ ref, ...resto }) => resto),
          voz: vozCatalogo
        });
        const problemas = validarReceta(receta);
        if (problemas.length) throw new Error(problemas[0]);
        onApply?.({
          tipo: "video",
          receta,
          portada,
          linea,
          // Los archivos que hay que subir, agrupados por fuente: si una toma
          // se partió en dos, las dos mitades salen del mismo archivo y se
          // sube una sola vez.
          archivos: clips
            .filter((clip) => clip.fuente && clip.fuente !== "principal" && clip.file)
            .filter((clip, posicion, lista) => lista.findIndex((otro) => otro.fuente === clip.fuente) === posicion)
            .map((clip) => ({ ref: clip.fuente, file: clip.file })),
          // La toma de voz grabada, con su tramo ya recortado.
          voz: vozArchivo
            ? { ...recortarVoz(voz), nombre: voz.nombre || "Voz grabada", file: vozArchivo }
            : null
        });
      } else {
        const archivo = await exportarImagen();
        onApply?.({
          tipo: "imagen",
          archivo,
          receta: {
            version: 1,
            medida,
            calidad,
            filtro: { id: filtroId, intensidad, css: filtroCss },
            ajustes: normalizarAjustes(ajustes),
            texto: normalizarTexto(texto)
          }
        });
      }
    } catch (error) {
      setAviso(error.message || "No se pudo aplicar la edición.");
    } finally {
      setProcesando(false);
    }
  }

  if (!open || !url) return null;

  const pistas = filtrarCatalogo(catalogo.pistas, busqueda);

  return createPortal(
    <div className="k-studio" role="dialog" aria-modal="true" aria-label={title || "Estudio de medios"}>
      <header className="k-studio-header">
        <div className="k-studio-titulo">
          <strong>{title || (esVideo ? "Editar video" : "Editar foto")}</strong>
          <small>{esVideo ? "Recorta, filtra, ponle música y portada" : "Filtros, tono, texto y música"}</small>
        </div>
        <div className="k-studio-header-acciones">
          <button type="button" className="k-button k-button-ghost" onClick={restablecer} disabled={procesando}>
            Restablecer
          </button>
          <button ref={cerrarRef} type="button" className="k-studio-cerrar" onClick={() => onCancel?.()} aria-label="Cerrar estudio" disabled={procesando}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      <div className="k-studio-cuerpo">
        <section className="k-studio-escenario" aria-label="Vista previa">
          <div className={`k-studio-lienzo${MEDIDAS[medida]?.ratio ? " con-recorte" : ""}`} style={MEDIDAS[medida]?.ratio ? { aspectRatio: MEDIDAS[medida].ratio } : undefined}>
            {esVideo ? (
              <video
                ref={videoRef}
                src={url}
                controls
                playsInline
                preload="metadata"
                muted={corte.silenciar}
                style={{ filter: filtroCss }}
                onLoadedMetadata={(evento) => {
                  const largo = Math.round(evento.currentTarget.duration || 0);
                  setDuracion(largo);
                  setCorte((previo) => ({ ...previo, fin: previo.fin || largo }));
                }}
                aria-label="Vista previa de video"
              />
            ) : (
              <img src={url} alt="Vista previa de la foto" style={{ filter: filtroCss }} />
            )}
            {normalizarAjustes(ajustes).vineta > 0 && (
              <span
                className="k-studio-vineta"
                aria-hidden="true"
                style={{ opacity: normalizarAjustes(ajustes).vineta }}
              />
            )}
            {normalizarAjustes(ajustes).grano > 0 && (
              <span
                className="k-studio-grano"
                aria-hidden="true"
                style={{ opacity: normalizarAjustes(ajustes).grano * 0.35 }}
              />
            )}
            {texto.contenido && (
              <span className={`k-studio-texto es-${texto.posicion}`} style={{ color: texto.color, fontSize: `${0.9 * texto.tamano}rem`, background: texto.fondo ? "rgba(0,0,0,0.55)" : "transparent" }}>
                {texto.contenido}
              </span>
            )}
          </div>
          <p className="k-studio-medida">
            {MEDIDAS[medida]?.nombre || "Original"}
            {esVideo && duracion ? ` · ${formatearTiempo(duracion)} de video` : ""}
          </p>
        </section>

        <section className="k-studio-panel" aria-label="Ajustes de la edición">
          <div className="k-studio-tabs" role="tablist" aria-label="Secciones del estudio">
            {(esVideo ? ["clips", "corte", "filtros", "ajustes", "musica", "voz", "texto", "salida"] : ["filtros", "ajustes", "texto", "musica", "salida"]).map((seccion) => (
              <button
                key={seccion}
                type="button"
                role="tab"
                aria-selected={tab === seccion}
                className={`k-studio-tab${tab === seccion ? " is-activa" : ""}`}
                onClick={() => setTab(seccion)}
              >
                {{ clips: "Clips", corte: "Corte", filtros: "Filtros", ajustes: "Ajustes", texto: "Texto", musica: "Música", voz: "Voz", salida: "Salida" }[seccion]}
              </button>
            ))}
          </div>

          <div className="k-studio-contenido">
            {tab === "clips" && esVideo && (
              <div className="k-studio-bloque">
                <p className="k-studio-nota">
                  La pieza se arma con tomas en orden. El primer clip es el video que abriste; agrega los demás,
                  súbelos o bájalos de lugar y recorta cada uno. Duración total: {formatearTiempo(duracionTotalClips(clips))}.
                </p>
                <div className="k-studio-clips" role="list">
                  {clips.map((clip, indice) => (
                    <div
                      key={clip.id}
                      role="listitem"
                      className={`k-studio-clip${clipActivo === indice ? " is-activo" : ""}`}
                    >
                      <button
                        type="button"
                        className="k-studio-clip-nombre"
                        onClick={() => setClipActivo(indice)}
                        aria-pressed={clipActivo === indice}
                      >
                        <span className="k-studio-clip-orden">{indice + 1}</span>
                        <span className="k-studio-clip-titulo">{clip.nombre || `Clip ${indice + 1}`}</span>
                        <span className="k-studio-clip-meta">
                          {clip.tipo === "image" ? "Imagen" : formatearTiempo(duracionDeClip(clip))}
                          {clip.tipo === "video" && clip.velocidad !== 1 ? ` · ${VELOCIDADES.find((opcion) => opcion.id === clip.velocidad)?.etiqueta || `${clip.velocidad}x`}` : ""}
                          {clip.transicion?.tipo && clip.transicion.tipo !== "corte" ? ` · ${TRANSICIONES.find((opcion) => opcion.id === clip.transicion.tipo)?.etiqueta || clip.transicion.tipo}` : ""}
                        </span>
                      </button>
                      <div className="k-studio-clip-acciones">
                        <button
                          type="button"
                          className="k-studio-mini"
                          onClick={() => { setClips(moverClip(clips, indice, -1)); setClipActivo(Math.max(0, indice - 1)); }}
                          disabled={indice === 0}
                          aria-label={`Subir el clip ${indice + 1}`}
                        >
                          Subir
                        </button>
                        <button
                          type="button"
                          className="k-studio-mini"
                          onClick={() => { const nuevo = moverClip(clips, indice, 1); setClips(nuevo); setClipActivo(Math.min(nuevo.length - 1, indice + 1)); }}
                          disabled={indice === clips.length - 1}
                          aria-label={`Bajar el clip ${indice + 1}`}
                        >
                          Bajar
                        </button>
                        <button
                          type="button"
                          className="k-studio-mini"
                          onClick={() => {
                            if (clips.length <= 1) { setAviso("La pieza necesita al menos un clip."); return; }
                            setClips(quitarClip(clips, indice));
                            setClipActivo((previo) => Math.max(0, Math.min(previo, clips.length - 2)));
                          }}
                          aria-label={`Quitar el clip ${indice + 1}`}
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {clips[clipActivo]?.tipo === "video" && (
                  <div className="k-studio-bloque k-studio-clip-corte">
                    <p className="k-studio-nota">Tramo del clip {clipActivo + 1}</p>
                    <label className="k-studio-campo">
                      <span>Entra en · {formatearTiempo(clips[clipActivo].inicio)}</span>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(1, Math.round(clips[clipActivo].duracion || 1))}
                        value={clips[clipActivo].inicio}
                        onChange={(evento) => {
                          const valor = Number(evento.target.value);
                          setClips((previos) => previos.map((pieza, posicion) => (
                            posicion === clipActivo
                              ? { ...pieza, ...normalizarClip({ ...pieza, inicio: Math.min(valor, pieza.fin || Infinity) }) }
                              : pieza
                          )));
                        }}
                      />
                    </label>
                    <label className="k-studio-campo">
                      <span>Termina en · {formatearTiempo(clips[clipActivo].fin || clips[clipActivo].duracion)}</span>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(1, Math.round(clips[clipActivo].duracion || 1))}
                        value={clips[clipActivo].fin || clips[clipActivo].duracion}
                        onChange={(evento) => {
                          const valor = Number(evento.target.value);
                          setClips((previos) => previos.map((pieza, posicion) => (
                            posicion === clipActivo
                              ? { ...pieza, ...normalizarClip({ ...pieza, fin: Math.max(valor, pieza.inicio) }) }
                              : pieza
                          )));
                        }}
                      />
                    </label>

                    <p className="k-studio-nota">Velocidad · {formatearTiempo(duracionDeClip(clips[clipActivo]))} ya montado</p>
                    <div className="k-studio-velocidades" role="list">
                      {VELOCIDADES.map((opcion) => (
                        <button
                          key={opcion.id}
                          type="button"
                          role="listitem"
                          className={`k-studio-mini${clips[clipActivo].velocidad === opcion.id ? " is-activa" : ""}`}
                          onClick={() => setClips((previos) => previos.map((pieza, posicion) => (
                            posicion === clipActivo ? normalizarClip({ ...pieza, velocidad: opcion.id }) : pieza
                          )))}
                          aria-pressed={clips[clipActivo].velocidad === opcion.id}
                          aria-label={`Velocidad ${opcion.etiqueta}`}
                        >
                          {opcion.etiqueta}
                        </button>
                      ))}
                    </div>

                    <label className="k-studio-campo">
                      <span>Partir la toma en · {formatearTiempo(puntoDivision || clips[clipActivo].inicio)}</span>
                      <input
                        type="range"
                        min={clips[clipActivo].inicio}
                        max={Math.max(clips[clipActivo].inicio + 0.1, clips[clipActivo].fin || clips[clipActivo].duracion)}
                        step="0.1"
                        value={puntoDivision || clips[clipActivo].inicio}
                        onChange={(evento) => setPuntoDivision(Number(evento.target.value))}
                      />
                    </label>
                    <button
                      type="button"
                      className="k-button k-button-secondary"
                      onClick={() => {
                        const resultado = dividirClip(clips, clipActivo, puntoDivision || clips[clipActivo].inicio);
                        if (resultado.error) { setAviso(resultado.error); return; }
                        setClips(resultado.clips);
                        setAviso("");
                      }}
                    >
                      Dividir aquí
                    </button>
                  </div>
                )}

                {clipActivo > 0 && clips[clipActivo]?.tipo === "video" && (
                  <div className="k-studio-bloque k-studio-clip-transicion">
                    <label className="k-studio-campo">
                      <span>Transición con la toma anterior</span>
                      <select
                        value={clips[clipActivo].transicion?.tipo || "corte"}
                        onChange={(evento) => {
                          const tipo = evento.target.value;
                          const { previo, siguiente } = largosVecinos(clips, clipActivo);
                          const tope = topeTransicion(previo, siguiente);
                          setClips((previos) => previos.map((pieza, posicion) => (
                            posicion === clipActivo
                              ? normalizarClip({
                                ...pieza,
                                transicion: { tipo, duracion: tipo === "corte" ? 0 : Math.min(pieza.transicion?.duracion || tope / 2, tope) }
                              })
                              : pieza
                          )));
                        }}
                        aria-label="Transición con la toma anterior"
                      >
                        {TRANSICIONES.map((opcion) => (
                          <option key={opcion.id} value={opcion.id}>{opcion.etiqueta}</option>
                        ))}
                      </select>
                    </label>
                    {clips[clipActivo].transicion?.tipo !== "corte" && (
                      <label className="k-studio-campo">
                        <span>Duración de la transición · {clips[clipActivo].transicion.duracion.toFixed(1)} s</span>
                        <input
                          type="range"
                          min="0"
                          max={Math.max(0.1, topeTransicion(largosVecinos(clips, clipActivo).previo, largosVecinos(clips, clipActivo).siguiente))}
                          step="0.1"
                          value={clips[clipActivo].transicion.duracion}
                          onChange={(evento) => {
                            const { previo, siguiente } = largosVecinos(clips, clipActivo);
                            const tope = topeTransicion(previo, siguiente);
                            const duracion = Math.min(Number(evento.target.value), tope);
                            setClips((previos) => previos.map((pieza, posicion) => (
                              posicion === clipActivo ? normalizarClip({ ...pieza, transicion: { ...pieza.transicion, duracion } }) : pieza
                            )));
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}

                <div className="k-studio-clip-agregar">
                  <input
                    ref={clipInputRef}
                    type="file"
                    accept={esVideo ? "video/*,image/*" : "image/*"}
                    className="k-studio-oculto"
                    onChange={agregarArchivoComoClip}
                    aria-label="Agregar un clip a la línea de tiempo"
                  />
                  <button
                    type="button"
                    className="k-button k-button-secondary"
                    onClick={() => clipInputRef.current?.click()}
                    disabled={clips.length >= LIMITE_CLIPS}
                  >
                    Agregar clip
                  </button>
                  <span className="k-studio-nota">{clips.length} de {LIMITE_CLIPS}</span>
                </div>
                {aviso && <p className="k-studio-aviso" role="status">{aviso}</p>}
              </div>
            )}

            {tab === "corte" && esVideo && (
              <div className="k-studio-bloque">
                <label className="k-studio-campo">
                  <span>Inicio · {formatearTiempo(corte.inicio)}</span>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(1, Math.round(duracion || corte.fin || 1))}
                    value={corte.inicio}
                    onChange={(evento) => setCorte((previo) => ({ ...previo, inicio: Math.min(Number(evento.target.value), previo.fin || Infinity) }))}
                  />
                </label>
                <label className="k-studio-campo">
                  <span>Fin · {formatearTiempo(corte.fin || duracion)}</span>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(1, Math.round(duracion || corte.fin || 1))}
                    value={corte.fin || duracion}
                    onChange={(evento) => setCorte((previo) => ({ ...previo, fin: Math.max(Number(evento.target.value), previo.inicio) }))}
                  />
                </label>
                <label className="k-studio-switch">
                  <input type="checkbox" checked={corte.silenciar} onChange={(evento) => setCorte((previo) => ({ ...previo, silenciar: evento.target.checked }))} />
                  <span>Silenciar el audio original</span>
                </label>
                <button type="button" className="k-button k-button-secondary" onClick={capturarPortada} disabled={procesando}>
                  {portada ? "Cambiar portada" : "Usar este fotograma como portada"}
                </button>
                <p className="k-studio-nota">Duración del corte: {formatearTiempo(Math.max(0, (corte.fin || duracion) - corte.inicio))}</p>
              </div>
            )}

            {tab === "filtros" && (
              <div className="k-studio-bloque">
                <div className="k-studio-filtros" role="list">
                  {FILTROS.map((filtro) => (
                    <button
                      key={filtro.id}
                      type="button"
                      role="listitem"
                      className={`k-studio-filtro${filtroId === filtro.id ? " is-activo" : ""}`}
                      aria-label={filtro.nombre}
                      onClick={() => setFiltroId(filtro.id)}
                      aria-pressed={filtroId === filtro.id}
                    >
                      <span className="k-studio-filtro-muestra" style={{ backgroundImage: `url(${url})`, filter: filtro.css }} aria-hidden="true" />
                      <span>{filtro.nombre}</span>
                    </button>
                  ))}
                </div>
                <label className="k-studio-campo">
                  <span>Intensidad · {Math.round(intensidad * 100)}%</span>
                  <input type="range" min="0" max="1" step="0.05" value={intensidad} onChange={(evento) => setIntensidad(Number(evento.target.value))} />
                </label>
              </div>
            )}

            {tab === "ajustes" && (
              <div className="k-studio-bloque">
                {Object.entries(LIMITES_AJUSTE).map(([clave, [minimo, maximo]]) => (
                  <label className="k-studio-campo" key={clave}>
                    <span>
                      {ETIQUETAS_AJUSTE[clave]} · {Math.round(((ajustes[clave] ?? AJUSTES_BASE[clave]) - (clave === "brillo" || clave === "contraste" || clave === "saturacion" ? 1 : 0)) * 100) / 100}
                    </span>
                    <input
                      type="range"
                      min={minimo}
                      max={maximo}
                      step={PASOS_AJUSTE[clave]}
                      value={ajustes[clave] ?? AJUSTES_BASE[clave]}
                      onChange={(evento) => setAjustes((previo) => ({ ...previo, [clave]: Number(evento.target.value) }))}
                    />
                  </label>
                ))}
                <p className="k-studio-nota">Los ajustes se suman al filtro elegido: {cssAjustes(ajustes) === "none" ? "sin cambios de tono" : cssAjustes(ajustes)}</p>
              </div>
            )}

            {tab === "voz" && esVideo && (
              <div className="k-studio-bloque">
                <p className="k-studio-nota">
                  La voz en off suena sobre la pieza. Graba la tuya con el micrófono o elige una voz del
                  catálogo; después ajustas dónde entra, su volumen y sus fundidos.
                </p>

                <div className="k-studio-fila">
                  {grabando ? (
                    <button type="button" className="k-button k-button-primary" onClick={terminarGrabacion}>
                      Terminar la grabación
                    </button>
                  ) : (
                    <button type="button" className="k-button k-button-secondary" onClick={empezarGrabacion}>
                      {vozArchivo ? "Grabar otra vez" : "Grabar la voz"}
                    </button>
                  )}
                  {(vozArchivo || voz.voiceId || voz.url) && (
                    <button type="button" className="k-button k-button-ghost" onClick={quitarVoz}>
                      Quitar la voz
                    </button>
                  )}
                </div>

                {vozPreview && (
                  <audio src={vozPreview} controls aria-label="Vista previa de la voz grabada" style={{ width: "100%" }} />
                )}

                {(vozArchivo || voz.voiceId || voz.url) && (
                  <>
                    <label className="k-studio-campo">
                      <span>Nombre de la voz</span>
                      <input
                        type="text"
                        value={voz.nombre}
                        maxLength={120}
                        onChange={(evento) => setVoz((previo) => ({ ...previo, nombre: evento.target.value }))}
                        placeholder="Voz en off"
                      />
                    </label>
                    <label className="k-studio-campo">
                      <span>Entra en la pieza · {formatearTiempo(recortarVoz(voz).inicio)}</span>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(1, Math.round(duracion || voz.fin || 1))}
                        value={voz.inicio}
                        onChange={(evento) => setVoz((previo) => ({ ...previo, inicio: Number(evento.target.value) }))}
                      />
                    </label>
                    <label className="k-studio-campo">
                      <span>Termina en · {formatearTiempo(recortarVoz(voz).fin)}</span>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(1, Math.round(duracion || voz.fin || 1))}
                        value={voz.fin || recortarVoz(voz).fin}
                        onChange={(evento) => setVoz((previo) => ({ ...previo, fin: Number(evento.target.value) }))}
                      />
                    </label>
                    <label className="k-studio-campo">
                      <span>Volumen de la voz · {Math.round(recortarVoz(voz).volumen * 100)}%</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={voz.volumen}
                        onChange={(evento) => setVoz((previo) => ({ ...previo, volumen: Number(evento.target.value) }))}
                      />
                    </label>
                    <div className="k-studio-fila">
                      <label className="k-studio-campo">
                        <span>Sube en · {recortarVoz(voz).fundidoEntrada.toFixed(1)} s</span>
                        <input
                          type="range"
                          min="0"
                          max="5"
                          step="0.5"
                          value={voz.fundidoEntrada}
                          onChange={(evento) => setVoz((previo) => ({ ...previo, fundidoEntrada: Number(evento.target.value) }))}
                        />
                      </label>
                      <label className="k-studio-campo">
                        <span>Baja en · {recortarVoz(voz).fundidoSalida.toFixed(1)} s</span>
                        <input
                          type="range"
                          min="0"
                          max="5"
                          step="0.5"
                          value={voz.fundidoSalida}
                          onChange={(evento) => setVoz((previo) => ({ ...previo, fundidoSalida: Number(evento.target.value) }))}
                        />
                      </label>
                    </div>
                  </>
                )}

                <div className="k-studio-bloque k-studio-locucion">
                  <label className="k-studio-campo">
                    <span>Texto de la locución</span>
                    <textarea
                      value={textoLocucion}
                      maxLength={1200}
                      rows={4}
                      onChange={(evento) => setTextoLocucion(evento.target.value)}
                      placeholder="Escribe lo que se va a decir; arranca con el texto de la publicación"
                      aria-label="Texto de la locución"
                    />
                  </label>
                  <div className="k-studio-fila">
                    <button
                      type="button"
                      className="k-button k-button-primary"
                      onClick={generarLaVoz}
                      disabled={generandoVoz || !textoLocucion.trim() || !voces.servicio.listo}
                    >
                      {generandoVoz ? "Generando la voz..." : "Generar la locución"}
                    </button>
                    <span className="k-studio-nota">
                      {voces.servicio.listo
                        ? `Modelo: ${voces.servicio.modelo || "el del servidor"}`
                        : "El servicio de voz del servidor no está configurado."}
                    </span>
                  </div>
                </div>

                {voces.voces.length === 0 ? (
                  <p className="k-studio-nota k-studio-nota-aviso">{voces.motivo || "Cargando voces..."}</p>
                ) : (
                  <>
                    <label className="k-studio-campo">
                      <span>Buscar voz del catálogo</span>
                      <input
                        type="search"
                        value={busquedaVoz}
                        onChange={(evento) => setBusquedaVoz(evento.target.value)}
                        placeholder="Nombre, idioma o tipo"
                      />
                    </label>
                    <div className="k-studio-musica" role="list">
                      {filtrarVoces(voces.voces, busquedaVoz).map((opcion) => (
                        <button
                          key={opcion._id}
                          type="button"
                          role="listitem"
                          className={`k-studio-pista${voz.voiceId === opcion._id ? " is-activa" : ""}`}
                          aria-label={`${opcion.nombre}${opcion.motivo ? `. ${opcion.motivo}` : ""}`}
                          aria-pressed={voz.voiceId === opcion._id}
                          disabled={!opcion.disponible}
                          onClick={() => setVoz({
                            ...VOZ_BASE,
                            voiceId: opcion._id,
                            nombre: opcion.nombre,
                            url: opcion.url,
                            tipo: opcion.tipo,
                            fin: opcion.duracion
                          })}
                        >
                          <strong>{opcion.nombre}</strong>
                          <small>
                            {[opcion.idioma, opcion.genero, opcion.tipo === "catalogo" ? "Catálogo" : "Propia"]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                          {opcion.motivo && <small>{opcion.motivo}</small>}
                        </button>
                      ))}
                    </div>
                    {!voces.servicio.listo && voces.voces.some((opcion) => opcion.tipo === "catalogo") && (
                      <p className="k-studio-nota k-studio-nota-aviso">
                        El servicio de voz del servidor todavía no está configurado: las voces del catálogo
                        aparecen en gris hasta que lo esté. La grabación propia funciona igual.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === "texto" && (
              <div className="k-studio-bloque">
                <label className="k-studio-campo">
                  <span>Texto sobre el {esVideo ? "video" : "la foto"}</span>
                  <textarea
                    rows="2"
                    maxLength={140}
                    value={texto.contenido}
                    onChange={(evento) => setTexto((previo) => ({ ...previo, contenido: evento.target.value }))}
                    placeholder="Escribe algo corto"
                  />
                </label>
                <div className="k-studio-fila">
                  {POSICIONES.map((posicion) => (
                    <button
                      key={posicion.id}
                      type="button"
                      className={`k-button ${texto.posicion === posicion.id ? "k-button-primary" : "k-button-secondary"}`}
                      onClick={() => setTexto((previo) => ({ ...previo, posicion: posicion.id }))}
                    >
                      {posicion.nombre}
                    </button>
                  ))}
                </div>
                <label className="k-studio-campo">
                  <span>Tamaño · {Math.round(texto.tamano * 100)}%</span>
                  <input type="range" min="0.6" max="2" step="0.05" value={texto.tamano} onChange={(evento) => setTexto((previo) => ({ ...previo, tamano: Number(evento.target.value) }))} />
                </label>
                <div className="k-studio-fila">
                  <label className="k-studio-color">
                    <span>Color</span>
                    <input type="color" value={texto.color} onChange={(evento) => setTexto((previo) => ({ ...previo, color: evento.target.value }))} />
                  </label>
                  <label className="k-studio-switch">
                    <input type="checkbox" checked={texto.fondo} onChange={(evento) => setTexto((previo) => ({ ...previo, fondo: evento.target.checked }))} />
                    <span>Fondo para leerlo</span>
                  </label>
                </div>
              </div>
            )}

            {tab === "musica" && (
              <div className="k-studio-bloque">
                {catalogo.pistas.length === 0 ? (
                  <p className="k-studio-nota k-studio-nota-aviso">{catalogo.motivo || "Cargando catálogo..."}</p>
                ) : (
                  <>
                    <label className="k-studio-campo">
                      <span>Buscar pista</span>
                      <input type="search" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Título, autor o etiqueta" />
                    </label>
                    <div className="k-studio-musica" role="list">
                      {pistas.map((pista) => (
                        <button
                          key={pista._id}
                          type="button"
                          role="listitem"
                          className={`k-studio-pista${musica.trackId === pista._id ? " is-activa" : ""}`}
                          aria-label={`${pista.titulo}${pista.autor ? `, ${pista.autor}` : ""}`}
                          onClick={() => setMusica((previo) => ({ ...previo, trackId: pista._id, titulo: pista.titulo, fin: pista.duracion }))}
                          aria-pressed={musica.trackId === pista._id}
                        >
                          <strong>{pista.titulo}</strong>
                          <small>{[pista.autor, formatearTiempo(pista.duracion)].filter(Boolean).join(" · ")}</small>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {musica.trackId && (
                  <>
                    <label className="k-studio-campo">
                      <span>Entra en · {formatearTiempo(musicaRecortada.inicio)}</span>
                      <input type="range" min="0" max={Math.max(1, musica.fin || duracion || 60)} value={musica.inicio} onChange={(evento) => setMusica((previo) => ({ ...previo, inicio: Number(evento.target.value) }))} />
                    </label>
                    <label className="k-studio-campo">
                      <span>Termina en · {formatearTiempo(musicaRecortada.fin)}</span>
                      <input type="range" min="0" max={Math.max(1, musica.fin || duracion || 60)} value={musica.fin || musicaRecortada.fin} onChange={(evento) => setMusica((previo) => ({ ...previo, fin: Number(evento.target.value) }))} />
                    </label>
                    <label className="k-studio-campo">
                      <span>Volumen · {Math.round(musicaRecortada.volumen * 100)}%</span>
                      <input type="range" min="0" max="1" step="0.05" value={musica.volumen} onChange={(evento) => setMusica((previo) => ({ ...previo, volumen: Number(evento.target.value) }))} />
                    </label>
                    <div className="k-studio-fila">
                      <label className="k-studio-campo">
                        <span>Sube en · {musicaRecortada.fundidoEntrada.toFixed(1)} s</span>
                        <input type="range" min="0" max="5" step="0.5" value={musica.fundidoEntrada} onChange={(evento) => setMusica((previo) => ({ ...previo, fundidoEntrada: Number(evento.target.value) }))} />
                      </label>
                      <label className="k-studio-campo">
                        <span>Baja en · {musicaRecortada.fundidoSalida.toFixed(1)} s</span>
                        <input type="range" min="0" max="5" step="0.5" value={musica.fundidoSalida} onChange={(evento) => setMusica((previo) => ({ ...previo, fundidoSalida: Number(evento.target.value) }))} />
                      </label>
                    </div>
                    <button type="button" className="k-button k-button-ghost" onClick={() => setMusica({ trackId: "", titulo: "", inicio: 0, fin: 0, volumen: 0.8, fundidoEntrada: 0, fundidoSalida: 0 })}>
                      Quitar música
                    </button>
                  </>
                )}
              </div>
            )}

            {tab === "salida" && (
              <div className="k-studio-bloque">
                <label className="k-studio-campo">
                  <span>Medida</span>
                  <select value={medida} onChange={(evento) => setMedida(evento.target.value)}>
                    {Object.entries(MEDIDAS)
                      .filter(([id]) => (esVideo ? id !== "3:1" : true))
                      .map(([id, datos]) => (
                        <option key={id} value={id}>{datos.nombre}</option>
                      ))}
                  </select>
                </label>
                {!esVideo && (
                  <label className="k-studio-campo">
                    <span>Calidad</span>
                    <select value={calidad} onChange={(evento) => setCalidad(evento.target.value)}>
                      {CALIDADES.map((opcion) => (
                        <option key={opcion.id} value={opcion.id}>{opcion.nombre}</option>
                      ))}
                    </select>
                  </label>
                )}
                <p className="k-studio-nota">
                  {esVideo
                    ? "El video viaja con su receta de edición (corte, filtro, música y texto) y el servidor la aplica al procesarlo. No se vuelve a codificar en el teléfono."
                    : "La foto se genera aquí mismo con el filtro, el tono y el texto ya aplicados."}
                </p>
              </div>
            )}

            {aviso && <p className="k-studio-aviso" role="status">{aviso}</p>}
          </div>

          <footer className="k-studio-pie">
            <button type="button" className="k-button k-button-secondary" onClick={() => onCancel?.()} disabled={procesando}>
              Cancelar
            </button>
            <button type="button" className="k-button k-button-primary" onClick={aplicar} disabled={procesando}>
              {procesando ? "Aplicando..." : esVideo ? "Aplicar edición" : "Aplicar a la foto"}
            </button>
          </footer>
        </section>
      </div>
    </div>,
    document.body
  );
}

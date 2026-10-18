import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { generarLocucion, obtenerVoces } from "../../services/voiceService";
import { obtenerCatalogoMusica } from "../../services/musicService";
import { mediaUrl } from "../../services/mediaUrl";

export default function AudioTools({ catalogo = false }) {
  const [texto, setTexto] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const voces = useQuery({ queryKey: ["studio", "voices"], queryFn: obtenerVoces });
  const musica = useQuery({ queryKey: ["studio", "music"], queryFn: obtenerCatalogoMusica, enabled: catalogo });
  const generacion = useMutation({ mutationFn: generarLocucion });
  const servicio = voces.data?.servicio;
  const disponibles = (voces.data?.voces || []).filter((voz) => voz.disponible && voz.tipo === "catalogo");
  const limite = servicio?.limites?.texto || 1200;
  const lista = catalogo ? [...(voces.data?.voces || []), ...(musica.data?.pistas || [])] : [];
  const loading = voces.isPending || (catalogo && musica.isPending);
  const error = voces.data?.motivo || (catalogo ? musica.data?.motivo : "") || (voces.isError || (catalogo && musica.isError) ? "No se pudieron cargar los catálogos. Vuelve a intentarlo." : "");

  function generar(event) {
    event.preventDefault();
    if (!servicio?.listo || generacion.isPending || !texto.trim()) return;
    generacion.mutate({ texto: texto.trim(), voiceId });
  }

  return (
    <section className="page k-feature-page">
      <header className="k-page-header">
        <div>
          <h1>{catalogo ? "Voces y música" : "Audio (locución)"}</h1>
          <p>{catalogo ? "Catálogos reales del servidor, sin pistas ni voces de relleno. Se muestran hasta 60 entradas por catálogo." : "Convierte tu texto en voz con el proveedor configurado en Kronos. No se genera nada al abrir esta página."}</p>
        </div>
        <Link className="k-button k-button-secondary" to="/pantallas">Todas las funciones</Link>
      </header>
      <nav className="k-feature-actions" aria-label="Herramientas de audio">
        <Link to="/kairos/audio">Locución</Link><Link to="/kairos/catalogs">Voces y música</Link><Link to="/kairos/studio">Estudio de edición</Link>
      </nav>
      {loading && <p role="status">Cargando catálogo…</p>}
      {error && <div className="k-state k-state-error" role="alert"><p>{error}</p><button className="k-button k-button-secondary" type="button" onClick={() => { voces.refetch(); if (catalogo) musica.refetch(); }}>Reintentar</button></div>}
      {catalogo ? (
        !loading && <>
          {!lista.length && !error && <p role="status">Todavía no hay voces ni pistas publicadas.</p>}
          <ul className="k-indice-lista">
            {lista.map((item) => (
              <li className="k-feature-panel" key={`${item.nombre ? "voz" : "musica"}-${item._id}`}>
                <h2>{item.nombre || item.titulo}</h2>
                <p>{item.descripcion || item.autor || item.idioma}</p>
                {item.disponible === false && <p>No disponible: {item.motivo || "El proveedor no está configurado."}</p>}
                {item.url && <audio controls preload="none" src={mediaUrl(item.url)} aria-label={`Escuchar ${item.nombre || item.titulo}`} />}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <form className="k-feature-panel k-feature-form" onSubmit={generar}>
          {!loading && !error && !servicio?.listo && <p role="status">La locución no está disponible: falta configurar el servicio de voz en el servidor.</p>}
          <label>Voz
            <select className="k-input" value={voiceId} onChange={(event) => setVoiceId(event.target.value)} disabled={generacion.isPending}>
              <option value="">Voz predeterminada del servidor</option>
              {disponibles.map((voz) => <option value={voz._id} key={voz._id}>{voz.nombre} · {voz.idioma}</option>)}
            </select>
          </label>
          <label>Texto de la locución
            <textarea className="k-input" required maxLength={limite} rows={6} value={texto} onChange={(event) => setTexto(event.target.value)} disabled={generacion.isPending} />
          </label>
          <p>{texto.length}/{limite} caracteres. Generar puede consumir crédito del proveedor configurado.</p>
          <button className="k-button k-button-primary" type="submit" disabled={!servicio?.listo || !texto.trim() || generacion.isPending}>
            {generacion.isPending ? "Generando…" : "Generar locución"}
          </button>
          {generacion.isError && <p role="alert">{generacion.error.response?.data?.error || generacion.error.message || "No se pudo generar la locución."}</p>}
          {generacion.data?.url && <div><p>Locución generada</p><audio controls src={mediaUrl(generacion.data.url)} aria-label="Locución generada" /></div>}
        </form>
      )}
    </section>
  );
}

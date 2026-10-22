import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Image,
  Clapperboard,
  FileText,
  History,
  AudioLines,
  LayoutGrid,
  Film,
  Wand2,
  Layers,
  CircleHelp
} from "lucide-react";
import { SceneBackground } from "../../three";
import { api } from "../../services/apiClient";

/* ============================================================
   KAIROS — estudio de creación

   Antes esta pantalla era una lista de cuatro enlaces. Ahora es el
   tablero del estudio, con cuatro áreas separadas y sin mezclar:

     1. Crear        qué se va a producir (imagen, video, guion, audio)
     2. Armar        cómo se ordena la producción (guiones, tomas,
                     biblioteca, trabajos)
     3. Ajustar      con qué se produce (voces, música, formatos)
     4. Revisar      qué salió y qué costó (historial, uso)

   Cada tarjeta dice si la capacidad está lista o si le falta una
   variable del servidor. Nada se ofrece como listo si no lo está.
   ============================================================ */

const AREAS = [
  {
    id: "crear",
    titulo: "Crear",
    nota: "Produce una pieza desde cero.",
    tarjetas: [
      { to: "/kairos/image", nombre: "Imagen", detalle: "Conceptos, escenas y variaciones desde un texto.", Icono: Image, capacidad: "imagen" },
      { to: "/kairos/video", nombre: "Video", detalle: "De idea a pieza audiovisual, con tomas y duración.", Icono: Clapperboard, capacidad: "video" },
      { to: "/kairos/script", nombre: "Guion", detalle: "Estructura de reels, campañas e historias por escenas.", Icono: FileText, capacidad: "texto" },
      { to: "/kairos/audio", nombre: "Audio", detalle: "Locución desde el texto y voz en off grabada, en la pestaña Voz del estudio.", Icono: AudioLines, capacidad: "voz" }
    ]
  },
  {
    id: "armar",
    titulo: "Armar",
    nota: "Ordena la producción por escenas.",
    tarjetas: [
      { to: "/projects", nombre: "Proyectos", detalle: "Un tablero por pieza: guion, tomas, música y versiones.", Icono: LayoutGrid },
      { to: "/projects/plantillas", nombre: "Plantillas", detalle: "Reels, cuadrado y portada con los textos ya armados.", Icono: LayoutGrid },
      { to: "/kairos/video/jobs", nombre: "Trabajos", detalle: "Lo que está en cola, lo que corre y lo que falló.", Icono: Film, capacidad: "trabajos" },
      { to: "/library", nombre: "Biblioteca", detalle: "Todo lo generado, ordenado y reutilizable.", Icono: Layers, capacidad: "biblioteca" }
    ]
  },
  {
    id: "ajustar",
    titulo: "Ajustar",
    nota: "Define con qué se produce.",
    tarjetas: [
      { to: "/kairos/catalogs", nombre: "Voces y música", detalle: "Catálogos de voces y pistas del servidor.", Icono: Wand2 },
      { to: "/kairos/studio", nombre: "Filtros y tono", detalle: "16 filtros y 8 ajustes de tono, en el estudio de cada publicación.", Icono: Wand2, capacidad: "filtros" },
      { to: "/kairos/history", nombre: "Historial", detalle: "Revisa, reutiliza y compara generaciones anteriores.", Icono: History, capacidad: "historial" }
    ]
  }
];

const ETIQUETA_ESTADO = {
  listo: "Listo",
  falta: "Falta configurar",
  revision: "En revisión"
};

export default function AICenter() {
  const [capacidades, setCapacidades] = useState(null);

  useEffect(() => {
    let vivo = true;
    api
      .get("/kairos/capacidades")
      .then(({ data }) => {
        if (vivo && data && typeof data === "object") setCapacidades(data);
      })
      .catch(() => {
        if (vivo) setCapacidades(null);
      });
    return () => {
      vivo = false;
    };
  }, []);

  function estadoDe(capacidad) {
    if (!capacidades) return null;
    const valor = capacidades[capacidad];
    if (!valor) return null;
    if (valor === true || valor?.listo === true) return "listo";
    if (valor?.revision) return "revision";
    return "falta";
  }

  return (
    <section className="page k-kairos-page">
      <header className="k-kairos-hero">
        {/* Orbe cromado decorativo: chunk diferido + fallback CSS,
            recortado por el propio hero (overflow: hidden). */}
        <SceneBackground scene="kairos-orb" className="k-scene--kairos" />
        <div>
          <h1>Kairos</h1>
          <p>Estudio de creación con IA</p>
          <span>Imagen, video, guion y audio con el mismo orden: se crea, se arma, se ajusta y se revisa.</span>
        </div>
        <Link className="k-button k-button-secondary" to="/kairos/history">
          Abrir historial
        </Link>
      </header>

      <div className="k-kairos-areas">
        {AREAS.map((area) => (
          <section className="k-kairos-area" key={area.id} aria-labelledby={`kairos-${area.id}`}>
            <header className="k-kairos-area-header">
              <h2 id={`kairos-${area.id}`}>{area.titulo}</h2>
              <p>{area.nota}</p>
            </header>
            <div className="k-kairos-grid">
              {area.tarjetas.map(({ to, nombre, detalle, Icono, capacidad }) => {
                const estado = estadoDe(capacidad);
                const cuerpo = (
                  <>
                    <span className="k-kairos-icon">
                      <Icono size={22} />
                    </span>
                    <div>
                      <h3>{nombre}</h3>
                      <p>{detalle}</p>
                      {estado && (
                        <span className={`k-kairos-estado es-${estado}`}>
                          {estado === "falta" && capacidades?.[capacidad]?.falta?.length
                            ? `Falta ${capacidades[capacidad].falta.join(", ")}`
                            : ETIQUETA_ESTADO[estado]}
                        </span>
                      )}
                    </div>
                  </>
                );
                // Tarjeta sin ruta todavía: se muestra igual, pero no se
                // enlaza a una pantalla que no existe.
                if (!to) {
                  return (
                    <div className="k-kairos-tool" key={nombre}>
                      {cuerpo}
                    </div>
                  );
                }
                return (
                  <Link className="k-kairos-tool" to={to} key={to}>
                    {cuerpo}
                    <span className="k-kairos-arrow">↗</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <aside className="k-kairos-regla" aria-label="Como funciona el estudio">
        <CircleHelp size={18} />
        <p>
          Cada pieza guarda su receta: guion, tomas, ajustes de imagen, música y versiones.
          Así se puede repetir, comparar y corregir sin empezar de nuevo.
        </p>
      </aside>
    </section>
  );
}

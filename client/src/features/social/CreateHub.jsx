import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Bookmark,
  ImagePlus,
  Library,
  Sparkles,
  UsersRound
} from "lucide-react";

const DESTINATIONS = [
  {
    to: "/create/post",
    title: "Nueva publicación",
    description: "Comparte texto, imágenes, carruseles o video con la audiencia que elijas.",
    eyebrow: "SOCIAL",
    action: "Abrir editor",
    icon: ImagePlus,
    tone: "primary"
  },
  {
    to: "/kairos",
    title: "Crear con Kairos",
    description: "Genera imágenes, videos o guiones y llévalos después a tu espacio social.",
    eyebrow: "IA CREATIVA",
    action: "Abrir Kairos",
    icon: Sparkles,
    tone: "ai"
  },
  {
    to: "/library",
    title: "Biblioteca multimedia",
    description: "Revisa y reutiliza las generaciones que ya tienes guardadas.",
    eyebrow: "RECURSOS",
    action: "Ver biblioteca",
    icon: Library,
    tone: "secondary"
  },
  {
    to: "/saved",
    title: "Guardados y colecciones",
    description: "Organiza ideas, referencias y publicaciones para volver a ellas cuando quieras.",
    eyebrow: "INSPIRACIÓN",
    action: "Abrir guardados",
    icon: Bookmark,
    tone: "secondary"
  },
  {
    to: "/circles",
    title: "Círculos privados",
    description: "Define quién puede ver publicaciones íntimas o de trabajo en grupo.",
    eyebrow: "AUDIENCIA",
    action: "Gestionar círculos",
    icon: UsersRound,
    tone: "secondary"
  },
  {
    to: "/orbits",
    title: "Órbitas y comunidades",
    description: "Crea espacios con reglas, roles y un feed propio para tu comunidad.",
    eyebrow: "COMUNIDAD",
    action: "Explorar órbitas",
    icon: UsersRound,
    tone: "secondary"
  }
];

export default function CreateHub() {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const orbitId = searchParams.get("orbitId") || location.state?.orbitId || "";
  const orbitName = searchParams.get("orbitName") || location.state?.orbitName || "";
  const circleId = searchParams.get("circleId") || location.state?.circleId || "";
  const circleName = searchParams.get("circleName") || location.state?.circleName || "";

  const postTargetUrl = orbitId
    ? `/create/post?orbitId=${encodeURIComponent(orbitId)}${orbitName ? `&orbitName=${encodeURIComponent(orbitName)}` : ""}`
    : circleId
      ? `/create/post?circleId=${encodeURIComponent(circleId)}${circleName ? `&circleName=${encodeURIComponent(circleName)}` : ""}`
      : "/create/post";

  const postTargetLabel = orbitId
    ? `Publicar en ${orbitName || "órbita"}`
    : circleId
      ? `Publicar en ${circleName || "círculo"}`
      : "Nueva publicación";

  return (
    <section className="page k-create-hub" aria-labelledby="create-hub-title">
      <header className="k-page-header k-create-hub-header">
        <div>
          <p className="k-eyebrow">CENTRO DE CREACIÓN</p>
          <h1 id="create-hub-title">Tu espacio para crear</h1>
          <p>Una entrada clara para publicar, trabajar con Kairos y organizar lo que ya tienes.</p>
        </div>
        <Link className="k-button k-button-ghost" to="/home">Volver a Inicio</Link>
      </header>

      <section className="k-create-hub-hero" aria-labelledby="create-hub-hero-title">
        <div>
          <span className="k-create-hub-hero-kicker">DE LA IDEA A TU COMUNIDAD</span>
          <h2 id="create-hub-hero-title">Crea algo y decide dónde vive.</h2>
          <p>
            {orbitId
              ? `Estás creando contenido para la comunidad ${orbitName || "seleccionada"}.`
              : circleId
                ? `Estás creando contenido para tu círculo privado ${circleName || ""}.`
                : "Publica directamente, prepara una generación con Kairos o vuelve a una referencia guardada sin salir del mismo flujo."}
          </p>
        </div>
        <Link className="k-button k-button-primary" to={postTargetUrl}>
          <ImagePlus size={18} aria-hidden="true" />
          {postTargetLabel}
        </Link>
      </section>

      <div className="k-create-hub-grid" aria-label="Destinos de creación">
        {DESTINATIONS.map(({ to, title, description, eyebrow, action, icon: Icon, tone }) => (
          <Link className={`k-create-hub-card is-${tone}`} to={to} key={to}>
            <div className="k-create-hub-card-topline">
              <span className="k-create-hub-icon"><Icon size={21} aria-hidden="true" /></span>
              <span className="k-create-hub-card-eyebrow">{eyebrow}</span>
            </div>
            <div className="k-create-hub-card-copy">
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <span className="k-create-hub-card-action">
              {action}
              <ArrowRight size={16} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>

      <section className="k-create-hub-flow k-surface" aria-labelledby="create-hub-flow-title">
        <div>
          <p className="k-eyebrow">FLUJO KRONOS</p>
          <h2 id="create-hub-flow-title">Crear no termina en descargar.</h2>
          <p>El resultado puede convertirse en publicación, mensaje, colección o contenido para tu comunidad.</p>
        </div>
        <div className="k-create-hub-flow-steps" aria-label="Pasos del flujo de creación">
          <span><strong>01</strong>Idea</span>
          <span><strong>02</strong>Crear</span>
          <span><strong>03</strong>Compartir</span>
        </div>
      </section>
    </section>
  );
}

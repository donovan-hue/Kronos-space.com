import { Link } from "react-router-dom";
import { Image, Clapperboard, FileText, History, Sparkles } from "lucide-react";

const tools = [["/kairos/image", "Imagen", "Genera conceptos visuales desde un prompt.", Image], ["/kairos/video", "Video", "Convierte una idea en una pieza audiovisual.", Clapperboard], ["/kairos/script", "Script", "Estructura historias, reels y campañas.", FileText], ["/kairos/history", "Historial", "Revisa y reutiliza tus generaciones.", History]];

export default function AICenter() {
  return <section className="page k-kairos-page"><header className="k-kairos-hero"><div><p className="k-eyebrow"><Sparkles size={14} /> KAIROS / AI CREATION ENGINE</p><h1>KAIROS</h1><p>AI CREATION STUDIO</p><span>El motor creativo de Kronos para crear imágenes, videos y scripts sin salir de tu espacio.</span></div><Link className="k-button k-button-ai" to="/kairos/history">Abrir historial</Link></header><div className="k-kairos-grid">{tools.map(([to, title, description, Icon]) => <Link className="k-kairos-tool" to={to} key={to}><span className="k-kairos-icon"><Icon size={22} /></span><div><p className="k-eyebrow">KAIROS TOOL</p><h2>{title}</h2><p>{description}</p></div><span className="k-kairos-arrow">↗</span></Link>)}</div></section>;
}

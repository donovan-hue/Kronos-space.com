import { Bookmark, Compass, Home, ImagePlus, MessageCircle, Settings, Sparkles, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";

const links = [
  ["/home", "Inicio", Home],
  ["/explore", "Explorar", Compass],
  ["/saved", "Guardados", Bookmark],
  ["/create", "Crear", ImagePlus],
  ["/kairos", "Kairos", Sparkles],
  ["/messages", "Mensajes", MessageCircle],
  ["/profile", "Perfil", UserRound],
  ["/settings", "Configuración", Settings],
];

export default function Navigation() {
  return <aside className="k-navigation" aria-label="Navegación principal">
    <p className="k-eyebrow">KRONOS SOCIAL AI</p>
    <nav>{links.map(([to, label, Icon]) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? "is-active" : ""}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
  </aside>;
}

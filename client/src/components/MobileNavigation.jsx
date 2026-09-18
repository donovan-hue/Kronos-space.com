import { Bookmark, Compass, Home, ImagePlus, MessageCircle, Sparkles, UserRound, Users } from "lucide-react";
import { NavLink } from "react-router-dom";

const links = [["/home", "Inicio", Home], ["/explore", "Explorar", Compass], ["/saved", "Guardados", Bookmark], ["/create", "Crear", ImagePlus], ["/kairos", "Kairos", Sparkles], ["/messages", "Mensajes", MessageCircle], ["/conversations", "Grupos", Users], ["/profile", "Perfil", UserRound]];

export default function MobileNavigation() {
  return <nav className="k-mobile-navigation" aria-label="Navegación móvil">{links.map(([to, label, Icon]) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? "is-active" : ""}><Icon size={19} /><span>{label}</span></NavLink>)}</nav>;
}

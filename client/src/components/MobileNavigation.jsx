import { Bookmark, Compass, Home, ImagePlus, MessageCircle, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";

const links = [
  ["/home", "Inicio", Home],
  ["/explore", "Explorar", Compass],
  ["/saved", "Guardados", Bookmark],
  ["/create", "Crear", ImagePlus],
  ["/messages", "Mensajes", MessageCircle],
  ["/profile", "Perfil", UserRound],
];

export default function MobileNavigation() {
  return (
    <nav className="k-mobile-navigation" aria-label="Navegación móvil">
      {links.map(([to, label, Icon]) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => (isActive ? "is-active" : "")}
        >
          <Icon size={19} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

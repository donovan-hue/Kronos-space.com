import { Bookmark, Compass, Home, ImagePlus, MessageCircle, Settings, Sparkles, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";
import WetChromeSign from "./ui/WetChromeSign";

const links = [
  ["/home", "Inicio", Home],
  ["/explore", "Explorar", Compass],
  ["/saved", "Guardados", Bookmark],
  ["/create", "Crear", ImagePlus],
  ["/kairos", "Kairos AI", Sparkles],
  ["/messages", "Mensajes", MessageCircle],
  ["/profile", "Perfil", UserRound],
  ["/settings", "Configuración", Settings],
];

export default function Navigation() {
  return (
    <aside className="k-navigation" aria-label="Navegación principal">
      <div className="k-navigation-brand">
        <WetChromeSign size="sm" ariaLabel="kronos-space.com" />
      </div>
      <nav>
        {links.map(([to, label, Icon]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? "is-active" : "")}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

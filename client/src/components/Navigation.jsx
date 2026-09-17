import { Bookmark, Compass, Home, ImagePlus, MessageCircle, Settings, Sparkles, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";
import KronosLogo3D from "./ui/KronosLogo3D";

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
        <KronosLogo3D size="sm" tier="quantum" animated interactive />
        <div className="k-navigation-brand-info">
          <span className="k-brand-text">KRONOS SPACE</span>
          <p className="k-eyebrow">kronos-space.com</p>
        </div>
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

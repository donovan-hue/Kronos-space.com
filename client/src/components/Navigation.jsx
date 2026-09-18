import { Bookmark, Compass, Home, ImagePlus, MessageCircle, Settings, Sparkles, UserRound, Users } from "lucide-react";
import { NavLink } from "react-router-dom";
import WetChromeSign from "./ui/WetChromeSign";
import KronosClockLogo from "./ui/KronosClockLogo";

const links = [
  ["/home", "Inicio", Home],
  ["/explore", "Explorar", Compass],
  ["/saved", "Guardados", Bookmark],
  ["/create", "Crear", ImagePlus],
  ["/ai", "Kairos", Sparkles],
  ["/messages", "Mensajes", MessageCircle],
  ["/conversations", "Grupos", Users],
  ["/profile", "Perfil", UserRound],
  ["/settings", "Configuración", Settings],
];

export default function Navigation() {
  return (
    <aside className="k-navigation" aria-label="Navegación principal">
      <div className="k-navigation-brand">
        <KronosClockLogo size="md" animated interactive ariaLabel="Kronos, reloj orbital cromado" />
        <WetChromeSign size="sm" ariaLabel="krono-space.com" />
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

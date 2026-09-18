import { Link } from "react-router-dom";
import WetChromeSign from "./ui/WetChromeSign";
import KronosClockLogo from "./ui/KronosClockLogo";

/**
 * TopBar minimal: solo la marca. Buscar, notificaciones, mensajes y
 * perfil viven ahora en el fan nav (launcher contextual), no aquí.
 */
export default function TopBar() {
  return (
    <header className="k-topbar" aria-label="Barra superior de Kronos Space">
      <Link className="k-brand" to="/home" aria-label="krono-space.com, inicio">
        <KronosClockLogo size="sm" animated interactive={false} ariaLabel="Kronos" />
        <WetChromeSign size="sm" ariaLabel="krono-space.com" />
      </Link>
    </header>
  );
}

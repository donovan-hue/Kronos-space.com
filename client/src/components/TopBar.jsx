import { Bell, MessageCircle, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export default function TopBar({ user }) {
  const navigate = useNavigate();

  return (
    <header className="k-topbar" aria-label="Barra superior de Kronos">
      <Link className="k-brand" to="/home" aria-label="KRONOS, inicio">
        <span className="k-brand-mark" aria-hidden="true">K</span>
        <span>KRONOS</span>
      </Link>
      <button className="k-search-trigger" type="button" onClick={() => navigate("/search")}>
        <Search size={18} aria-hidden="true" />
        <span>Buscar en Kronos</span>
      </button>
      <div className="k-topbar-actions">
        <button className="k-icon-button" type="button" aria-label="Notificaciones" onClick={() => navigate("/notifications")}><Bell size={19} /></button>
        <button className="k-icon-button" type="button" aria-label="Mensajes" onClick={() => navigate("/messages")}><MessageCircle size={19} /></button>
        <Link className="k-avatar" to="/profile" aria-label="Abrir mi perfil">{user?.displayName?.slice(0, 1) || "K"}</Link>
      </div>
    </header>
  );
}

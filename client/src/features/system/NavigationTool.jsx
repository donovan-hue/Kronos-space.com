import { useState } from "react";
import { Link } from "react-router-dom";
import GlobalSearchModal from "../../components/search/GlobalSearchModal";
import ShortcutsModal from "../../components/shortcuts/ShortcutsModal";
import OrbitMap from "../../components/navigation/OrbitMap";

const HERRAMIENTAS = {
  mapa: { titulo: "Mapa de navegación", descripcion: "Destinos reales de Kronos organizados en órbitas.", Componente: OrbitMap },
  atajos: { titulo: "Atajos de teclado", descripcion: "Consulta los accesos de teclado, sin tener que recordarlos.", Componente: ShortcutsModal },
  busqueda: { titulo: "Búsqueda global", descripcion: "Busca personas, publicaciones, temas y órbitas.", Componente: GlobalSearchModal }
};

// La URL abre los mismos diálogos que el shell, no una copia de sus funciones.
export default function NavigationTool({ tipo }) {
  const [open, setOpen] = useState(true);
  const { titulo, descripcion, Componente } = HERRAMIENTAS[tipo];
  return (
    <section className="page">
      <header className="k-page-header"><div><h1>{titulo}</h1><p>{descripcion}</p></div></header>
      <div className="k-feature-actions">
        <button className="k-button k-button-primary" type="button" onClick={() => setOpen(true)}>Abrir {titulo.toLowerCase()}</button>
        <Link className="k-button k-button-secondary" to="/pantallas">Todas las funciones</Link>
      </div>
      <Componente open={open} isOpen={open} onClose={() => setOpen(false)} onNavigate={() => setOpen(false)} />
    </section>
  );
}

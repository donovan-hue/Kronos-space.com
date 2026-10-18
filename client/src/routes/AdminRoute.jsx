import { Link } from "react-router-dom";

// Guarda de interfaz: el backend sigue comprobando el rol en la base de datos.
// No montar AdminCenter evita solicitudes y controles de administración ajenos.
export default function AdminRoute({ user, children }) {
  if (user?.role === "admin") return children;
  return (
    <section className="page">
      <h1>Acceso restringido</h1>
      <p role="status">Solo administradores pueden abrir esta herramienta.</p>
      <Link className="k-button k-button-secondary" to="/pantallas">Todas las funciones</Link>
    </section>
  );
}

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { completarRuta, encontrarPantalla, ESTADOS, parametrosDeRuta } from "../../lib/screenIndex";
import NotFound from "../NotFound";

const ETIQUETAS = {
  id: "Identificador de publicación o usuario",
  userId: "Identificador de usuario",
  username: "Nombre de usuario",
  orbitId: "Identificador de órbita",
  conversationId: "Identificador de conversación"
};

export default function FeatureDetail({ user }) {
  const { featureId } = useParams();
  const pantalla = encontrarPantalla(featureId);
  if (!pantalla) return <NotFound />;
  return <FeatureContent key={featureId} pantalla={pantalla} user={user} />;
}

function FeatureContent({ pantalla, user }) {
  const navigate = useNavigate();
  const [valores, setValores] = useState({});
  const [error, setError] = useState("");
  const parametros = parametrosDeRuta(pantalla.ruta);
  const restringida = pantalla.acceso === "admin" && user?.role !== "admin";

  function abrir(event) {
    event.preventDefault();
    try {
      const destino = completarRuta(pantalla.ruta, valores);
      setError("");
      navigate(destino);
    } catch (validationError) {
      setError(validationError.message);
    }
  }

  return (
    <section className="page k-feature-page">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">DIRECTORIO DE FUNCIONES</p>
          <h1>{pantalla.nombre}</h1>
          <p>{pantalla.descripcion}</p>
        </div>
        <Link className="k-button k-button-secondary" to="/pantallas">Todas las funciones</Link>
      </header>
      <div className="k-feature-panel">
        <p>Estado: <strong>{ESTADOS[pantalla.estado]}</strong></p>
        <p>Ruta: <code>{pantalla.ruta}</code></p>
        {restringida ? (
          <p role="status">Solo administradores. Tu cuenta no tiene acceso a esta herramienta.</p>
        ) : pantalla.tipoRuta === "ficha" ? (
          <p role="status">
            {pantalla.estado === "fuera"
              ? "Esta función es infraestructura interna o documentación, no una herramienta de usuario. Esta dirección solo muestra su ficha."
              : "Esta función todavía no tiene una herramienta construida. Esta dirección muestra su ficha, no un servicio operativo."}
          </p>
        ) : parametros.length > 0 ? (
          <form className="k-feature-form" onSubmit={abrir}>
            <p>Elige el recurso que quieres abrir. No se usan identificadores de ejemplo.</p>
            {parametros.map((parametro) => (
              <label key={parametro}>
                {parametro === "id" && pantalla.ruta.startsWith("/post/") ? "Identificador de publicación" : ETIQUETAS[parametro] || parametro}
                <input className="k-input" required autoComplete="off" value={valores[parametro] || ""}
                  onChange={(event) => setValores((current) => ({ ...current, [parametro]: event.target.value }))} />
              </label>
            ))}
            {error && <p role="alert">{error}</p>}
            <button className="k-button k-button-primary" type="submit">Abrir función</button>
            <Link to={pantalla.ruta.startsWith("/orbits") ? "/orbits" : pantalla.ruta.startsWith("/conversations") ? "/conversations" : "/explore"}>Buscar un recurso existente</Link>
          </form>
        ) : (
          <Link className="k-button k-button-primary" to={pantalla.ruta}>Abrir función</Link>
        )}
      </div>
    </section>
  );
}

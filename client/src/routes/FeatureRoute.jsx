import { Link } from "react-router-dom";

/**
 * Guarda de interfaz para las funciones liberadas tras un flag.
 *
 * POR QUÉ EXISTE
 *
 * El servidor ya responde 404 `FEATURE_DISABLED` cuando el flag está apagado
 * (ver `server/src/middleware/featureFlag.js`), pero el cliente solo escondía
 * el enlace del menú. Un enlace guardado, el historial del navegador o la
 * carpeta de marcadores abrían la pantalla igual, que se quedaba cargando o
 * reventaba con un 404 genérico. Esto convierte ese 404 pactado en una
 * pantalla honesta: «esta función está apagada».
 *
 * No sustituye a la guarda del servidor —solo la explica— y, mientras llegan
 * los flags, no oculta nada (`flags === null` deja pasar).
 */
export default function FeatureRoute({ flag, flags, children }) {
  if (!flags || flags[flag] !== false) return children;

  return (
    <section className="page">
      <h1>Función no disponible</h1>
      <p role="status">
        Esta función está apagada por el momento. No se ha perdido nada de lo que había en ella.
      </p>
      <Link className="k-button k-button-secondary" to="/home">Volver a Inicio</Link>
    </section>
  );
}

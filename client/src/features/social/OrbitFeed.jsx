import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getOrbit } from "../../services/orbitsService";
import SocialPage from "./SocialPage";

export default function OrbitFeed() {
  const { orbitId } = useParams();
  const [orbit, setOrbit] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getOrbit(orbitId)
      .then((value) => {
        if (active) setOrbit(value);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error || "No se pudo cargar la órbita.");
      });
    return () => { active = false; };
  }, [orbitId]);

  if (error) {
    return (
      <section className="page">
        <div className="k-state k-state-error" role="alert">{error}</div>
        <Link className="k-button k-button-secondary" to="/orbits">Volver a Órbitas</Link>
      </section>
    );
  }

  if (!orbit) {
    return (
      <section className="page" aria-busy="true" aria-label="Cargando órbita">
        <div className="k-surface k-feed-state" role="status">Cargando órbita...</div>
      </section>
    );
  }

  return <SocialPage orbitId={orbitId} orbit={orbit} />;
}

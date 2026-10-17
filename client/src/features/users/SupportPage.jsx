import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCreatorSupport, getSupportHistory } from "../../services/supportService";
import { getUser } from "../../services/authStorage";
import SupportDialog from "./SupportDialog";

export default function SupportPage() {
  const { userId } = useParams();
  return <SupportContent key={userId || "history"} userId={userId} />;
}

function SupportContent({ userId }) {
  const [params, setParams] = useSearchParams();
  const role = params.get("role") === "sent" ? "sent" : "received";
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["support", userId || "history", userId ? "creator" : role],
    queryFn: () => userId ? getCreatorSupport(userId) : getSupportHistory(role)
  });
  const creator = query.data?.creator;
  const me = getUser();
  const ownProfile = creator && String(creator._id) === String(me?._id || me?.id);
  const transactions = query.data?.transactions || [];

  return (
    <section className="page k-feature-page">
      <header className="k-page-header">
        <div><h1>{userId ? "Apoyar a un creador" : "Apoyos recibidos y enviados"}</h1><p>Créditos Kronos simbólicos (★). No se procesa ningún pago real.</p></div>
        <Link className="k-button k-button-secondary" to="/pantallas">Todas las funciones</Link>
      </header>
      {!userId && <div className="k-feature-actions" role="group" aria-label="Tipo de apoyos">
        <button className="k-button k-button-secondary" type="button" aria-pressed={role === "received"} onClick={() => setParams({ role: "received" })}>Recibidos</button>
        <button className="k-button k-button-secondary" type="button" aria-pressed={role === "sent"} onClick={() => setParams({ role: "sent" })}>Enviados</button>
      </div>}
      {query.isPending ? <p role="status">Cargando apoyos…</p> : query.isError ? (
        <div role="alert"><p>{query.error.response?.data?.error || "No se pudieron cargar los apoyos."}</p><button type="button" className="k-button k-button-secondary" onClick={() => query.refetch()}>Reintentar</button></div>
      ) : userId ? (
        creator ? <div className="k-feature-panel">
          <h2>@{creator.username}</h2>
          <p>{creator.displayName}</p>
          {ownProfile ? <p>No puedes enviarte apoyo a ti mismo.</p> : <button type="button" className="k-button k-button-primary" onClick={() => setOpen(true)}>Elegir apoyo simbólico</button>}
          <SupportDialog open={open} creator={creator} onClose={() => setOpen(false)} onSuccess={() => query.refetch()} />
        </div> : <p role="status">Creador no encontrado.</p>
      ) : (
        <>
          <p>Hasta 50 apoyos {role === "sent" ? "enviados" : "recibidos"} más recientes.</p>
          {!transactions.length && <p role="status">Todavía no hay apoyos {role === "sent" ? "enviados" : "recibidos"}.</p>}
          <ul className="k-indice-lista">{transactions.map((item) => {
            const persona = role === "sent" ? item.creator : item.sender;
            return <li className="k-feature-panel" key={item._id}>
              <strong>{item.amount} ★ · {persona?.displayName || persona?.username || "Usuario no disponible"}</strong>
              {item.message && <p>{item.message}</p>}
              {item.createdAt && <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString("es-MX")}</time>}
            </li>;
          })}</ul>
        </>
      )}
    </section>
  );
}

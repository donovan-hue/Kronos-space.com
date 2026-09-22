import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  addOrbitMember,
  createOrbit,
  deleteOrbit,
  getArchivedOrbits,
  getOrbitMembers,
  getOrbits,
  joinOrbit,
  leaveOrbit,
  removeOrbitMember,
  updateOrbit,
  updateOrbitMember
} from "../../services/orbitsService";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";
import { getUserByUsername } from "../../services/usersService";
import { useConfirm } from "../../components/feedback/ConfirmProvider";

function message(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback;
}

function expiresFromDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(Date.now() + Math.min(days, 365) * 24 * 60 * 60 * 1000).toISOString();
}

function rulesFromText(value) {
  return String(value || "").split("\n").map((rule) => rule.trim()).filter(Boolean).slice(0, 10);
}

function OrbitForm({ value, onChange, onSubmit, submitLabel, busy, editing = false }) {
  return (
    <form className="k-orbit-form" onSubmit={onSubmit}>
      <label>Nombre<input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} maxLength={80} required placeholder="Fotografía nocturna" /></label>
      <label>Descripción<input value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} maxLength={500} placeholder="Qué reúne a esta comunidad" /></label>
      <label>Visibilidad<select value={value.visibility} onChange={(event) => onChange({ ...value, visibility: event.target.value })}><option value="public">Pública · cualquiera puede descubrirla</option><option value="private">Privada · solo miembros</option></select></label>
      <label>Duración <span className="k-muted">(días, opcional)</span><input type="number" min="1" max="365" value={value.durationDays} onChange={(event) => onChange({ ...value, durationDays: event.target.value })} placeholder="Sin fecha de cierre" /></label>
      <label className="k-orbit-rules-field">Paquete de bienvenida <span className="k-muted">(lo que ve quien se une, hasta 1000 caracteres)</span><textarea value={value.welcomeText} onChange={(event) => onChange({ ...value, welcomeText: event.target.value })} maxLength={1000} rows={2} placeholder="Bienvenida: empieza por las reglas y preséntate en el feed." /></label>
      <label className="k-orbit-rules-field">Reglas <span className="k-muted">(una por línea, hasta 10)</span><textarea value={value.rulesText} onChange={(event) => onChange({ ...value, rulesText: event.target.value })} maxLength={2100} rows={3} placeholder="Comparte contexto\nCuida las fuentes" /></label>
      <div className="k-inline-actions">
        <button type="submit" className="k-button k-button-primary" disabled={busy}>{busy ? "Guardando..." : submitLabel}</button>
        {editing && <button type="button" className="k-button k-button-ghost" onClick={() => onChange(null)}>Cancelar</button>}
      </div>
    </form>
  );
}

export default function Orbits() {
  const confirm = useConfirm();
  const [orbits, setOrbits] = useState([]);
  const [newOrbit, setNewOrbit] = useState({ name: "", description: "", visibility: "public", durationDays: "", rulesText: "", welcomeText: "" });
  const [editOrbit, setEditOrbit] = useState(null);
  const [members, setMembers] = useState({});
  const [memberNames, setMemberNames] = useState({});
  const [memberRoles, setMemberRoles] = useState({});
  const [expanded, setExpanded] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [archived, setArchived] = useState(null);
  const [showArchive, setShowArchive] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setOrbits(await getOrbits());
      try {
        setArchived(await getArchivedOrbits());
      } catch {
        setArchived([]);
      }
    } catch (requestError) {
      setError(message(requestError, "No se pudieron cargar las órbitas."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  function payload(value) {
    return {
      name: value.name,
      description: value.description,
      visibility: value.visibility,
      rules: rulesFromText(value.rulesText),
      expiresAt: expiresFromDays(value.durationDays),
      welcomeMessage: String(value.welcomeText || "").trim().slice(0, 1000)
    };
  }

  async function handleCreate(event) {
    event.preventDefault();
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const orbit = await createOrbit(payload(newOrbit));
      setOrbits((current) => [orbit, ...current]);
      setNewOrbit({ name: "", description: "", visibility: "public", durationDays: "", rulesText: "", welcomeText: "" });
      setNotice("Órbita creada. Ya puedes abrir su feed y publicar dentro.");
    } catch (requestError) {
      setError(message(requestError, "No se pudo crear la órbita."));
    } finally {
      setBusy("");
    }
  }

  async function handleUpdate(event) {
    event.preventDefault();
    if (!editOrbit) return;
    setBusy(`update:${editOrbit._id}`);
    setError("");
    try {
      const updated = await updateOrbit(editOrbit._id, payload(editOrbit.form));
      setOrbits((current) => current.map((orbit) => orbit._id === updated._id ? updated : orbit));
      setEditOrbit(null);
      setNotice("Órbita actualizada.");
    } catch (requestError) {
      setError(message(requestError, "No se pudo actualizar la órbita."));
    } finally {
      setBusy("");
    }
  }

  async function handleDelete(orbit) {
    const ok = await confirm({
      title: "Eliminar órbita",
      message: `¿Eliminar la órbita “${orbit.name}” y su feed?`,
      confirmText: "Eliminar órbita",
      danger: true
    });
    if (!ok) return;
    setBusy(`delete:${orbit._id}`);
    setError("");
    try {
      await deleteOrbit(orbit._id);
      setOrbits((current) => current.filter((item) => item._id !== orbit._id));
      setNotice("Órbita eliminada.");
    } catch (requestError) {
      setError(message(requestError, "No se pudo eliminar la órbita."));
    } finally {
      setBusy("");
    }
  }

  async function handleMembership(orbit) {
    setBusy(`membership:${orbit._id}`);
    setError("");
    try {
      if (orbit.joined && orbit.role !== "owner") {
        await leaveOrbit(orbit._id);
        setOrbits((current) => current.map((item) => item._id === orbit._id ? { ...item, joined: false, role: null, membersCount: Math.max(0, item.membersCount - 1) } : item));
        setNotice(`Saliste de ${orbit.name}.`);
      } else if (!orbit.joined) {
        const joined = await joinOrbit(orbit._id);
        setOrbits((current) => current.map((item) => item._id === orbit._id ? joined : item));
        setNotice(joined?.welcomeMessage
          ? `Te uniste a ${orbit.name}. ${joined.welcomeMessage}`
          : `Te uniste a ${orbit.name}.`);
      }
    } catch (requestError) {
      setError(message(requestError, "No se pudo actualizar tu membresía."));
    } finally {
      setBusy("");
    }
  }

  async function toggleMembers(orbit) {
    if (expanded === orbit._id) {
      setExpanded("");
      return;
    }
    setExpanded(orbit._id);
    if (members[orbit._id]) return;
    setBusy(`members:${orbit._id}`);
    try {
      const result = await getOrbitMembers(orbit._id);
      setMembers((current) => ({ ...current, [orbit._id]: result.members || [] }));
    } catch (requestError) {
      setError(message(requestError, "No se pudieron cargar los miembros."));
    } finally {
      setBusy("");
    }
  }

  async function handleAddMember(orbit) {
    const username = (memberNames[orbit._id] || "").trim().replace(/^@/, "");
    if (!username) return;
    setBusy(`add:${orbit._id}`);
    setError("");
    try {
      const result = await getUserByUsername(username);
      const user = result?.user || result;
      if (!user?._id) throw new Error("Usuario no encontrado");
      await addOrbitMember(orbit._id, user._id, memberRoles[orbit._id] || "member");
      const updated = await getOrbitMembers(orbit._id);
      setMembers((current) => ({ ...current, [orbit._id]: updated.members || [] }));
      setOrbits((current) => current.map((item) => item._id === orbit._id ? { ...item, membersCount: updated.members?.length || item.membersCount + 1 } : item));
      setMemberNames((current) => ({ ...current, [orbit._id]: "" }));
      setNotice(`@${user.username || username} fue agregado a ${orbit.name}.`);
    } catch (requestError) {
      setError(message(requestError, "No se pudo agregar ese usuario."));
    } finally {
      setBusy("");
    }
  }

  async function handleRole(orbit, member, role) {
    setBusy(`role:${orbit._id}:${member._id}`);
    try {
      await updateOrbitMember(orbit._id, member._id, role);
      setMembers((current) => ({ ...current, [orbit._id]: (current[orbit._id] || []).map((item) => item._id === member._id ? { ...item, role } : item) }));
    } catch (requestError) {
      setError(message(requestError, "No se pudo actualizar el rol."));
    } finally {
      setBusy("");
    }
  }

  async function handleRemoveMember(orbit, member) {
    setBusy(`remove:${orbit._id}:${member._id}`);
    try {
      await removeOrbitMember(orbit._id, member._id);
      setMembers((current) => ({ ...current, [orbit._id]: (current[orbit._id] || []).filter((item) => item._id !== member._id) }));
      setOrbits((current) => current.map((item) => item._id === orbit._id ? { ...item, membersCount: Math.max(0, item.membersCount - 1) } : item));
    } catch (requestError) {
      setError(message(requestError, "No se pudo quitar al miembro."));
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="k-page k-orbits-page">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">Comunidades temáticas</p>
          <h1>Órbitas</h1>
          <p className="k-muted">Espacios con reglas, roles, duración y un feed propio para conversar con intención.</p>
        </div>
        <Link className="k-button k-button-secondary" to="/create/post">Crear publicación</Link>
      </header>
      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {notice && <p className="k-state k-state-success" role="status">{notice}</p>}

      <section className="k-panel k-orbit-create-panel" aria-labelledby="new-orbit-title">
        <div className="k-section-heading"><div><p className="k-eyebrow">Nuevo espacio</p><h2 id="new-orbit-title">Crear una órbita</h2></div><span className="k-muted">Tu comunidad, tus reglas</span></div>
        <OrbitForm value={newOrbit} onChange={setNewOrbit} onSubmit={handleCreate} submitLabel="Crear órbita" busy={busy === "create"} />
      </section>

      <section aria-labelledby="orbits-list-title">
        <div className="k-section-heading"><h2 id="orbits-list-title">Descubrir y administrar</h2><span className="k-muted">{orbits.length} espacios activos</span></div>
        {loading ? <Spinner size="lg" label="Cargando órbitas..." /> : orbits.length === 0 ? <EmptyState title="Aún no hay órbitas visibles." description="Crea la primera comunidad temática." /> : (
          <div className="k-orbit-grid">
            {orbits.map((orbit) => (
              <article className="k-panel k-orbit-card" key={orbit._id}>
                {editOrbit?._id === orbit._id ? (
                  <OrbitForm value={editOrbit.form} onChange={(form) => form ? setEditOrbit({ ...editOrbit, form }) : setEditOrbit(null)} onSubmit={handleUpdate} submitLabel="Guardar cambios" busy={busy === `update:${orbit._id}`} editing />
                ) : (
                  <>
                    <div className="k-orbit-card-heading"><div><p className="k-eyebrow">{orbit.visibility === "private" ? "PRIVADA" : "PÚBLICA"}</p><h3>{orbit.name}</h3></div><span className="k-orbit-count">{orbit.membersCount} miembros</span></div>
                    <p className="k-orbit-description">{orbit.description || "Sin descripción"}</p>
                    {orbit.rules?.length > 0 && <ul className="k-orbit-rules">{orbit.rules.slice(0, 3).map((rule) => <li key={rule}>{rule}</li>)}</ul>}
                    <p className="k-muted k-orbit-meta">{orbit.expiresAt ? `Cierra ${new Date(orbit.expiresAt).toLocaleDateString("es-MX")}` : "Sin fecha de cierre"}{orbit.role ? ` · ${orbit.role}` : ""}</p>
                    <div className="k-inline-actions">
                      <Link className="k-button k-button-primary" to={`/orbits/${orbit._id}`}>Abrir feed</Link>
                      {orbit.joined && (
                        <Link
                          className="k-button k-button-secondary"
                          to={`/create?orbitId=${orbit._id}&orbitName=${encodeURIComponent(orbit.name)}`}
                        >
                          Publicar
                        </Link>
                      )}
                      {!orbit.joined && orbit.visibility === "public" && <button type="button" className="k-button k-button-secondary" onClick={() => handleMembership(orbit)} disabled={busy === `membership:${orbit._id}`}>Unirme</button>}
                      {orbit.joined && orbit.role !== "owner" && <button type="button" className="k-button k-button-ghost" onClick={() => handleMembership(orbit)} disabled={busy === `membership:${orbit._id}`}>Salir</button>}
                      {orbit.role === "owner" && <button type="button" className="k-button k-button-ghost" onClick={() => setEditOrbit({ ...orbit, form: { ...orbit, durationDays: "", rulesText: (orbit.rules || []).join("\n"), welcomeText: orbit.welcomeMessage || "" } })}>Editar</button>}
                      {orbit.role === "owner" && <button type="button" className="k-button k-button-ghost k-danger-text" onClick={() => handleDelete(orbit)}>Eliminar</button>}
                    </div>
                    {(orbit.role === "owner" || orbit.role === "moderator") && <button type="button" className="k-button k-button-ghost k-orbit-manage-button" onClick={() => toggleMembers(orbit)}>{expanded === orbit._id ? "Ocultar miembros" : "Gestionar miembros"}</button>}
                  </>
                )}
                {expanded === orbit._id && (
                  <div className="k-orbit-members">
                    {busy === `members:${orbit._id}` ? <Spinner label="Cargando miembros..." /> : <>
                      <div className="k-add-member-row"><input value={memberNames[orbit._id] || ""} onChange={(event) => setMemberNames((current) => ({ ...current, [orbit._id]: event.target.value }))} placeholder="Nombre de usuario" aria-label={`Agregar miembro a ${orbit.name}`} /><button type="button" className="k-button k-button-primary" onClick={() => handleAddMember(orbit)} disabled={busy === `add:${orbit._id}`}>Agregar</button></div>
                      {orbit.role === "owner" && <select className="k-orbit-role-select" value={memberRoles[orbit._id] || "member"} onChange={(event) => setMemberRoles((current) => ({ ...current, [orbit._id]: event.target.value }))} aria-label={`Rol para nuevos miembros de ${orbit.name}`}><option value="member">Miembro</option><option value="moderator">Moderador</option></select>}
                      <ul className="k-circle-member-list">{(members[orbit._id] || []).map((member) => <li key={member._id}><span><strong>{member.displayName || member.username}</strong> <small className="k-muted">@{member.username} · {member.role}</small></span>{member.role !== "owner" && <span className="k-inline-actions"><select value={member.role} onChange={(event) => handleRole(orbit, member, event.target.value)} aria-label={`Rol de ${member.username}`} disabled={orbit.role !== "owner"}><option value="member">Miembro</option><option value="moderator">Moderador</option></select><button type="button" className="k-button k-button-ghost k-danger-text" onClick={() => handleRemoveMember(orbit, member)}>Quitar</button></span>}</li>)}</ul>
                    </>}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {archived && archived.length > 0 && (
        <section aria-labelledby="orbits-archive-title" className="k-orbit-archive">
          <div className="k-section-heading">
            <h2 id="orbits-archive-title">Archivo</h2>
            <button className="k-button k-button-ghost" type="button" onClick={() => setShowArchive((current) => !current)}>
              {showArchive ? "Ocultar" : `Ver ${archived.length} órbitas vencidas`}
            </button>
          </div>
          {showArchive && (
            <div className="k-orbit-grid">
              {archived.map((orbit) => (
                <article className="k-panel k-orbit-card" key={orbit._id} aria-label={`Archivo: ${orbit.name}`}>
                  <div className="k-orbit-card-heading"><div><p className="k-eyebrow">VENCIDA</p><h3>{orbit.name}</h3></div><span className="k-orbit-count">{orbit.membersCount} miembros</span></div>
                  <p className="k-orbit-description">{orbit.description || "Sin descripción"}</p>
                  <p className="k-muted k-orbit-meta">Cerró {new Date(orbit.expiresAt).toLocaleDateString("es-MX")} · solo lectura</p>
                  <div className="k-inline-actions">
                    <Link className="k-button k-button-ghost" to={`/orbits/${orbit._id}`}>Ver historia</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

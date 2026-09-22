import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  addCircleMember,
  createCircle,
  deleteCircle,
  getCircleMembers,
  getCircles,
  removeCircleMember,
  updateCircle
} from "../../services/circlesService";
import { getUserByUsername } from "../../services/usersService";
import { useConfirm } from "../../components/feedback/ConfirmProvider";

function requestMessage(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback;
}

export default function Circles() {
  const confirm = useConfirm();
  const [circles, setCircles] = useState([]);
  const [membersByCircle, setMembersByCircle] = useState({});
  const [expandedCircle, setExpandedCircle] = useState("");
  const [editingCircle, setEditingCircle] = useState("");
  const [form, setForm] = useState({ name: "", description: "" });
  const [memberNames, setMemberNames] = useState({});
  const [newCircle, setNewCircle] = useState({ name: "", description: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      setCircles(await getCircles());
    } catch (requestError) {
      setError(requestMessage(requestError, "No se pudieron cargar tus círculos."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function toggleMembers(circle) {
    setError("");
    setNotice("");
    if (expandedCircle === circle._id) {
      setExpandedCircle("");
      return;
    }
    setExpandedCircle(circle._id);
    if (membersByCircle[circle._id]) return;
    setAction(`members:${circle._id}`);
    try {
      const result = await getCircleMembers(circle._id);
      setMembersByCircle((current) => ({ ...current, [circle._id]: result.members || [] }));
    } catch (requestError) {
      setError(requestMessage(requestError, "No se pudieron cargar los miembros."));
    } finally {
      setAction("");
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const circle = await createCircle(newCircle);
      setCircles((current) => [circle, ...current]);
      setNewCircle({ name: "", description: "" });
      setNotice("Círculo creado. Ya puedes seleccionarlo al publicar.");
    } catch (requestError) {
      setError(requestMessage(requestError, "No se pudo crear el círculo."));
    } finally {
      setSaving(false);
    }
  }

  function startEditing(circle) {
    setEditingCircle(circle._id);
    setForm({ name: circle.name, description: circle.description || "" });
    setError("");
    setNotice("");
  }

  async function handleUpdate(circleId) {
    setAction(`update:${circleId}`);
    setError("");
    setNotice("");
    try {
      const updated = await updateCircle(circleId, form);
      setCircles((current) => current.map((circle) => circle._id === circleId ? updated : circle));
      setEditingCircle("");
      setNotice("Círculo actualizado.");
    } catch (requestError) {
      setError(requestMessage(requestError, "No se pudo actualizar el círculo."));
    } finally {
      setAction("");
    }
  }

  async function handleDelete(circle) {
    const ok = await confirm({
      title: "Eliminar círculo",
      message: `¿Eliminar el círculo “${circle.name}”? Las publicaciones existentes dejarán de ser visibles para esa audiencia.`,
      confirmText: "Eliminar círculo",
      danger: true
    });
    if (!ok) return;
    setAction(`delete:${circle._id}`);
    setError("");
    setNotice("");
    try {
      await deleteCircle(circle._id);
      setCircles((current) => current.filter((item) => item._id !== circle._id));
      setExpandedCircle("");
      setNotice("Círculo eliminado.");
    } catch (requestError) {
      setError(requestMessage(requestError, "No se pudo eliminar el círculo."));
    } finally {
      setAction("");
    }
  }

  async function handleAddMember(circle) {
    const value = (memberNames[circle._id] || "").trim().replace(/^@/, "");
    if (!value) return;
    setAction(`add:${circle._id}`);
    setError("");
    setNotice("");
    try {
      const result = await getUserByUsername(value);
      const user = result?.user || result;
      if (!user?._id) throw new Error("Usuario no encontrado");
      await addCircleMember(circle._id, user._id);
      const membersResult = await getCircleMembers(circle._id);
      setMembersByCircle((current) => ({ ...current, [circle._id]: membersResult.members || [] }));
      setCircles((current) => current.map((item) => item._id === circle._id ? { ...item, membersCount: membersResult.members?.length || item.membersCount + 1 } : item));
      setMemberNames((current) => ({ ...current, [circle._id]: "" }));
      setNotice(`@${user.username || value} está en el círculo.`);
    } catch (requestError) {
      setError(requestMessage(requestError, "No se pudo agregar ese usuario."));
    } finally {
      setAction("");
    }
  }

  async function handleRemoveMember(circle, user) {
    setAction(`remove:${circle._id}:${user._id}`);
    setError("");
    try {
      await removeCircleMember(circle._id, user._id);
      setMembersByCircle((current) => ({
        ...current,
        [circle._id]: (current[circle._id] || []).filter((member) => member._id !== user._id)
      }));
      setCircles((current) => current.map((item) => item._id === circle._id ? { ...item, membersCount: Math.max(0, item.membersCount - 1) } : item));
    } catch (requestError) {
      setError(requestMessage(requestError, "No se pudo quitar al miembro."));
    } finally {
      setAction("");
    }
  }

  return (
    <main className="k-page k-circles-page">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">Privacidad social</p>
          <h1>Círculos</h1>
          <p className="k-muted">Comparte publicaciones con grupos privados de personas que tú eliges.</p>
        </div>
        <Link className="k-button k-button-secondary" to="/create/post">Crear publicación</Link>
      </header>

      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {notice && <p className="k-state k-state-success" role="status">{notice}</p>}

      <section className="k-panel k-circle-create-panel" aria-labelledby="new-circle-title">
        <div className="k-section-heading">
          <div>
            <p className="k-eyebrow">Nuevo espacio privado</p>
            <h2 id="new-circle-title">Crear un círculo</h2>
          </div>
          <span className="k-muted">Hasta 100 miembros</span>
        </div>
        <form className="k-circle-create-form" onSubmit={handleCreate}>
          <label>
            Nombre
            <input value={newCircle.name} onChange={(event) => setNewCircle({ ...newCircle, name: event.target.value })} maxLength={80} required placeholder="Familia, equipo, amigos..." />
          </label>
          <label>
            Descripción <span className="k-muted">(opcional)</span>
            <input value={newCircle.description} onChange={(event) => setNewCircle({ ...newCircle, description: event.target.value })} maxLength={300} placeholder="Para qué usarás este círculo" />
          </label>
          <button className="k-button k-button-primary" disabled={saving}>{saving ? "Creando..." : "Crear círculo"}</button>
        </form>
      </section>

      <section aria-labelledby="my-circles-title">
        <div className="k-section-heading">
          <h2 id="my-circles-title">Mis círculos</h2>
          <span className="k-muted">{circles.length} {circles.length === 1 ? "círculo" : "círculos"}</span>
        </div>
        {loading ? <p className="k-state">Cargando círculos...</p> : circles.length === 0 ? (
          <div className="k-empty-state"><strong>Aún no tienes círculos.</strong><span>Crea uno para publicar con una audiencia privada.</span></div>
        ) : (
          <div className="k-circle-grid">
            {circles.map((circle) => (
              <article className="k-panel k-circle-card" key={circle._id}>
                {editingCircle === circle._id ? (
                  <div className="k-circle-edit-form">
                    <label>Nombre<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={80} /></label>
                    <label>Descripción<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={300} /></label>
                    <div className="k-inline-actions">
                      <button className="k-button k-button-primary" onClick={() => handleUpdate(circle._id)} disabled={action === `update:${circle._id}`}>{action === `update:${circle._id}` ? "Guardando..." : "Guardar"}</button>
                      <button className="k-button k-button-ghost" onClick={() => setEditingCircle("")}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="k-circle-card-header">
                      <div><h3>{circle.name}</h3><p className="k-muted">{circle.description || "Sin descripción"}</p></div>
                      <span className="k-circle-count">{circle.membersCount} {circle.membersCount === 1 ? "miembro" : "miembros"}</span>
                    </div>
                    <div className="k-inline-actions">
                      <button className="k-button k-button-secondary" onClick={() => toggleMembers(circle)}>{expandedCircle === circle._id ? "Ocultar miembros" : "Gestionar miembros"}</button>
                      <button className="k-button k-button-ghost" onClick={() => startEditing(circle)}>Editar</button>
                      <button className="k-button k-button-ghost k-danger-text" onClick={() => handleDelete(circle)} disabled={action === `delete:${circle._id}`}>Eliminar</button>
                    </div>
                  </>
                )}

                {expandedCircle === circle._id && (
                  <div className="k-circle-members">
                    {action === `members:${circle._id}` ? <p className="k-muted">Cargando miembros...</p> : (
                      <>
                        <div className="k-add-member-row">
                          <input value={memberNames[circle._id] || ""} onChange={(event) => setMemberNames((current) => ({ ...current, [circle._id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); handleAddMember(circle); } }} placeholder="Nombre de usuario" aria-label={`Agregar miembro a ${circle.name}`} />
                          <button className="k-button k-button-primary" onClick={() => handleAddMember(circle)} disabled={action === `add:${circle._id}`}>{action === `add:${circle._id}` ? "Agregando..." : "Agregar"}</button>
                        </div>
                        {(membersByCircle[circle._id] || []).length === 0 ? <p className="k-muted">Todavía no hay miembros. El propietario también puede ver las publicaciones del círculo.</p> : (
                          <ul className="k-circle-member-list">
                            {membersByCircle[circle._id].map((member) => (
                              <li key={member._id}><span><strong>{member.displayName || member.username}</strong> <small className="k-muted">@{member.username}</small></span><button className="k-button k-button-ghost k-danger-text" onClick={() => handleRemoveMember(circle, member)} disabled={action === `remove:${circle._id}:${member._id}`}>Quitar</button></li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

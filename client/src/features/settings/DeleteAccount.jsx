import { useState } from "react";
import { Link } from "react-router-dom";
import { useConfirm } from "../../components/feedback/ConfirmProvider";
import { deleteAccount } from "../../services/usersService";

const EFECTOS = [
  "Tu perfil, avatar, portada y biografía.",
  "Tus publicaciones, comentarios, reacciones, guardados e historias.",
  "Tus mensajes enviados y borradores; las conversaciones que compartes con otras cuentas quedan para ellas.",
  "Tus proyectos, guiones, generaciones de IA y locuciones.",
  "Tus cápsulas del tiempo y los archivos asociados, incluida la copia durable.",
  "Tus círculos propios, bloqueos, silencios y reportes.",
  "Tus sesiones abiertas: todos los tokens quedan revocados."
];

function mensajeDe(error, porDefecto) {
  return error?.response?.data?.error || porDefecto;
}

/**
 * ELIMINAR CUENTA — Ajustes > Privacidad y datos.
 *
 * El endpoint `DELETE /api/users/me` existía y estaba probado, pero no había
 * forma de llegar a él desde la interfaz: el derecho de supresión dependía de
 * que alguien escribiera al equipo. Este bloque lo expone con la verificación
 * que el servidor exige —contraseña, o confirmación escrita del nombre cuando
 * la cuenta no tiene contraseña (Google sin proveedor de correo aún no puede
 * fijarse una)— y con el aviso previo de la exportación.
 *
 * No hay cuenta atrás: por eso hay tres barreras (casilla de entendimiento,
 * credencial y diálogo de confirmación) y por eso el aviso de éxito se emite
 * antes de cerrar la sesión local, que es lo que borra la pantalla de encima.
 */
export default function DeleteAccount({ user, onDeleted }) {
  const confirm = useConfirm();
  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState(false);

  const username = String(user?.username || "");
  // Sin dato se asume el camino estricto: pedir contraseña. Un `false`
  // equivocado expondría un borrado más laxo de lo que la cuenta permite.
  const hasPassword = user?.hasPassword !== false;

  async function handleDelete(event) {
    event.preventDefault();
    if (busy) return;
    setError("");

    if (!acknowledged) {
      setError("Marca la casilla para confirmar que entiendes que el borrado es definitivo.");
      return;
    }

    if (hasPassword && !password.trim()) {
      setError("Escribe tu contraseña para confirmar.");
      return;
    }

    if (!hasPassword && confirmName.trim().toLowerCase() !== username.toLowerCase()) {
      setError("Escribe tu nombre de usuario tal como aparece arriba para confirmar.");
      return;
    }

    const autorizado = await confirm({
      title: "Eliminar tu cuenta",
      message: `Se borrarán tu perfil y todo lo que creaste, incluidos los archivos. No se puede deshacer ni recuperar desde soporte.`,
      confirmText: "Sí, eliminar mi cuenta",
      cancelText: "Cancelar",
      danger: true,
      eyebrow: "ACCIÓN IRREVERSIBLE"
    });

    if (!autorizado) return;

    setBusy(true);
    try {
      await deleteAccount(hasPassword ? { password } : { confirm: confirmName });
      setPassword("");
      setConfirmName("");
      setAcknowledged(false);
      setDeleted(true);
      // El aviso vive en el estado del propio bloque porque el llamador puede
      // (y debe) cerrar la sesión de inmediato: la pantalla desaparece detrás
      // y un `showToast` dependería de que un proveedor ancestor exista.
      onDeleted?.();
    } catch (requestError) {
      const status = requestError?.response?.status;
      setError(
        mensajeDe(
          requestError,
          status === 403
            ? hasPassword
              ? "La contraseña no es correcta. Tu cuenta no se ha eliminado."
              : "El nombre de usuario no coincide. Tu cuenta no se ha eliminado."
            : "No se pudo eliminar la cuenta. Inténtalo otra vez; si vuelve a fallar, el contenido sigue intacto."
        )
      );
    } finally {
      setBusy(false);
    }
  }

  if (deleted) {
    return (
      <div className="k-settings-subsection">
        <h3>Cuenta eliminada</h3>
        <p role="status" className="k-state k-state-success">
          Tu cuenta y su contenido se borraron. No hay nada que recuperar.
        </p>
      </div>
    );
  }

  return (
    <div className="k-settings-subsection">
      <h3>Eliminar tu cuenta</h3>
      <p className="k-muted">
        Borra de forma definitiva tu cuenta y todo lo que contiene. Si solo quieres irte un
        tiempo, cierra sesión: los datos se conservan.
      </p>

      <ul className="k-muted">
        {EFECTOS.map((efecto) => (
          <li key={efecto}>{efecto}</li>
        ))}
      </ul>

      <p className="k-muted">
        ¿Primero quieres conservar una copia?{" "}
        <Link to="/settings#privacy" className="k-link-subtle">Descarga antes una copia de tus datos</Link>{" "}
        · <Link to="/privacidad" className="k-link-subtle">Qué guardamos</Link>
      </p>

      <form onSubmit={handleDelete} className="k-privacy-options">
        <label>
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={busy}
            onChange={(event) => {
              setAcknowledged(event.target.checked);
              setError("");
            }}
          />
          <span>
            Entiendo que esta acción es definitiva
            <small className="k-muted">No hay período de gracia ni recuperación por soporte.</small>
          </span>
        </label>

        {hasPassword ? (
          <label>
            Contraseña actual
            <input
              type="password"
              className="k-input"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              autoComplete="current-password"
              disabled={busy}
              placeholder="Confirma para eliminar"
            />
          </label>
        ) : (
          <label>
            Escribe tu nombre de usuario
            <input
              type="text"
              className="k-input"
              value={confirmName}
              onChange={(event) => {
                setConfirmName(event.target.value);
                setError("");
              }}
              autoComplete="off"
              disabled={busy}
              placeholder={username}
            />
            <small className="k-muted">
              Tu cuenta se creó con Google y no tiene contraseña: se pide el nombre exacto.
            </small>
          </label>
        )}

        <button type="submit" className="k-button k-button-danger" disabled={busy || !acknowledged}>
          {busy ? "Eliminando cuenta…" : "Eliminar mi cuenta"}
        </button>
      </form>

      {error && <p role="alert" className="k-state k-state-error">{error}</p>}
    </div>
  );
}

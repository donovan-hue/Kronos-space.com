import { useOnlineStatus } from "./ToastProvider";

/** BLOQUE 012 — estado global sin sustituir la fuente de verdad del backend. */
export default function OfflineNotice() {
  const online = useOnlineStatus();
  if (online) return null;
  return <div className="k-offline-notice" role="status" aria-live="assertive">Sin conexión. Tus acciones no enviadas no se confirmarán hasta volver a conectarte.</div>;
}

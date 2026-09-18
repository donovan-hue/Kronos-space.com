/**
 * FAN NAV — contexto de navegación (KRONOSPACE)
 *
 * Memoria ligera de sesión para que el abanico pueda "guardar contexto
 * necesario" antes de navegar (regla 16 de la especificación):
 * - último perfil visitado (para Mensaje → conversación con ese usuario);
 * - última conversación abierta (para Perfil → regresar al perfil correcto).
 *
 * No persiste en almacenamiento del navegador: es estado efímero de la
 * sesión de navegación, igual que el historial.
 */

let lastProfile = null; // { id, username, isOwn }
let lastConversationUserId = "";

export function rememberProfile(profile) {
  if (!profile || !profile.id) return;
  lastProfile = {
    id: String(profile.id),
    username: profile.username || "",
    isOwn: Boolean(profile.isOwn)
  };
}

export function getLastProfile() {
  return lastProfile;
}

export function rememberConversation(userId) {
  lastConversationUserId = userId ? String(userId) : "";
}

export function getLastConversationUserId() {
  return lastConversationUserId;
}

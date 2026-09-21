/**
 * Preferencia compartida de mute para video con autoplay (stories y feed
 * vertical). Un solo ajuste de usuario, recordado entre sesiones.
 */
const VIDEO_MUTED_KEY = "kronos_video_muted";

export function loadVideoMuted() {
  try {
    return window.localStorage.getItem(VIDEO_MUTED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveVideoMuted(value) {
  try {
    window.localStorage.setItem(VIDEO_MUTED_KEY, value ? "1" : "0");
  } catch {
    // Sin almacenamiento disponible se conserva el valor en memoria.
  }
}

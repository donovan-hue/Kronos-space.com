/**
 * Avisos del navegador (bloque 1.6).
 *
 * La PWA existe desde antes en el manifest, pero nadie pedía el permiso de
 * notificaciones ni había dónde mostrarlas. Aquí se resuelve solo lo que el
 * navegador permite sin servidor de push:
 *
 * - `pushSupported()`: hay `Notification` y `serviceWorker`.
 * - `pedirPermisoPush()`: se llama **solo** desde un clic del usuario; los
 *   navegadores ignoran `requestPermission()` sin gesto.
 * - `avisarEnNavegador({ title, body, url })`: intenta por el service worker
 *   (así el aviso sobrevive a la pestaña cerrada mientras el SW viva) y, si no
 *   está activo, cae a `Notification` directo.
 *
 * **No hay push real**: sin servidor de push ni claves VAPID, un aviso solo se
 * muestra con la pestaña abierta. Se dice tal cual en Ajustes; prometer push y
 * no darlo es peor que no ofrecerlo.
 */

/* global Notification */

export function pushSupported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

export function pushPermission() {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

export async function pedirPermisoPush() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export async function avisarEnNavegador({ title, body = "", url = "/home" } = {}) {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const opciones = {
    body,
    icon: "/icon.svg",
    badge: "/icon.svg",
    // Sin esto, Chrome en Android muestra un aviso sin marca.
    tag: "kronos-social",
    data: { url }
  };

  try {
    const registro = await navigator.serviceWorker.getRegistration();
    if (registro?.showNotification) {
      await registro.showNotification(title || "KRONOS-SPACE", opciones);
      return true;
    }
  } catch {
    // Si el SW falla, se intenta por la vía directa antes de rendirse.
  }

  try {
    const aviso = new Notification(title || "KRONOS-SPACE", opciones);
    aviso.onclick = () => {
      window.focus();
      if (url) window.location.assign(url);
    };
    return true;
  } catch {
    return false;
  }
}

/** Captura real, solo desde una acción explícita del usuario. Sin pistas falsas. */
export async function captureLiveMedia(type, devices = globalThis.navigator?.mediaDevices) {
  if (!devices?.getUserMedia) throw new Error("Este navegador no permite acceder al micrófono. Abre Kronos con HTTPS.");
  if (type !== "screen") return devices.getUserMedia({ audio: true, video: type === "video" });
  if (!devices.getDisplayMedia) throw new Error("Este navegador no permite compartir pantalla. Usa un navegador compatible.");

  // Abrir el selector ANTES de esperar a la API: getDisplayMedia requiere
  // activación transitoria. Nunca se elige ni se comparte una ventana a ciegas.
  const display = await devices.getDisplayMedia({ video: true, audio: false });
  let microphone;
  try {
    microphone = await devices.getUserMedia({ audio: true, video: false });
    if (!display.getVideoTracks().some(track => track.readyState !== "ended")) {
      throw new Error("La captura de pantalla se detuvo. Vuelve a elegir una pantalla.");
    }
    for (const track of microphone.getAudioTracks()) display.addTrack(track);
    return display;
  } catch (error) {
    display.getTracks().forEach(track => track.stop());
    microphone?.getTracks().forEach(track => track.stop());
    throw error;
  }
}

/** Silenciar no altera la membresía, no pide permisos nuevos ni reabre la cámara. */
export function enableLiveTracks(stream, kind, enabled) {
  stream?.getTracks().filter(track => track.kind === kind && track.readyState !== "ended")
    .forEach(track => { track.enabled = enabled; });
}

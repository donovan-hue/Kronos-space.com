// Un reloj por elemento: una secuencia comparte tiempo global con música y
// voz sin sobrescribir propiedades nativas del navegador.
const relojes = new WeakMap();
export const relojVideo = (video) => relojes.get(video) || video;
export function registrarRelojVideo(video, reloj) {
  relojes.set(video, reloj);
  video.dispatchEvent(new Event("kronos:clockchange"));
  return () => {
    if (relojes.get(video) === reloj) {
      relojes.delete(video);
      video.dispatchEvent(new Event("kronos:clockchange"));
    }
  };
}

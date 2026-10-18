// Hora local del dispositivo: siempre se deriva de Date, nunca de contar
// fotogramas o de una vuelta CSS. Incluye minutos/segundos en la aguja horaria.
export function clockAngles(date) {
  const seconds = date.getSeconds() + date.getMilliseconds() / 1000;
  const minutes = date.getMinutes() + seconds / 60;
  return {
    hour: ((date.getHours() % 12) + minutes / 60) * 30,
    minute: minutes * 6,
    second: seconds * 6,
  };
}

// Proyección de una órbita circular inclinada. La profundidad determina si
// el planeta pasa delante o detrás de la esfera del reloj.
export function planetPose(elapsedMs) {
  const phase = elapsedMs / 24000 * Math.PI * 2 - 0.24;
  const tilt = (-30 + Math.sin(elapsedMs / 18000) * 3) * Math.PI / 180;
  const x = 132 * Math.cos(phase);
  const y = 42 * Math.sin(phase);
  const depth = Math.sin(phase);
  return {
    x: 160 + x * Math.cos(tilt) - y * Math.sin(tilt),
    y: 160 + x * Math.sin(tilt) + y * Math.cos(tilt),
    scale: 1 + depth * 0.13,
    front: depth >= 0,
    tilt: tilt * 180 / Math.PI,
    spin: elapsedMs / 180,
  };
}

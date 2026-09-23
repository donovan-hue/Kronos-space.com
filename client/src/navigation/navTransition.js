import { NAV_ORDER } from "./model.jsx";

/**
 * KRONOS — coreografía direccional entre secciones.
 *
 * Regla de continuidad espacial: al cambiar de plano, la vista que
 * entra llega desde el lado hacia el que "mira" el usuario y la que
 * sale se retira al lado opuesto. La dirección la decide la distancia
 * entre secciones sobre el eje de profundidad NAV_ORDER (anillo 0 → 1
 * → 2) y el tipo de navegación del router:
 *
 *   PUSH hacia afuera (delta > 0)  → entra por la derecha
 *   PUSH hacia el centro (delta<0) → entra por la izquierda
 *   POP (atrás)                    → se invierte el signo
 *   REPLACE / secciones hermanas   → zoom suave, sin desliz lateral
 *
 * Un plan solo se calcula una vez por cambio de sección; en refresh o
 * montaje inicial devuelve el reposo (x=0, scale=1) para que la
 * animación no se re-ejecute sin razón (regla: transiciones no
 * decorativas ni redundantes).
 */

const STEP_PX = 26;
const MAX_STEPS = 3;

export function sectionDistance(prev, next) {
  if (!prev || !next || prev === next) return 0;
  const a = NAV_ORDER.indexOf(prev);
  const b = NAV_ORDER.indexOf(next);
  if (a === -1 || b === -1) return 0;
  return b - a;
}

/**
 * @param {string} prev        sección de origen (getCurrentSection)
 * @param {string} next        sección destino
 * @param {"PUSH"|"POP"|"REPLACE"} navType  tipo de navegación del router
 * @param {{ zoom?: boolean }} [opts]       zoom = la navegación viene de
 *                                           abrir el mapa orbital: el
 *                                           destino se acerca como al
 *                                           "entrar en un plano".
 * @returns {{ enterX:number, enterScale:number, exitX:number }}
 */
export function planSectionShift(prev, next, navType, { zoom = false } = {}) {
  const raw = sectionDistance(prev, next);

  if (raw === 0 && !zoom) {
    return { enterX: 0, enterScale: 1, exitX: 0 };
  }

  // POP = volver: el usuario recupera el plano de donde viene, así que
  // el desplazamiento se invierte respecto del push original.
  const direction = navType === "POP" ? -1 : 1;
  const steps = Math.min(Math.abs(raw || 1), MAX_STEPS);
  const magnitude = steps * STEP_PX;
  const sign = Math.sign(raw || 1) * direction;

  if (zoom) {
    return {
      enterX: sign * Math.round(magnitude * 1.6),
      enterScale: 0.92,
      exitX: -sign * Math.round(magnitude * 0.8)
    };
  }

  return {
    enterX: sign * magnitude,
    enterScale: 0.992,
    exitX: -sign * magnitude
  };
}

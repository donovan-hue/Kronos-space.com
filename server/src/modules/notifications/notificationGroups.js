/**
 * Grupos de silencio de las notificaciones.
 *
 * `preferences.notifications.inApp` es un único interruptor: apagarlo deja la
 * cuenta muda del todo. Eso obliga a elegir entre «no quiero saber de
 * guardados» y «pierdo también los comentarios». Aquí se define a qué grupo
 * pertenece cada tipo y qué grupos se pueden silenciar.
 *
 * `moderation` y `report` quedan fuera a propósito: son avisos sobre tu cuenta
 * o tu contenido (una publicación oculta, un reporte resuelto). Silenciarlos
 * sería esconder una decisión que te afecta.
 */

const GROUPS = Object.freeze({
  follow: "*",
  like: "*",
  repost: "*",
  event: "*",
  comment: "comments",
  save: "saves",
  story: "stories"
});

const MUTABLE_GROUPS = Object.freeze(["*", "comments", "saves", "stories"]);

function groupOf(type) {
  return GROUPS[type] || "";
}

/**
 * ¿El destinatario silenció este tipo?
 *
 * `muted` viene del subdocumento de preferencias. Un grupo desconocido o un
 * tipo sin grupo nunca se considera silenciado: es preferible un aviso de más
 * a perder uno que la persona sí quería.
 */
function isMuted(type, muted) {
  const group = groupOf(type);
  if (!group || !muted || typeof muted !== "object") return false;
  return muted[group] === true;
}

module.exports = {
  GROUPS,
  MUTABLE_GROUPS,
  groupOf,
  isMuted
};

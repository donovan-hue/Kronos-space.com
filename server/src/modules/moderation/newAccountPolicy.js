/**
 * CRITERIO DE «CUENTA NUEVA» — qué hace la moderación con una cuenta recién nacida.
 *
 * Existe porque la cola de reportes mostraba el motivo y la fecha, pero no la
 * única señal que distingue un conflicto entre dos personas de una oleada de
 * spam: el bombardeo típico abre la cuenta, publica y desaparece, y ese
 * recorrido completo vive en `createdAt` sin que nadie lo leyera.
 *
 * El criterio **no filtra ni sanciona**: una cuenta nueva no es una
 * infracción, y retirar sus reportes de la cola sería esconderlos. Lo que hace
 * es (a) marcar el reporte en la respuesta y (b) decidir el orden dentro de la
 * página, que es donde sí cambia cuánta espera tiene cada caso. Un criterio que
 * expulsara reportes de la cola sería un criterio sin auditoría posible.
 *
 * Las señales son campos que existen en `User` —`createdAt`, `avatar`, `bio`,
 * `followers`— y se listan tal cual. No hay «puntuación de riesgo»: un número
 * compuesto no se puede discutir ni rebatir, y una decisión de moderación tiene
 * que poder explicarse con lo que la base realmente guarda.
 */

/** Ventana en la que una cuenta sigue siendo nueva. Siete días, no veinte minutos. */
const UMBRAL_NUEVA_CUENTA_DIAS = 7;

const DIA_EN_MS = 24 * 60 * 60 * 1000;

function fechaValida(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Días de antigüedad, con decimales: una cuenta de 20 horas es nueva de forma
 * distinta a una de 6 días, y redondear a entero igualaría ambas.
 * `null` cuando no hay fecha usable — se propaga, no se asume.
 */
function diasDeAntiguedad(createdAt, ahora = new Date()) {
  const creado = fechaValida(createdAt);
  const hoy = fechaValida(ahora);
  if (!creado || !hoy) return null;
  return (hoy.getTime() - creado.getTime()) / DIA_EN_MS;
}

/**
 * Señales objetivas leídas del usuario. Se devuelven como frases para que el
 * panel las imprima sin reinterpretar nada.
 */
function senalesDeCuenta(usuario) {
  const senales = [];
  if (!usuario || typeof usuario !== "object") return senales;

  if (!String(usuario.avatar || "").trim()) {
    senales.push("sin imagen de perfil");
  }
  if (!String(usuario.bio || "").trim()) {
    senales.push("sin descripción");
  }
  const seguidores = Array.isArray(usuario.followers) ? usuario.followers.length : null;
  if (seguidores === 0) {
    senales.push("sin seguidores");
  }
  return senales;
}

/**
 * Decisión para un reporte: `{ nueva, dias, senales, motivo }`.
 *
 * `motivo` explica por qué `nueva` es `false` cuando no se pudo evaluar
 * ("sin fecha", "cuenta borrada"), para que un panel no muestre "cuenta vieja"
 * donde en realidad no hay datos.
 */
function evaluarCuentaNueva(usuario, { ahora = new Date(), umbralDias = UMBRAL_NUEVA_CUENTA_DIAS } = {}) {
  if (!usuario || typeof usuario !== "object") {
    return { nueva: false, dias: null, senales: [], motivo: "sin-cuenta" };
  }

  const dias = diasDeAntiguedad(usuario.createdAt, ahora);
  if (dias === null) {
    return { nueva: false, dias: null, senales: [], motivo: "sin-fecha" };
  }
  if (dias < 0) {
    // Una fecha en el futuro significa reloj corrido o dato corrupto, no una
    // cuenta de edad negativa: se informa en vez de comparar.
    return { nueva: false, dias, senales: [], motivo: "fecha-futura" };
  }

  const senales = senalesDeCuenta(usuario);
  const nueva = dias < umbralDias;

  return {
    nueva,
    dias: Math.round(dias * 10) / 10,
    senales: nueva ? senales : [],
    motivo: nueva ? "dentro-de-la-ventana" : "fuera-de-la-ventana"
  };
}

/**
 * Orden de la página: antes los reportes contra cuentas nuevas, y dentro de
 * cada grupo el más reciente primero. Estable a propósito: el orden de entrada
 * de `Report` ya viene ordenado por estado y fecha, y reordenar lo demás
 * convertiría el criterio en un desempate arbitrario.
 */
function ordenarPorCuentaNueva(reports, { campoCuenta = "targetOwner", umbralDias = UMBRAL_NUEVA_CUENTA_DIAS, ahora = new Date() } = {}) {
  const posicion = (reporte) => {
    const decision = evaluarCuentaNueva(reporte?.[campoCuenta], { ahora, umbralDias });
    return decision.nueva ? 0 : 1;
  };

  return [...(reports || [])].sort((a, b) => posicion(a) - posicion(b));
}

module.exports = {
  UMBRAL_NUEVA_CUENTA_DIAS,
  DIA_EN_MS,
  diasDeAntiguedad,
  senalesDeCuenta,
  evaluarCuentaNueva,
  ordenarPorCuentaNueva
};

const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Criterio de «cuenta nueva» de la cola de moderación.
 *
 * Prueba pura, sin base de datos: lo que se verifica aquí es la decisión, no
 * el `$lookup`. Que la cola anota con estos números lo comprueba
 * `moderation.e2e.test.js` cuando hay Mongo; sin él, esta sigue corriendo.
 *
 * El caso que importa es el último: una cuenta sin `createdAt` no puede
 * volverse «vieja» por omisión. Un defecto que asume «no es nueva» es un
 * defecto que deja el spam al final de la cola.
 */

const {
  UMBRAL_NUEVA_CUENTA_DIAS,
  diasDeAntiguedad,
  senalesDeCuenta,
  evaluarCuentaNueva,
  ordenarPorCuentaNueva
} = require("../src/modules/moderation/newAccountPolicy");

const AHORA = new Date("2026-10-29T12:00:00.000Z");
const hace = (dias) => new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();

test("la ventana es de siete días y está declarada, no repartida por el código", () => {
  assert.equal(UMBRAL_NUEVA_CUENTA_DIAS, 7);
});

test("antigüedad en días con decimales, y null si no hay fecha usable", () => {
  assert.equal(diasDeAntiguedad(hace(3), AHORA), 3);
  assert.equal(diasDeAntiguedad(hace(0.5), AHORA), 0.5);
  assert.equal(diasDeAntiguedad("no-es-fecha", AHORA), null);
  assert.equal(diasDeAntiguedad(undefined, AHORA), null);
  assert.equal(diasDeAntiguedad(hace(3), "hoy-también-roto"), null);
  // Acepta Date y cadena ISO: `lean()` devuelve Date y un payload JSON, cadena.
  assert.equal(diasDeAntiguedad(new Date(hace(2)), AHORA), 2);
});

test("señales leídas de campos que existen en User, sin inventar puntuaciones", () => {
  assert.deepEqual(senalesDeCuenta({ avatar: "", bio: "", followers: [] }), [
    "sin imagen de perfil",
    "sin descripción",
    "sin seguidores"
  ]);
  assert.deepEqual(senalesDeCuenta({ avatar: "a.png", bio: "hola", followers: [1] }), []);
  // Sin el campo no se afirma: `followers` ausente no es «cero seguidores».
  assert.deepEqual(senalesDeCuenta({ avatar: "a.png", bio: "hola" }), []);
  assert.deepEqual(senalesDeCuenta(null), []);
});

test("dentro de la ventana marca nueva, fuera marca vieja con su motivo", () => {
  const nueva = evaluarCuentaNueva({ createdAt: hace(2), avatar: "", bio: "", followers: [] }, { ahora: AHORA });
  assert.equal(nueva.nueva, true);
  assert.equal(nueva.dias, 2);
  assert.deepEqual(nueva.senales, ["sin imagen de perfil", "sin descripción", "sin seguidores"]);
  assert.equal(nueva.motivo, "dentro-de-la-ventana");

  // Día 7 exacto: ya salió de la ventana (la comparación es `<`, no `<=`).
  const justoSalió = evaluarCuentaNueva({ createdAt: hace(7) }, { ahora: AHORA });
  assert.equal(justoSalió.nueva, false);
  assert.equal(justoSalió.motivo, "fuera-de-la-ventana");
  assert.deepEqual(justoSalió.senales, [], "fuera de la ventana no se apilan señales");
});

test("un umbral distinto cambia la ventana sin tocar el módulo", () => {
  const decision = evaluarCuentaNueva({ createdAt: hace(4) }, { ahora: AHORA, umbralDias: 3 });
  assert.equal(decision.nueva, false);
  assert.equal(decision.dias, 4);
});

test("los tres estados sin datos se distinguen de «cuenta vieja»", () => {
  assert.equal(evaluarCuentaNueva(null, { ahora: AHORA }).motivo, "sin-cuenta");
  assert.equal(
    evaluarCuentaNueva({ username: "x" }, { ahora: AHORA }).motivo,
    "sin-fecha",
    "la proyección populate sin createdAt debe decirlo, no callarlo"
  );
  const futuro = evaluarCuentaNueva({ createdAt: hace(-1) }, { ahora: AHORA });
  assert.equal(futuro.motivo, "fecha-futura");
  assert.equal(futuro.nueva, false);
});

test("el orden pone los casos nuevos primero y respeta el resto", () => {
  const vieja = { _id: "v1", targetOwner: { createdAt: hace(40) } };
  const nueva = { _id: "n1", targetOwner: { createdAt: hace(1) } };
  const sinDatos = { _id: "s1", targetOwner: null };

  const orden = ordenarPorCuentaNueva([vieja, sinDatos, nueva], { ahora: AHORA }).map((r) => r._id);
  assert.deepEqual(orden, ["n1", "v1", "s1"]);

  // Estable dentro del grupo: no reordena lo que el criterio no distingue.
  const mismoGrupo = ordenarPorCuentaNueva(
    [
      { _id: "a", targetOwner: { createdAt: hace(1) } },
      { _id: "b", targetOwner: { createdAt: hace(2) } }
    ],
    { ahora: AHORA }
  ).map((r) => r._id);
  assert.deepEqual(mismoGrupo, ["a", "b"]);

  assert.deepEqual(ordenarPorCuentaNueva([], { ahora: AHORA }), []);
  assert.deepEqual(ordenarPorCuentaNueva(undefined, { ahora: AHORA }), []);
});

test("no muta el arreglo que recibe: la paginación sigue describiendo la consulta", () => {
  const original = [
    { _id: "v", targetOwner: { createdAt: hace(30) } },
    { _id: "n", targetOwner: { createdAt: hace(1) } }
  ];
  const copia = [...original];
  ordenarPorCuentaNueva(original, { ahora: AHORA });
  assert.deepEqual(original.map((r) => r._id), copia.map((r) => r._id));
});

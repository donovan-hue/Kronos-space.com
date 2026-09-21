# KRONOS — Pulso y feeds elegibles (Fase 6)

**Fecha:** 2026-09-21
**Rango:** Fase 6 del plan maestro: feeds elegibles, registro de visto, sesiones finitas de Pulso y señales "más/menos de esto". Los modos de feed (Siguiendo/Cronológico/Intereses) y la explicación de recomendación existían desde #29; este bloque añade lo que faltaba.

## Qué se entrega

- **Registro de visto** (`SeenPost`, índice único user+post): `POST /api/pulse/seen/:postId` idempotente. El Pulso nunca repite lo ya visto.
- **Señales más/menos** (`FeedSignal`, única por user+tag): `POST /api/pulse/signal {postId, direction}` califica los temas (hashtags) de una publicación. `GET /api/pulse/signals` devuelve las señales vigentes (transparencia).
- **Sesión finita de Pulso** — `GET /api/pulse?limit=8` (máx. 20):
  - elige publicaciones **no vistas** con las preferencias del usuario (modos latest/following/interests reutilizados del feed),
  - **excluye** los temas marcados "less",
  - **prioriza** los "more" al frente de la sesión,
  - moderación y audiencia reutilizadas (`feedConstraints` + `withAudienceFilter`),
  - `completed: true` solo cuando no queda nada elegible sin repetir: el fin es real, no cosmético.
- **UI `/pulse`**: una publicación a la vez con su explicación ("Por qué aparece"), progreso ("3 de 8"), botones **Visto · siguiente / Más como esto / Menos como esto**, resumen de temas priorizados/excluidos y estado final explícito ("Sesión completa") con inicio de otra sesión. Navegación: ítem "Pulso" en el abanico.
- La señal **no** consume la publicación: solo "Visto" marca el registro.

## Decisiones

1. El registro de visto es del usuario y privado: ninguna API lo expone a otros.
2. "Menos de esto" excluye de la sesión (no oculta del feed principal ni del perfil: el control es del consumidor, no censura).
3. La sesión se marca por elemento al consumir, no al descargar: recargar no pierde la sesión en curso.
4. Los modos de feed y la explicación de recomendación no se duplicaron: se reutilizan exactamente los del feed (`getFeedPreferences`, `recommendationReason`), una sola fuente.

## Validación

- Servidor: 157 pruebas, 96 ok, 0 fallos, 61 E2E omitidas sin `MONGODB_URI`.
  - Nuevas: `pulse.contract.test.js` (3) y `pulse.e2e.test.js` (3 con base real en CI: sesión finita sin repeticiones e idempotencia del visto, señales more/less con prioridad y exclusión, audiencia respetada).
- Cliente: `vitest` 129 ok (4 nuevas) · `node --test` 20 ok · lint limpio · build correcto.

## Fuera de este bloque (pendiente honesto)

- Controles de contenido generado por IA en el feed: llegan con la Fase 7 (etiquetado IA y linaje).
- "Registro de visto" aplicado también al feed principal infinito: hoy solo Pulso consume las señales y el visto; extenderlo a Inicio requiere métrica de impacto en retención (Fase 8).

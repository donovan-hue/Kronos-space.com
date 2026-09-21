# KRONOS — Analítica privada y confianza (Fase 8)

**Fecha:** 2026-09-21
**Rango:** Fase 8 del plan maestro (porción de creadores y confianza): analítica privada de creador, apelaciones con estado de reportes y panel de salud de comunidad.

## Qué se entrega

- **Analítica privada de creador** — `GET /api/analytics/creator?days=30` (7/30/90):
  - totales de la ventana: publicaciones, me gusta, comentarios, guardados y **remixes recibidos** (linaje de Fase 7 en acción),
  - seguidores actuales, serie de los últimos 14 días y top 5 de publicaciones por interacciones,
  - una sola ruta, siempre privada: no hay vista pública ni de administrador. La analítica no es un ranking, es un espejo,
  - el alcance es honesto y se declara en pantalla: interacciones contadas sobre las publicaciones creadas dentro de la ventana.
- **UI `/analytics`** (ítem "Analítica" en el abanico): tarjetas de totales, barras de actividad y "las que más resonaron".
- **Apelaciones** — `POST /api/moderation/reports/:id/appeal`:
  - el denunciante puede apelar **una vez** un reporte **descartado**, con texto de 10 a 1000 caracteres,
  - `PATCH .../appeal` (moderadores): aceptada reabre el reporte a `reviewing`; rechazada cierra el ciclo,
  - "Mis reportes" muestra el estado de cada apelación y ofrece el formulario solo donde aplica.
- **Salud de comunidad** — `GET /api/moderation/health` (solo moderadores): últimos 30 días por estado y motivo, apelaciones por estado y cola actual. Se muestra en el Centro de Seguridad.

## Decisiones

1. La apelación pertenece al denunciante (quien inició el reporte): es quien recibió el cierre. Una por reporte, sin retráctil.
2. Aceptar una apelación reabre el reporte en lugar de resolverlo por la fuerza: la decisión sigue siendo de moderación.
3. Las métricas se calculan sobre datos ya existentes (likes, comentarios, guardados, linaje): sin nuevo rastreo, sin nuevos eventos.
4. Salud de comunidad es de moderadores, no pública: números de la comunidad, no exposición de personas.

## Validación

- Servidor: 173 pruebas, 105 ok, 0 fallos, 68 E2E omitidas sin `MONGODB_URI`.
  - Nuevas: `analytics.contract.test.js` (3), `trust.contract.test.js` (3), `analytics.e2e.test.js` (2 en CI), `trust.e2e.test.js` (2 en CI: ciclo completo de apelación descartada→aceptada que reabre, y salud privada).
- Cliente: `vitest` 137 ok (4 nuevas) · `node --test` 20 ok · lint limpio · build correcto.

## Fuera de este bloque (pendiente honesto)

- Rate limits adaptativos por reputación y exportación/portabilidad de datos: dependen de infraestructura de fondo (colas/almacenamiento de exportaciones).
- Analítica de video (retención por segundo): requiere transcodificación e instrumentación de reproductor (pendiente de F2/ffmpeg).
- Accesibilidad WCAG formal y pruebas móviles automatizadas: requiere auditoría dedicada.

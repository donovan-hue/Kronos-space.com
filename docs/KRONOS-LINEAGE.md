# KRONOS — Linaje creativo y Kairos contextual (Fase 7)

**Fecha:** 2026-09-21
**Rango:** Fase 7 del plan maestro: derivación con atribución (remix), etiquetado honesto de contenido IA y Kairos dentro del compositor.

## Qué se entrega

- **Linaje en el modelo** (`Post.lineage`): `derivedFrom` (ref a la publicación original), `tool` (`remix | kairos-image | kairos-video | kairos-script`) y `aiGenerated`.
- **Remix con atribución verificada** — `POST /api/posts/:postId/remix`:
  - el servidor fija `derivedFrom` y `tool: "remix"`; el cliente **no puede** falsificar linaje de remix en la creación genérica (400),
  - copia la media original (URL, tipo, alt) y hereda el etiquetado IA si la original lo tenía,
  - exige poder ver la original: audiencia y relación (bloqueos) respetadas; sin media no hay remix (409),
  - la nueva publicación nace pública y del remixer.
- **Etiquetas visibles**: la tarjeta muestra "Remix · de @autora" (enlace al perfil de la original o al detalle) y "Creado con IA" para lo generado con Kairos.
- **Etiquetado IA de Kairos**: publicar desde el historial de generaciones envía `lineage {tool: "kairos-image|video|script", aiGenerated: true}`; lo que no se declaró IA no lleva etiqueta (honestidad, no sospecha).
- **Kairos en el compositor** (`CreatePost`): botón "Mejorar con Kairos" que sugiere una versión del texto. La sugerencia se muestra aparte y **solo reemplaza el borrador con confirmación explícita** ("Usar esta versión" / "Descartar"). Kairos no publica ni edita por sí solo.
- El menú "⋯" de cada publicación con media ofrece **Remix con atribución**; el remix aparece al frente del feed.

## Decisiones

1. `derivedFrom` es privilegio del servidor: la atribución es un hecho, no una declaración.
2. El remix hereda `aiGenerated` de la original: derivar de una generación IA mantiene la etiqueta.
3. El linaje se popular con autoría de la original en feed, vertical, pulso, detalle, perfil y guardados (`populate` anidado `lineage.derivedFrom.author`).
4. Kairos sugiere, la persona decide: nada de texto automático sin revisión.

## Validación

- Servidor: 163 pruebas, 99 ok, 0 fallos, 64 E2E omitidas sin `MONGODB_URI`.
  - Nuevas: `lineage.contract.test.js` (3) y `lineage.e2e.test.js` (3 en CI: remix conserva media y atribución + anti-falsificación de linaje, etiquetado Kairos visible en feed, audiencia/media exigidas).
- Cliente: `vitest` 133 ok (4 nuevas en `lineage.spec.jsx`) · `node --test` 20 ok · lint limpio · build correcto.

## Fuera de este bloque (pendiente honesto)

- Notificación "remixearon tu publicación" y contador de derivaciones por perfil (pide analítica, Fase 8).
- Traducción preservando personalidad, resúmenes de Órbitas y Kairos en mensajes: requieren proveedor IA en producción; la arquitectura de personalidad ya existe (`personality.service.js`).

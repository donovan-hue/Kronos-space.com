# KRONOS — Cierre del plan maestro: F2 restos, F4 fino y F0

**Fecha:** 2026-09-21
**Rango:** últimas piezas del plan maestro (`KRONOS-SOCIAL-BENCHMARK-Y-PLAN-2026-09-19.md`): punto focal persistente (Fase 2), archivo y bienvenida de Órbitas (Fase 4) y feature flags + respaldo verificable (Fase 0).

## F2 restos — punto focal persistente

- El editor de imagen permite fijar un **punto focal** con un clic (marcador visible): la parte de la imagen que debe permanecer visible cuando el contenedor recorta.
- Viaja con la publicación (`media.focalPoint` / por imagen del carrusel, coordenadas relativas 0..1 acotadas por el servidor) y el feed lo aplica con `object-position` — sin re-procesar la imagen, sin pérdida.
- Los filtros, marcos, stickers, recorte, rotación y formatos ya existían; lo que faltaba era que la decisión del autor sobreviviera a la publicación.

## F4 fino — archivo de Órbitas y paquete de bienvenida

- **`GET /api/orbits/archived`**: las órbitas temporales vencidas donde participas quedan en un archivo de solo lectura (dueños y miembros; nadie más). No se listan como activas y nadie puede unirse, pero su historia no desaparece. El detalle de una órbita vencida responde 200 para participantes y 404 para extraños.
- **Paquete de bienvenida**: cada órbita guarda un mensaje (hasta 1000 caracteres) que aparece al unirse. Se crea y edita con la órbita; la UI lo muestra en el momento del "Unirme".
- UI: sección "Archivo" en la página de Órbitas, con las vencidas marcadas "solo lectura".

## F0 — feature flags y respaldo verificable

- **`server/src/config/featureFlags.js`**: defaults en el código (todo lo publicado va encendido) + overrides por entorno `FEATURE_FLAG_<NOMBRE>=true|false`. `GET /api/flags` los expone; el cliente consume con fallback a "todo encendido" si el servidor no responde (una falla de flags nunca apaga funciones).
- La navegación (abanico) oculta las funciones cuyo flag esté apagado; el menú móvil fijo no cambia.
- **`scripts/backup-verify.js`**: respaldo verificable en dos modos — `mongodump` (archivo gzip + manifiesto con conteos y SHA-256) o JSON por colección (checksum + conteo por archivo) cuando no hay herramientas. `--check DIR` re-verifica un respaldo previo. Sin `MONGODB_URI` falla con código 1: un respaldo que no se puede verificar no cuenta como respaldo. Los respaldos caen en `backups/` (fuera de git).

## Validación

- Servidor: 186 pruebas, 116 ok, 0 fallos, 70 E2E omitidas sin `MONGODB_URI` (corren en CI con base temporal).
  - Nuevas: `focal.contract.test.js` (3), `orbits-archive.contract.test.js` (3), `orbits-archive.e2e.test.js` (2 en CI), `featureflags.contract.test.js` (3), `backup.contract.test.js` (2).
- Cliente: `vitest` 28 archivos / 146 pruebas (nuevas: focal 4, flags 3, órbitas +2) · `node --test` 20 ok · lint limpio · build correcto.

## Lo que queda fuera y por qué (pendiente honesto)

- **Transcodificación de video, recorte temporal, subtítulos y variantes de calidad**: requieren ffmpeg y una decisión de hosting/cola de trabajos; documentado desde la Fase 3.
- **Migraciones reversibles e inventario formal de índices**: la auditoría de base ya existe (`KRONOS-AUDIT-001-BASE-DATOS.md`); las migraciones formales arrancan cuando haya esquemas por romper.
- **Observabilidad (latencia, trabajos IA) y presupuesto de bundle**: dependen de infraestructura de métricas en producción; el presupuesto de bundle se atiende con la eliminación ya hecha de Three.js de la carga inicial cuando aplique.
- **Rate limits adaptativos por reputación y exportación de datos**: Fase 8, fuera de esta entrega.

**Estado del plan maestro:** F1–F8 completadas en la medida que el repositorio permite validarlas; los pendientes listados requieren decisiones de infraestructura (ffmpeg, métricas, colas) más que código de producto.

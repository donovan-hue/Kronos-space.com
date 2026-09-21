# KRONOS KAIROS — Auditoría, comparativa y plan de trabajo

**Fecha:** 2026-09-21 · Kairos es el diferenciador de IA del benchmark ("IA integrada: Kairos"). Este documento le aplica el mismo tratamiento que a la red: inventario de lo que existe, comparación honesta contra los productos de IA, y plan de trabajo con sesiones.

## 1. Auditoría: lo que Kairos ES hoy

### Backend (todo con `auth + requireUser + aiLimiter`)

| Módulo | Endpoints | Qué hace |
|---|---|---|
| `ai-core` | `POST /api/ai/chat` | Chat con historial multi-turno, 4 personalidades (`normal`, `direct`, `sarcastic`, `grumpy`), idioma es-MX, system prompt por personalidad |
| `image-ai` | `POST /generate` · `GET /history` · `GET /:id/status` · `GET /:id` · `DELETE /:id` | Generación de imágenes asíncrona con estados y borrado |
| `video-ai` | `POST /generate` · `GET /history` · `GET /:id` · `DELETE /:id` | Trabajos de video con progreso y reintento |
| `script-ai` | `POST /generate` · `POST /projects` · `GET /projects` · `GET /projects/:id` · `GET /projects/:id/export` · `DELETE /projects/:id` · history | Guiones estructurados con proyectos y exportación |
| Proveedores | — | `@google/genai` + `openai` con respuestas de error normalizadas |

### Frontend

- Hub `/kairos` con fondo 3D propio (orbe cromado lazy-loaded) + generadores de imagen (prompt/negativo/estilo), video (controles avanzados), guion, seguimiento de trabajos (`VideoJobs`).
- **Historial unificado** (`/kairos/history`): reutilizar, eliminar y **publicar** — y al publicar, la pieza nace etiquetada (`lineage: kairos-image|video|script, aiGenerated: true`, F7) con la marca "Creado con IA" visible en el feed.
- **Kairos contextual en el compositor** (F7): "Mejorar con Kairos" sugiere texto; solo se aplica con confirmación explícita. Kairos nunca publica solo.
- Biblioteca multimedia (`/library`) de lo generado.
- Limpieza 2026-09-21: se eliminó `KronosChat.jsx` (151 líneas) — integración colgante sin ruta ni importador, versión incompleta de la conversación con Kairos.

### Honestidad del inventario

Kairos genera y asiste, pero **no conversa como producto**: el chat vive únicamente dentro del botón del compositor, sin página propia ni persistencia visible. El historial es privado por diseño (decisión: no galería comunitaria).

## 2. Comparativa contra productos de IA

| Capacidad | ChatGPT/Gemini | Midjourney | Runway | CapCut | Notion AI | **Kairos hoy** | **Kairos tras el plan** |
|---|---|---|---|---|---|---|---|
| Conversación multi-turno persistente | ✅ | — | — | — | ✅ | 🟡 solo en compositor, sin página | ✅ K1 |
| Generación de imagen | ✅ | ✅ | 🟡 | 🟡 | — | ✅ asíncrona con historial | ✅ |
| Generación de video | 🟡 | — | ✅ | 🟡 | — | ✅ trabajos con progreso | ✅ + subtítulos K4 |
| Plantillas/estructura creativa | — | estilos | — | ✅ | — | 🟡 estilos + proyectos de guion | ✅ K6 |
| IA sobre TU contenido (biblioteca/guardados) | 🟡 archivos | — | — | — | ✅ | ❌ | ✅ K3 |
| Accesibilidad (alt-text, descripciones) | 🟡 | — | — | 🟡 | — | ❌ | ✅ K2 |
| Publicación integrada con atribución IA | — | 🟡 | — | — | — | ✅ **único**: linaje + etiqueta | ✅ |
| Personalidades con identidad propia | 🟡 | — | — | — | — | ✅ 4, es-MX | ✅ + K5 |
| Transparencia de uso/límites propios | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | ✅ K7 |
| Privado por diseño (sin galeria pública) | 🟡 | ❌ | 🟡 | 🟡 | ✅ | ✅ **diferencia deliberada** | ✅ |

**Lectura:** Kairos no compite con ChatGPT en conversación ni con Runway en edición; su ventaja real es estar **dentro del ciclo social**: generas → publicas con linaje honesto → la comunidad remezcla → la analítica te dice qué resonó. El plan empuja exactamente esa línea.

## 3. Plan de trabajo Kairos

| Fase | Qué se construye | Tal cual lo verá el usuario | Sesiones | Depende de |
|---|---|---|---|---|
| **K1. Kairos conversacional** | Página `/kairos/chat`: conversación continua con contexto, selector de personalidad, historial de sesiones propio (la promesa del chat colgante, bien hecha) | Pantalla de chat negra con burbujas cromadas; "Kairos · tono: directo"; cada sesión guarda su hilo; desde cualquier respuesta: "usar como borrador" manda el texto al compositor | ~1.5 | nada |
| **K2. Alt-text automático** | Al subir imagen, Kairos propone descripción accesible editable antes de publicar | En el compositor: "Descripción sugerida por Kairos: 'Nebulosa rosa sobre montaña' — [Usar] [Editar] [Descartar]"; publica con alt real | ~1 | nada |
| **K7. Transparencia de uso** | Panel "Tu uso de Kairos": generaciones del día, límite restante, historial de etiquetado | En Configuración: "Hoy: 12/20 generaciones · chat ilimitado con rate limit"; en cada pieza generada, la etiqueta IA es permanente | ~1 | nada |
| **K3. Kairos curador** | IA sobre la biblioteca personal: colecciones sugeridas de guardados + propuesta de cápsulas anuales | "Kairos encontró 3 colecciones en tus 214 guardados: Astrofotografía (58), Recetas (31), GDL (22) — [Crear colecciones]"; fin de año: "¿Sellamos tu cápsula 2026 con lo más resonado?" | ~1.5 | nada |
| **K6. Resúmenes bajo solicitud** | Resumen de una Órbita o hilo largo solo cuando se pide (nunca automático) | En una órbita: "Resumir la semana" → párrafo con lo esencial + enlaces a las 3 publicaciones clave | ~1 | K1 |
| **K5. Traducción con personalidad** | Traducción de publicaciones/comentarios preservando el tono del autor | En un post en otro idioma: "Traducir con mi tono"; el autor ve qué traducciones se pidieron (sin exponer quién) | ~1.5 | K1 |
| **K4. Subtítulos automáticos** | CC es-MX generados al procesar video, con corrección del autor antes de encenderse | Botón CC en el reproductor; el autor corrige desde "Editar → Subtítulos" | ~1 | **Bloque E (ffmpeg)** |

**Orden sugerido:** K1 → K2 → K7 → K3 → K6 → K5 → K4 (K4 espera a ffmpeg).
**Total: ~8.5 sesiones** además de la red. Con la red (~12.5) el proyecto completo cierra en **~21 sesiones**.

**Reglas fijas de Kairos (no negociables, ya vigentes):** nunca publica sin confirmación; toda pieza generada lleva etiqueta IA y linaje permanentes; el historial es privado; los resúmenes y traducciones son bajo solicitud, nunca automáticos.

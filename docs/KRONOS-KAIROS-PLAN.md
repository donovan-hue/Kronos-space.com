# KRONOS KAIROS — Comparativa, cumplimiento del benchmark y plan con filtro de beneficio

**Fecha:** 2026-09-21 · Kairos es el diferenciador de IA del benchmark ("IA integrada: Kairos"). Este documento le aplica **el mismo tratamiento completo que a la red social**: auditoría, comparación con los productos de IA, verificación de que todo lo recomendado esté (o esté decidido), y plan de trabajo — ahora con **filtro de beneficio**: lo que no favorece al proyecto se queda fuera y así queda lo acordado.

**Tesis rectora del benchmark (línea que gobierna todo este documento):**
> "Kairos no debe aparecer como un chatbot pegado a una red social. Debe operar como capa transversal para crear, editar, traducir, resumir y organizar, siempre bajo control del usuario."

---

## 1. Auditoría: lo que Kairos ES hoy

### Backend (todo con `auth + requireUser + aiLimiter`)

| Módulo | Endpoints | Qué hace |
|---|---|---|
| `ai-core` | `POST /api/ai/chat` | Chat con historial multi-turno, 4 personalidades (`normal`, `direct`, `sarcastic`, `grumpy`), idioma es-MX |
| `image-ai` | `POST /generate` · `GET /history` · `GET /:id/status` · `GET /:id` · `DELETE /:id` | Generación de imágenes asíncrona con estados y borrado |
| `video-ai` | `POST /generate` · `GET /history` · `GET /:id` · `DELETE /:id` | Trabajos de video con progreso y reintento |
| `script-ai` | `POST /generate` · `POST /projects` · `GET /projects` · `GET /projects/:id` · `GET /projects/:id/export` · `DELETE /projects/:id` | Guiones estructurados con proyectos y exportación |
| Proveedores | — | `@google/genai` + `openai` con errores normalizados |

### Frontend

- Hub `/kairos` con fondo 3D propio (orbe cromado lazy-loaded) + generadores de imagen/video/guion + seguimiento de trabajos.
- Historial unificado: reutilizar, eliminar y **publicar con linaje** (`kairos-image|video|script, aiGenerated: true`, F7) — etiqueta "Creado con IA" permanente en el feed.
- **Kairos contextual en el compositor** (F7): "Mejorar con Kairos" sugiere; solo se aplica con confirmación explícita.
- Biblioteca multimedia privada.
- Limpieza 2026-09-21: `KronosChat.jsx` (chat colgante sin ruta) eliminado — versión incompleta de la conversación.

### Estado de limpieza (auditado como la red)

Cero huérfanos (77/77 server, 111/111 client alcanzables), cero integraciones colgantes, dependencias con uso verificado. **Criterio de cierre de F7 cumplido y probado:** toda derivación es trazable (linaje) y Kairos nunca publica sin confirmación (pruebas `lineage.spec.jsx` 4/4).

---

## 2. Comparativa contra productos de IA

| Capacidad | ChatGPT/Gemini | Midjourney | Runway | CapCut | Notion AI | **Kairos hoy** |
|---|---|---|---|---|---|---|
| Conversación multi-turno | ✅ | — | — | — | ✅ | 🟡 solo contextual en compositor |
| Generación de imagen | ✅ | ✅ | 🟡 | 🟡 | — | ✅ asíncrona con historial |
| Generación de video | 🟡 | — | ✅ | 🟡 | — | ✅ trabajos con progreso |
| Plantillas/estructura creativa | — | estilos | — | ✅ | — | 🟡 estilos + proyectos de guion |
| IA sobre TU contenido | 🟡 archivos | — | — | — | ✅ | ❌ |
| Accesibilidad (alt-text, descripciones) | 🟡 | — | — | 🟡 | — | ❌ |
| Publicación integrada con atribución IA | — | 🟡 | — | — | — | ✅ **único** (linaje + etiqueta) |
| Personalidades con identidad | 🟡 | — | — | — | — | ✅ 4, es-MX |
| Transparencia de uso | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ |
| Privado por diseño | 🟡 | ❌ | 🟡 | 🟡 | ✅ | ✅ **decisión deliberada** |

**Lectura:** Kairos no compite con ChatGPT en conversación ni con Runway en edición; su ventaja es estar **dentro del ciclo social**: generas → publicas con linaje honesto → la comunidad remezcla → la analítica te dice qué resonó.

---

## 3. Cumplimiento del benchmark, recomendación por recomendación (con filtro de beneficio)

Fuente: sección 5.5 del benchmark ("Kairos debe aparecer donde aporta valor") + Fase 7 + métricas de la sección 11. Cada recomendación se verificó contra el código y se evaluó con un solo criterio: **¿refuerza Órbitas, Tiempo, Linaje o Pulso (la regla de oro del benchmark: "no copiar funciones solo porque otra red las tiene") y justifica su costo?**

| # | Recomendación del benchmark | Estado en código | Beneficio | **Decisión** |
|---|---|---|---|---|
| 1 | Redactar/resumir sin publicar automáticamente | ✅ hecho (compositor F7, confirmación explícita) | — | **Cumplido** |
| 2 | Texto alternativo accesible sugerido y editable | ❌ (el alt existe pero manual) | **Alto**: accesibilidad (métrica #11 del benchmark), barato, editable | **K2 · prioridad 1** |
| 3 | Detección preventiva de datos personales antes de publicar | ❌ | **Alto**: la confianza es tesis (F8); un aviso antes de publicar ("esto parece contener tu teléfono") es barato y valioso | **K8 · prioridad 2 (nueva)** |
| 4 | Agrupación inteligente de guardados | ❌ | **Alto**: lección Pinterest, usa datos existentes, privado por diseño | **K3 · prioridad 3** |
| 5 | Resumen de una Órbita o conversación bajo solicitud | ❌ | **Medio-alto**: refuerza el consumo intencional; "bajo solicitud" ya es la regla | **K6 · prioridad 4** |
| 6 | Transparencia de uso (métrica: "tasa de publicación después de usar Kairos") | ❌ | **Alto**: confianza + métrica propia del benchmark; barato | **K7 · prioridad 5** |
| 7 | Subtítulos conservando personalidad | ❌ | Alto pero **bloqueado por ffmpeg** | **K4 · condicional** (tras Bloque E) |
| 8 | Traducción conservando personalidad | ❌ | **Medio-bajo hoy**: la audiencia es es-MX; costo de proveedor sin demanda | **K5 · diferido** hasta audiencia multilingüe — así se queda, documentado |
| 9 | Limpieza de audio y transcripción | ❌ | **Bajo**: requiere procesamiento de audio (costo) para contenido mayormente texto/imagen; la transcripción útil llega con subtítulos (K4) | **Rechazado por ahora** — se reevalúa si el video con audio crece |
| 10 | Kairos en mensajes (F7) | ❌ | **Bajo**: asistente en DMs es intrusivo en lo privado y suma costo sin reforzar ningún diferenciador | **Rechazado** — el benchmark mismo advierte: no un chatbot pegado |
| 11 | Kairos en moderación (F7) | ❌ | **Medio-bajo**: el volumen no justifica triaje automático y la moderación humana con apelaciones (F8) es una decisión de producto deliberada | **Rechazado por ahora** — se reevalúa con volumen real de reportes |
| — | Chat conversacional como página propia (propuesta mía K1 original) | ❌ (el colgante se eliminó) | **Bajo y contradictorio**: la tesis del benchmark es que Kairos NO sea un chatbot pegado; el chat contextual del compositor ya cumple el rol sin contradecirla | **Retirada** — el filtro de beneficio se aplica también a mis propias propuestas |

**Resultado del filtro:** de 11 recomendaciones + 1 propuesta propia → **5 se quedan** (K2, K8, K3, K6, K7), **1 condicional** a ffmpeg (K4), **1 diferida** a demanda (K5), **4 rechazadas con razón documentada** (audio, mensajes, moderación, chat-página). Las 3 ideas originales (Constelación, Pulso a dúo, Linaje vivo) quedan como propuestas documentadas en `KRONOS-IDEAS-ORIGINALES.md` a la espera de decisión — nada implementado, nada perdido.

---

## 4. Plan Kairos resultante (con el filtro aplicado)

| Prioridad | Fase | Qué se construye | Tal cual lo verá el usuario | Sesiones | Depende de |
|---|---|---|---|---|---|
| 1 | **K2 · Alt-text automático** | Al subir imagen, Kairos propone descripción accesible editable | "Descripción sugerida por Kairos: 'Nebulosa rosa sobre montaña' — [Usar] [Editar] [Descartar]" | ~1 | nada |
| 2 | **K8 · Guardián de privacidad** | Detección preventiva de datos personales en el texto antes de publicar | "Kairos detectó algo que parece un número de teléfono y una dirección — ¿publicar de todos modos?" [Publicar] [Editar] — nunca bloquea, avisa | ~1 | nada |
| 3 | **K3 · Kairos curador** | Colecciones sugeridas de guardados + propuesta de cápsula anual | "Kairos encontró 3 colecciones en tus 214 guardados: Astrofotografía (58), Recetas (31), GDL (22) — [Crear]"; fin de año: "¿Sellamos tu cápsula 2026 con lo más resonado?" | ~1.5 | nada |
| 4 | **K6 · Resúmenes bajo solicitud** | Resumen de una Órbita solo cuando se pide | En una órbita: "Resumir la semana" → párrafo esencial + enlaces a las 3 publicaciones clave | ~1 | nada |
| 5 | **K7 · Transparencia de uso** | Panel "Tu uso de Kairos": generaciones del día, límite restante y la métrica del benchmark | "Hoy: 12/20 generaciones · 8 de tus publicaciones nacieron con Kairos (todas etiquetadas)" | ~1 | nada |
| — | K4 · Subtítulos | CC es-MX generados al procesar video, corrección del autor | Botón CC; "Editar → Subtítulos" | ~1 | **Bloque E (ffmpeg)** |
| — | K5 · Traducción con tono | Traducción de publicaciones preservando personalidad | "Traducir con mi tono" | ~1.5 | señal de audiencia multilingüe |

**Total favorable: ~5.5 sesiones** (antes del filtro: 8.5). Con el condicional y el diferido: máximo ~8, solo si se activan sus condiciones.

**Reglas fijas de Kairos (ya vigentes, no negociales):** nunca publica sin confirmación; toda pieza generada lleva etiqueta IA y linaje permanentes; el historial es privado; resúmenes y sugerencias son bajo solicitud, nunca automáticos; el guardián de privacidad avisa, jamás bloquea.

**Integración con el resto:** K2 y K8 viven en el compositor (donde ya vive "Mejorar con Kairos"); K3 conecta guardados con cápsulas (Tiempo); K6 conecta con Órbitas; K7 añade su métrica a la analítica privada existente (`/api/analytics/creator`). Ninguna pieza nueva de infraestructura salvo lo ya planificado (ffmpeg para K4).

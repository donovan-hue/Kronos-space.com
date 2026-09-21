# KRONOS — Comparativa con las demás redes y cumplimiento de lo recomendado

**Fecha:** 2026-09-21 · **Método:** se retoma la matriz funcional del benchmark (`KRONOS-SOCIAL-BENCHMARK-Y-PLAN-2026-09-19.md`, sección 4) y las lecciones por red (sección 3), y se verifica una por una contra lo que hoy existe en la rama (F1–F8 + limpieza).

## 1. Matriz funcional actualizada (Kronos HOY)

| Capacidad | Instagram | TikTok | X | Bluesky | Discord | **Kronos HOY** | Antes |
|---|---:|---:|---:|---:|---:|---|---|
| Feed de publicaciones | Sí | Sí | Sí | Sí | Parcial | ✅ + modos (Siguiendo/Cronológico/Intereses) + "por qué aparece" | "Sí" |
| Foto/carrusel/video | Sí | Sí | Sí | Sí | Sí | ✅ + editor de imagen (filtros, marcos, stickers, punto focal persistente) | "Sí" |
| Stories/efímero | Sí | Sí | No | No | No | ✅ Con audiencia, respuestas privadas y archivo real (F3) | No |
| Video vertical | Sí | Sí | Sí | Sí | No | ✅ Feed opcional (F3) | No |
| Live/voz | Sí | Sí | Spaces | No | Sí | ❌ Pendiente (Bloque G) | No |
| Reacciones múltiples | Parcial | Sí | Parcial | Parcial | Sí | ✅ Por tipo, persistentes, con conteos (F2, preexistente) | No |
| Comentarios en hilos | Sí | Sí | Sí | Sí | Sí | ✅ Respuestas anidadas (preexistente) | No |
| Mensajes/grupos | Sí | Sí | Sí | Sí | Sí | ✅ DM en tiempo real (socket) + conversaciones | "Sí" |
| Comunidades | Canales | Parcial | Sí | Feeds/listas | Sí | ✅ Órbitas: roles, reglas, duración, bienvenida y archivo (F4 + cierre) | No |
| Feed elegible | Parcial | Parcial | Listas | Sí | Canales | ✅ Pulso: sesión finita, registro de visto, señales más/menos (F6) | No |
| Colecciones | Guardados | Favoritos | Carpetas | Feeds | Canales | ✅ Colecciones privadas de guardados | Guardados |
| Editor creativo | Alto | Muy alto | Bajo | Bajo | Medio | 🟡 Imagen completo; video pendiente de recorte/transcodificación (Bloque E) | Medio |
| IA integrada | Meta AI | IA creativa | Grok | No central | Bots | ✅ **Kairos**: generación imagen/video/guion, compositor, personalidades, etiquetado IA con linaje (F7) | Kairos |
| Moderación avanzada | Sí | Sí | Sí | Etiquetas | Roles | ✅ Base + apelaciones + salud de comunidad + reportes con estado (F8) | Base sólida |
| Interoperabilidad | Threads | No | No | AT Protocol | Integraciones | ❌ Largo plazo (Bloque G) | No |
| Cápsulas temporales | No | No | No | No | Eventos | ✅ **Diferenciador**: cifradas, apertura idempotente (F5) | No |
| Linaje de remixes | Parcial | Duet/Stitch | Citas | Embeds | Hilos | ✅ **Diferenciador**: atribución verificada por servidor, genealogía consultable (F7) | No |
| Feed finito/intencional | No | No | No | Configurable | No aplica | ✅ **Diferenciador**: sesión de 8, fin real explícito (F6) | No |

**Marcador: 14 ✅ · 1 🟡 · 3 ❌ (los tres son infraestructura: live, federación, y la mitad de video del editor).** Los cuatro diferenciadores propios del benchmark están implementados.

## 2. Lecciones por red — cumplimiento

| Red | "Qué aprender" del benchmark | Estado |
|---|---|---|
| **Instagram** | Formatos según intención | ✅ post/carrusel/stories/vertical/cápsula |
| | Audiencia por contenido | ✅ pública/seguidores/círculos/órbita |
| | Editor y mensajería centrales | ✅ / 🟡 (editor de video en Bloque E) |
| | Ocultar contadores (presión social) | ❌ **Brecha detectada en esta revisión** — nadie la había pedido; propuesta: preferencia "ocultar contadores de reacciones en mi vista" (pequeña, encaja en Bloque B) |
| **TikTok** | Crear/consumir inmediatos | ✅ |
| | Remix conserva relación con la original | ✅ Linaje F7, mejor que Duet/Stitch (genealogía vs. cita) |
| | Estudio creativo integrado | 🟡 Kairos + editor imagen; video en Bloque E |
| **X** | El usuario construye sus feeds | ✅ modos + señales más/menos |
| | Guardar ≠ organizar | ✅ colecciones |
| **Bluesky** | Feed elegible | ✅ (exactamente su tesis: más/menos + ya visto) |
| | Onboarding por comunidades | ❌ Bloque D del plan (pantalla de bienvenida) |
| | Moderación/algoritmo en capas | 🟡 parcial: preferencias sí, capas configurables no |
| **Discord** | Roles, reglas, moderación propia | ✅ Órbitas |
| | Eventos con responsables | 🟡 eventos en posts; calendario de órbita pendiente |
| **Pinterest** | Guardados → colecciones útiles | ✅ / 🟡 (curación con IA → ver plan Kairos K3) |
| | IA sobre biblioteca personal sin dominar el feed | ❌ → plan Kairos K3 |
| **BeReal** | Una mecánica propia > veinte botoneses | ✅ tesis cumplida: cápsulas + pulso + linaje |
| | Limitar frecuencia reduce consumo compulsivo | ✅ sesión finita con fin explícito |
| **Threads/fediverso** | Portabilidad del contenido | ❌ exportación en Bloque F |
| | IDs/permisos pensados para interoperar | 🟡 diseño con `_id` y audiencias explícitas; federación en G |

## 3. Conclusión de la comparación

Todo lo recomendado por el benchmark está **implementado, planificado con sesión estimada, o clasificado como infraestructura pendiente**:

1. **Implementado:** los 4 diferenciadores (cápsulas, linaje, pulso, Kairos), stories, vertical, reacciones, hilos, órbitas completas, colecciones, moderación con confianza, analítica privada, onboarding de preferencias de feed.
2. **Planificado** (`PLAN-TRABAJO-RESTANTE.md`): búsqueda única (A), unificación visual (B), dispositivos/PWA (C), onboarding (D), video/ffmpeg (E), exportación + WCAG + límites (F), live/federación (G).
3. **Nuevas brechas detectadas en esta revisión** (se suman al plan): ocultar contadores de presión social (Instagram), calendario de Órbitas (Discord), curación de guardados con IA (Pinterest → plan Kairos K3).

Kronos hoy cubre la matriz funcional de sus referentes **sin copiar su navegación ni su tesis**: la diferencia es que el consumo es finito, la creación es trazable y el tiempo es material de producto.

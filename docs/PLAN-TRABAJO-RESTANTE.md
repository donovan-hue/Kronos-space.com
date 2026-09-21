# KRONOS — Plan de trabajo restante (con interfaz tal cual la verá el usuario)

**Fecha:** 2026-09-21 · **Base:** todo F1–F8 del plan maestro ya está en la rama `arena/01a0c354-kronos-space-com` (PR #30 pendiente de tu merge). Este documento es el plan de LO ÚNICO QUE HACE FALTA, ordenado por prioridad, con la interfaz descrita como la verá la persona que entre a kronos-space.com.

**Identidad que ya rige y no cambia:** negro absoluto `#000000` + cromo espejo premium. Nada de colores por feature; el único color fuera del cromo es semántico (éxito verde, error rojo, aviso ámbar) y solo en mensajes de estado.

---

## BLOQUE A — Navegación y búsqueda única (lo más visible, ~2 sesiones)

### A1. Búsqueda global única (⌘K / lupa)

Hoy conviven `/explore` y `/search`. Se unifican en **una sola búsqueda** que vive en la barra superior y se abre con el ícono de lupa o `Ctrl/⌘ + K`. Tal cual la verá el usuario:

```
┌──────────────────────────────────────────────────────────┐
│  🔍  Buscar personas, temas, órbitas, publicaciones…  ⌘K │
└──────────────────────────────────────────────────────────┘
            ↓ al escribir "astro"
┌──────────────────────────────────────────────────────────┐
│  GENTE                                              2    │
│  ◉ @ana · Ana Torres — Fotógrafa nocturna                │
│  ◉ @lunaria · Luz Neria — Astrofotografía                │
│  TEMAS                                              1    │
│  #astrofotografía · 128 publicaciones                    │
│  ÓRBITAS                                            1    │
│  ◎ Cielo profundo GDL · 56 miembros · pública           │
│  PUBLICACIONES                                      3    │
│  ▢ "Nebulosa de Orión desde Tapalpa…" · @ana · hace 2d  │
└──────────────────────────────────────────────────────────┘
   ↑ Enter abre el primero · Esc cierra · flechas navegan
```

- Panel flotante sobre negro, borde cromado `--k-border`, sin blur.
- Resultados agrupados por tipo con encabezados en `k-eyebrow`.
- Debounce de 300 ms, esqueleto cromado mientras busca, estado vacío: "Nada por aquí todavía. Prueba con otro término o crea la órbita que falta."
- En móvil este panel ocupa toda la pantalla con el teclado abierto (ver Bloque C).
- `/explore` y `/search` quedan como una sola ruta `/explore` (redirección de la vieja).

### A2. Comando "Crear" único (ya existe, se pule)

El centro de creación (`/create`, "Tu espacio para crear") gana accesos directos contextuales: si la persona viene de una órbita, el primer botón dice "Publicar en Cielo profundo GDL". Sin cambios de layout, solo contexto.

### A3. Navegación — la "chida" (abanico inferior)

Ya vive en la rama y así se queda, con dos ajustes finales:

```
 ESCRITORIO (≥1024px)                          MÓVIL (<768px)
┌─────────────────────────────┐  ┌────────────────────────────┐
│                             │  │        contenido           │
│         contenido           │  │                            │
│         (feed)              │  │                            │
│                             │  │                            │
│  ─ ─ ─ abanico ─ ─ ─ ─ ─ ─  │  │ ┌────────────────────────┐ │
│  \/ despliegue de ítems:    │  │ │  ⌂    🔍    ＋    ✉   ◉ │ │
│  Inicio · Pulso · Vertical │  │ │ Inicio Explorar Crear    │ │
│  Cápsulas · Analítica …     │  │ │ Mensajes  Perfil         │ │
└─────────────────────────────┘  │ └────────────────────────┘ │
                                  5 destinos fijos, siempre    │
```

- **Ajuste 1:** el abanico respeta feature flags (ya hecho) — se documentará en el panel de admin (ver F2).
- **Ajuste 2:** indicador de sección activa con reflejo húmedo `--k-reflect-horizon` bajo el ítem abierto (hoy es solo color).

---

## BLOQUE B — Unificación visual de las últimas superficies (~2 sesiones)

El sistema cromado ya cubre Auth, shell, posts, Kairos e IA. Faltan las superficies que conservan estilos legacy. Ninguna cambia de función: solo se visten con el sistema.

| Superficie | Hoy | Cómo quedará (tal cual la verá el usuario) |
|---|---|---|
| **Mensajes** (`/messages`) | Burbujas legacy, dos grises de fondo | Burbujas: propias en cromo vertical `--k-material-chrome-btn` con texto negro; ajenas en `--k-surface-2` con borde fino. Lista de chats con avatar + "escribiendo…" en gris cromado. |
| **Notificaciones** | Tarjetas correctas, filtros con estilos propios | Filtros como "chips" cromados uniformes (mismo componente que los de Moderación). Ícono por tipo de notificación en marco circular con borde cromado. |
| **Configuración** (`/settings/*`) | Formularios legacy | Inputs con focus cromado uniforme (`:focus-visible` global), etiquetas `k-eyebrow`, secciones en `k-surface` con borde `--k-border`. |
| **Moderación/Admin** | Mezcla de clases nuevas y viejas | Todas las tarjetas usan `k-surface k-settings-section`; badges de estado (pendiente/revisando/resuelto) con el mismo diseño de chip semántico. |
| **Diálogos** | `window.confirm` heredado en 3 flujos | Diálogo propio Kronos: fondo `#000`, borde cromado, título + descripción + acciones "Cancelar" (ghost) / "Confirmar" (primario). Nunca el diálogo del navegador. |
| **Carga** | 24 variantes de "..." | **Un spinner**: anillo cromado girando (SVG, respeta `prefers-reduced-motion`). Esqueletos con brillo húmedo para listas. |
| **Vacíos** | Mensajes improvisados | Componente único: ícono orbital tenue + título + una línea útil + acción. Ej. guardados vacío: "Aún no guardas nada — toca la estrella en cualquier publicación." |

**Cierre del bloque:** ninguna pantalla conserva estilos fuera de tokens; cero `window.confirm`; un solo spinner; auditoría visual re-ejecutada sin hallazgos A2–A6.

---

## BLOQUE C — Adaptación a cada dispositivo: responsive de punta a punta (~2 sesiones)

Hoy la app funciona en móvil y escritorio, pero la auditoría visual encontró **14 `@media` dispersos y sin escala documentada** (hallazgo A7), y varias superficies solo se probaron en laptop. Este bloque convierte "funciona en móvil" en **se siente nativa en cada pantalla**.

### C1. Escala de breakpoints única, en tokens

Los 14 `@media` dispersos se unifican en una escala documentada en `design-tokens.css`:

```
--k-bp-phone-sm: 380px    teléfono pequeño (iPhone SE, Galaxy A)
--k-bp-phone:    768px    teléfono estándar (hasta aquí = móvil)
--k-bp-tablet:  1024px    tablet (iPad y afines)
--k-bp-laptop:  1440px    laptop / escritorio normal
--k-bp-wide:    1920px    monitor grande
                              ≥2560 ultrawide / 4K
```

Regla: ningún componente vuelve a declarar su propio `@media`; consume la escala.

### C2. Cómo se ve cada superficie según el dispositivo

| Dispositivo | Experiencia tal cual la verá el usuario |
|---|---|
| **Teléfono pequeño (≤380px)** | Una sola columna. Tipografía base 16px (evita el zoom automático de iOS al enfocar un input). El compositor abre en **hoja completa** (no modal pequeña que flota). El abanico móvil deja espacio al notch/barra de gestos con `env(safe-area-inset-bottom)`. |
| **Teléfono estándar (381–767px)** | Barra inferior de 5 destinos (ya existe). Búsqueda a pantalla completa con teclado abierto. Carruseles con scroll-snap: una imagen por golpe de pulgar. En el vertical, doble tap = me gusta, deslizar arriba = siguiente. |
| **Tablet (768–1023px)** | Dos columnas: contenido a la izquierda + panel contextual (notificaciones, detalle de publicación, miembros de la órbita) que en teléfono es pantalla aparte. El abanico se despliega a lo ancho abajo. Soporta teclado físico conectado (atajos del Bloque C4). |
| **Laptop (1024–1439px)** | Columna central de 1040px centrada (el layout actual). Atajos de teclado completos. Estados hover con elevación cromada. |
| **Monitor grande (1440–1919px)** | Misma columna central con más aire — márgenes generosos, nada estirado. El negro respira a los lados (identidad, no desperdicio). |
| **Ultrawide / 4K (≥1920px)** | Columna central acotada (nunca líneas de 3000px) + opcional riel lateral discreto con "Órbitas sugeridas" (decisión de producto: si no, se queda negro limpio). |

Superficies con adaptación específica:

- **Feed vertical:** en teléfono es inmersivo a pantalla completa; en escritorio queda el reproductor 9:16 centrado con fondo negro y navegación por flechas ↑/↓ además del scroll.
- **Compositor:** modal centrado en escritorio; hoja completa deslizable en móvil, con la barra de publicar siempre al alcance del pulgar.
- **Tablas de Moderación/Admin:** tarjetas apiladas en móvil (las columnas se convierten en pares etiqueta-valor), tabla completa desde tablet.
- **Editor de imagen/video:** stage siempre visible; en móvil los controles se ponen en pestañas (Recorte / Filtros / Texto) para no hacer scroll interminable.
- **Onboarding (Bloque D):** tarjetas de temas en grilla 2×N en teléfono, 4–6 por fila en escritorio.

### C3. Ergonomía táctil (transversal)

- **Targets mínimos 44×44px** en todo lo tocable (hoy varios botones de ícono quedan cerca de 28px).
- **Nada funciona solo con hover:** el menú "⋯" de cada publicación abre con tap; los tooltips tienen alternativa visible en móvil.
- Áreas de gesto respetadas: `viewport-fit=cover` + `safe-area-inset-*` en TopBar, abanico y compositor (notch y barra de gestos de iPhone; barras de navegación de Android).
- Scroll horizontal con `scroll-snap` en carruseles y chips de filtros; sin scroll anidado raro.
- Rotación portrait↔landscape sin romper nada: en vertical (el feed), landscape = reproductor a pantalla completa.

### C4. Teclado y puntero fino (escritorio)

- `:focus-visible` cromado global (llega con el Bloque B) y orden de foco lógico.
- Atajos: `⌘K` búsqueda, `↑/↓` siguiente/anterior en vertical, `Esc` cierra paneles, `?` abre la ayuda de atajos (pantalla nueva, pequeña).
- Cursor `pointer` solo en lo clicable; nada de cursor de texto en tarjetas.

### C5. Imágenes y video que pesan según la pantalla

- `srcset`/`sizes` en todas las imágenes del feed (hoy se sirve la misma URL a un SE y a un 4K) **combinado con el punto focal persistente** ya implementado: el recorte correcto en cualquier proporción.
- `poster` en videos (ya existe) y `preload="metadata"` (ya existe) verificados en 4G real.
- Presupuesto móvil: Lighthouse performance ≥ 85 en el recorrido "login → feed → vertical", imágenes lazy (ya) y fuentes sin bloqueo.

### C6. Se siente app: PWA instalable

- `manifest.webmanifest` (nombre, iconos 192/512 con la K orbital, `theme_color #000000`, `display: standalone`).
- Al instalar en el teléfono: abre sin barra de navegador, icono propio, splash negra con el reloj cromado.
- Offline honesto: shell cacheada que muestra "Sin conexión — Kronos volverá cuando haya red" (no un dinosaurio ni una pantalla blanca). Nada de simular contenido offline.

### C7. Matriz de pruebas en dispositivos (cierre del bloque)

| Dispositivo | Viewport | Qué se prueba |
|---|---|---|
| iPhone SE | 375×667 | todo el recorrido; sin overflow horizontal |
| iPhone Pro Max (notch) | 430×932 | safe-areas, vertical inmersivo, PWA instalada |
| Android estándar | 360×800 | abanico, hoja del compositor, doble tap |
| iPad Mini / Pro | 768 / 1024 | dos columnas + teclado conectado |
| Laptop | 1280×800 y 1440×900 | atajos, hover, foco visible |
| Escritorio / ultrawide | 1920×1080 y 2560×1080 | columna acotada, nada estirado |

Cada pantalla del Bloque A/B se prueba en los 6 tamaños **antes** de darse por cerrada (entra a los criterios de cierre globales). Pruebas con DevTools + dispositivos físicos que tengas a la mano, grabadas para comparar antes/después.

---

## BLOQUE D — Onboarding por intereses y Órbitas (nueva pantalla, ~1.5 sesiones)

Hoy quien se registra aterriza en un feed vacío. La primera experiencia será:

```
  Bienvenida a Kronos, Ana                    ● ○ ○ ○  (paso 1 de 4)

  ¿Qué te mueve?  Elige al menos 3 temas para afinar tu Pulso.

   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ ✦ Cielo  │ │ 🎵 Música │ │ 📸 Foto  │ │ 🌋 Viajes│
   └──────────┘ └──────────┘ └──────────┘ └──────────┘
   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ 🎨 Arte  │ │ 🔬 Ciencia│ │ 🍜 Cocina│ │ ⚽ Deporte│
   └──────────┘ └──────────┘ └──────────┘ └──────────┘
                     [ Saltar ]   [ Continuar → ]
```

1. **Temas** (arriba) → se guardan como señales "more" iniciales en `FeedSignal`: el Pulso y el feed de intereses nacen afinados, no en blanco.
2. **Órbitas sugeridas**: 6 órbitas públicas alineadas a los temas elegidos, con botón "Unirme" directo y el paquete de bienvenida visible.
3. **Personas**: 6 perfiles activos en esos temas con "Seguir" directo.
4. **Tu primera acción**: "Publica algo breve" con el compositor ya abierto, o "Empieza por Pulso" → sesión de 8 sin repeticiones.

- Todo el flujo es omitible (`Saltar`); lo elegido se puede cambiar después en Configuración.
- Se ve una sola vez por cuenta (flag en `User.preferences.onboarded`).
- La barra de progreso son 4 puntos cromados; el activo con reflejo.
- Responsive según Bloque C: grilla de temas 2 por fila en teléfono, 4–6 en escritorio; pasos a pantalla completa en móvil.

---

## BLOQUE E — Video real: transcodificación, recorte y subtítulos (~3 sesiones + decisión de hosting)

Es el pendiente más técnico (requiere **ffmpeg** y decidir dónde corre: contenedor del server, worker aparte o servicio gestionado). Tal cual lo verá el usuario:

- **Al publicar video:** debajo de la barra de subida aparece "Procesando calidad… ▓▓▓░░ 62%". El post se publica ya con la original; las variantes 1080p/720p/480p (H.264 + una WebP de portada) aparecen solas al terminar. Nadie espera para publicar.
- **En el reproductor del feed vertical:** engrane ⚙ con "Calidad: Automática (720p)" — automática según red; manual en 1080/720/480. El cambio no corta la reproducción.
- **Subtítulos:** botón CC en el reproductor. Se generan automáticos (es-MX) en el procesamiento; el autor puede corregirlos desde "Editar publicación → Subtítulos" antes de encenderlos. Mientras el autor no los apruebe, no se muestran.
- **Recorte temporal en el editor de video:** barra con dos tiradores cromados sobre la película, preview en vivo, "Usar del 0:12 al 0:38", mute y selección de portada por cuadro. (El editor de imagen ya tiene filtros, marcos, stickers y punto focal; este es su gemelo de video.) En móvil los controles van en pestañas (Bloque C2).

**Entregables:** job asíncrono con reintentos, estados en el post (`media.variants`), UI del reproductor, editor de recorte, subtítulos con flujo de aprobación, y la analítica de video (retención) que dependía de esto.

---

## BLOQUE F — Confianza y lanzamiento, lo restante de F8 (~2 sesiones)

1. **Exportación de datos** (portabilidad). En Configuración → "Tus datos":
   ```
   Tus datos
   Descarga todo lo que has creado: publicaciones, comentarios,
   reacciones, mensajes, órbitas y perfil.
   [ Solicitar exportación ]
   → "Preparando tu archivo… te avisaremos por notificación (5–10 min)"
   → Notificación: "Tu exportación está lista · Descargar (.zip)"
   ```
   ZIP con JSON legible + tus medias originales. Job asíncrono, un enlace firmado que expira en 72 h, límite de 1 solicitud por semana.

2. **Rate limits adaptativos y anti-spam.** Invisible para el usuario honesto: quien publica 30 posts en 5 minutos ve "Vas muy rápido. Tómate un momento." Los límites suben con reputación (cuenta verificada + sin reportes resueltos) y bajan con señales de spam. Panel para moderadores con las cuentas limitadas y por qué.

3. **Accesibilidad WCAG 2.1 AA.** Recorrido completo con lector de pantalla (etiquetas, orden de foco, `aria-live` en toasts), contraste verificado del cromo sobre negro, `prefers-reduced-motion` en todas las animaciones (abanico incluido), navegación 100% por teclado sobre la base del Bloque C4. Las pruebas por dispositivo y PWA ya quedaron cubiertas en el Bloque C.

**Cierre del bloque:** auditoría WCAG sin críticos, exportación funcionando de punta a punta, límites adaptativos documentados.

---

## BLOQUE G — Escala (P3, después de lanzar; solo definición por ahora)

| Función | Tal cual la verá el usuario | Nota |
|---|---|---|
| **Live/voz** | Tarjeta "EN VIVO" con anillo cromado pulsante en el feed; sala con video + chat con moderación propia | Requiere infra de tiempo real (WebRTC/SFU) |
| **Federación** | Buscar y seguir cuentas de otros servidores desde la misma búsqueda global (⌘K) | ActivityPub; decisión de producto |
| **Monetización** | "Apoyar" en perfiles + beneficios por órbita (solo después de confianza + moderación maduras) | El plan maestro lo exige al final |

---

## Orden y dependencias

```
A (navegación/búsqueda)  ──┐
B (unificación visual)  ──┼──→ F (confianza/lanzamiento) ──→ G (escala)
C (dispositivos)        ──┤         ↑
D (onboarding)          ──┘         │
E (video/ffmpeg) ───────────────────┘ (la retención de video alimenta la analítica)
```

| Bloque | Sesiones estimadas | Depende de |
|---|---|---|
| A. Navegación y búsqueda única | ~2 | nada |
| B. Unificación visual | ~2 | nada (tokens ya existen) |
| C. Adaptación a dispositivos | ~2 | B para foco/diálogos; puede avanzar en paralelo |
| D. Onboarding | ~1.5 | nada (FeedSignal ya existe) |
| E. Video/ffmpeg | ~3 | **decisión de hosting de ffmpeg** |
| F. Exportación + límites + WCAG | ~2 | B y C terminados |
| G. Escala | por definir | lanzamiento + decisiones de producto |

**Sugerida:** A → B → C en primer lugar (es lo que se ve y cómo se ve en cada pantalla); D en cualquier momento; E arranca cuando definas dónde corre ffmpeg; F cierra el lanzamiento; G después de datos reales.

---

## Criterios de cierre globales (definición de "terminado")

1. Ninguna pantalla con estilos fuera de tokens; cero diálogos del navegador; un solo spinner.
2. Una sola búsqueda; el abanico y el móvil de 5 destinos intactos.
3. **Cada pantalla probada en los 6 tamaños de la matriz C7 antes de cerrarse; cero overflow horizontal; targets ≥44px; PWA instalable con offline honesto.**
4. Registro → onboarding → feed con contenido afinado, sin pantalla vacía.
5. Video procesado con variantes + subtítulos aprobados por el autor.
6. "Descargar mis datos" entrega un ZIP verificable.
7. Auditoría WCAG 2.1 AA sin hallazgos críticos.

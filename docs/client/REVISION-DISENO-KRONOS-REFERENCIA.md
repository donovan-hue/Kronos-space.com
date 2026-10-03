# Revisión: ¿está integrado el diseño de `kronos.html`?

Fecha: 2026-10-03. Rama: `arena/01a10038-kronos-space-com` (commit `3caeebb`).
Método: lectura del código real, comparación lado a lado en el laboratorio de
diseño y build verificado. No es una bitácora: es el estado comprobable hoy.

---

## Veredicto

**No.** El repositorio contiene el archivo de referencia `kronos.html`, pero ese
diseño **no está generado ni integrado** en la aplicación.

- `kronos.html` es un **prototipo completo y aislado** (1 603 líneas, CSS y
  JavaScript propios, router por hash en español). Nada del cliente lo importa:
  `client/index.html` carga `/src/main.jsx` y ese es el único punto de entrada.
  Búsqueda de referencias a `kronos.html` en el código, pruebas, scripts y
  workflows: **0 coincidencias**.
- La aplicación sirve hoy la piel **«verdant» / verde-espejo** definida en
  `client/src/styles/aqua-theme.css` (cargada al final en `main.jsx`, después de
  `chrome-minimal.css`), con el acento verde `--k-aqua: #3de892`.
- El único commit de la rama es `chore: add kronos html reference` (3caeebb):
  añade el archivo y el resto del proyecto, sin ninguna integración visual.
- El plan vigente ([PLAN-MAESTRO-EJECUCION-KRONOS.md](../PLAN-MAESTRO-EJECUCION-KRONOS.md))
  mantiene `UI01`/`UI02` y el bloque de DISEÑO como **«REQUIERE APROBACIÓN —
  esperando propuesta y aprobación»**: no existía un diseño aprobado, por eso no
  se aplicó ninguna capa visual nueva.

Coinciden en dos decisiones de fondo (fondo negro puro y lenguaje de cromo), pero
el lenguaje visual completo —color, tipografía, marca, botones, shell y piezas—
es **distinto**.

---

## Comparación punto por punto

| Dimensión | Referencia `kronos.html` | Aplicación actual | Dónde se ve |
|---|---|---|---|
| Fondo | Negro puro `#000` (línea 10) | Negro puro `#000` | `aqua-theme.css:12` |
| **Acento de color** | **Ninguno**: todo plata/blanco; solo los estados usan pasteles | **Verde espejo** `#3de892` (+ borde y superficies verdosas `#020403`, `#040705`, `#f6fff8`) | `aqua-theme.css:9-30` |
| **Tipografía** | `Helvetica Neue, Helvetica, Arial` (línea 26), mayúsculas espaciadas `letter-spacing` amplio | `Inter` con tracking negativo en títulos (`-0.025em` a `-0.045em`) | `styles.css:956-966, 1005` |
| Cromo de letras | Gradiente `--chrome` de ~20 paradas + `--soft-silver` | Gradiente de 5 paradas y, en portada, letras blancas con relieve (sin `background-clip`) | `kronos.html:21-24` vs `chrome-minimal.css:70+`, `landing-void.css:188-210` |
| **Marca (logotipo)** | 4 capas apiladas: extrusión + bisel + aro + cara (`b-extrude/b-bevel/b-rim/b-face`) ⇒ relieve 3D de verdad | Un solo elemento `.brand-title` con un gradiente; la portada añade sombras y destello, sin extrusión | `kronos.html:30-47` vs `styles.css:1571` |
| **Portada / splash** | `KRONOS` + `SPACE` en dos líneas, regla cromada, lema «Tu Tiempo, Tu espacio, Tu dominio», botones «Inicio» / «Crear cuenta» y enlace «Ver todas las pantallas» | Reloj + esfera, `KRONOSPACE` en una línea, «Time × Space Platform», `kronos-space.com`, conmutador de movimiento | `kronos.html:224-235, 400-413` vs `features/auth/Auth.jsx:410-436` |
| **Botones** | Aro cromado hueco: borde de 1.6 px y **interior negro** con la etiqueta en plata | Primario = **relleno de cromo sólido** con texto oscuro (`--k-material-chrome-btn` verde) | `kronos.html:53-60` vs `chrome-minimal.css:541-558`, `aqua-theme.css:35` |
| **Shell de navegación** | Barra superior fija (buscar, avisos, mensajes, rejilla) + **pestañas inferiores** con 5 destinos; contenido a 660 px | Barra lateral (`FanNav`) + nav móvil de 5 destinos (`home/explore/create/messages/profile`), topbar contextual, contenido a 760 px, cajón «Todas las secciones» y mapa orbital (tecla `G`) | `kronos.html:155-165, 554-570` vs `FanNav.jsx`, `navigation/model.jsx:192`, `chrome-minimal.css:65` |
| **Estados semánticos** | Verde menta `#8fd6b0`, ámbar `#e7c07b`, rosa `#e08b8b` | Verde `#66efb3`, ámbar `#f2ca72`, rojo `#ff7185` | `kronos.html:19-21` vs `aqua-theme.css:27-29` |
| **Piezas de interfaz** | Control segmentado (`.seg`), interruptor (`.sw`), hoja inferior (`.sheet`), reels (`.reel`), métricas (`.stats`), tabla (`.table`), `.kv`, barra (`.bar`), funda (`.cover`), miniaturas (`.thumb`), estados vacíos (`.state`), esqueletos (`.skel`), arte SVG generativo (`art()`) | Equivalentes parciales con otra piel (`.k-tabs`, diálogos Radix, esqueletos, `EmptyState`); **no existen** el control segmentado, la hoja inferior, el interruptor ni los reels con esa construcción | `kronos.html:77-215` vs `client/src/components/*` |

### Inventario de pantallas

El prototipo cubre las mismas áreas del producto (inicio, buscar, crear,
publicación, historias, guardados, vertical, círculos, órbitas, canales,
mensajes, conversaciones, notificaciones, Kairos completo, biblioteca, directos,
cápsulas, pulso, analítica, ajustes, admin) **con otros nombres y otras rutas**
(`#/crear`, `#/kairos-imagen`) que las de la aplicación (`/create/post`,
`/kairos/image`, con aliases). Es decir: la referencia sirve como objetivo
visual, pero no puede «copiarse» sin un mapa de equivalencias y sin tocar rutas
(que el plan prohíbe alterar sin decisión expresa).

---

## Qué se hizo en esta revisión (verificable)

1. **Pantalla de comparación en el laboratorio**: `/design-preview/kronos`
   (servidor `npm run dev:design`, puerto 3002). Importa `kronos.html` **como
   texto y sin modificarlo** (`?raw`) y lo renderiza aislado en un `iframe` con
   `srcdoc`, con anchos de 390 / 768 / 1280 px y botón de reinicio. El prototipo
   dentro del marco es interactivo (su propio router por hash funciona).
   - `client/src/design-preview/kronos/KronosReferencePreview.jsx`
   - `client/src/design-preview/kronos/kronos-reference.css`
   - Ruta registrada en `client/src/App.jsx` (solo laboratorio; no forma parte
     del producto y no altera ninguna ruta de la aplicación).
2. **Build comprobado**: `npm run build` termina correctamente; la referencia
   queda en un trozo propio de carga diferida (`KronosReferencePreview-*.js`,
   103 kB) que **solo se descarga al abrir la ruta del laboratorio**. La carga
   inicial de la aplicación no cambia.
3. **Dos vistas para comparar en vivo**: aplicación en el puerto 3000
   (pantalla de acceso real) y laboratorio en el 3002
   (`/design-preview/kronos`).

### Límite honesto de la evidencia

No hay capturas automáticas: en este entorno no existe navegador instalado y la
descarga de Chromium para Playwright falla (sin acceso al CDN). La comparación
visual se hace en el laboratorio; las suites de navegador del repositorio
(`client/test-browser`) siguen sin poder ejecutarse aquí.

---

## Recomendación

La autoridad visual es del propietario. Para pasar de «referencia archivada» a
«diseño integrado» hace falta una decisión explícita y un alcance por bloques:

- **Opción A — adoptar `kronos.html` como objetivo visual.** Propuesta: mapa
  pantalla por pantalla (referencia → componente real), integrar por bloques
  —marca y portada → shell y navegación → feed y publicación → mensajes →
  Kairos → ajustes— validando cada bloque en el laboratorio antes de tocar la
  aplicación. Requisitos: conservar rutas y aliases, no romper contratos de la
  API, mantener el 3D en carga diferida, y respetar `prefers-reduced-motion`,
  foco y `aria`.
- **Opción B — conservar la piel actual** (verde-espejo) y dejar `kronos.html`
  como referencia histórica.

En ambos casos el laboratorio `/design-preview/kronos` queda disponible como
prueba aislada, sin efecto sobre la cuenta ni sobre la interfaz publicada.

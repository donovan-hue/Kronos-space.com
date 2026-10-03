# Revisión: `kronos.html` como referencia de diseño

Fecha: 2026-10-03. Rama: `arena/01a10038-kronos-space-com`.
Método: lectura del código real, comparación lado a lado en el laboratorio de
diseño y build verificado. No es una bitácora: es el estado comprobable hoy.

---

## Veredicto

1. **El prototipo `kronos.html` no está integrado en la aplicación** — y no debe
   estarlo: es una **referencia estética**, escrita para otro código (su propio
   CSS, su propio router por hash en español, 1 603 líneas). Nada del cliente lo
   importa; la única referencia en el repositorio es la pantalla de comparación
   del laboratorio.
2. **La aplicación tiene su propio diseño, generado a partir de esa estética**:
   el sistema **«CROMO ESPEJO»** (`client/src/styles/kronos-chrome.css`,
   cargado al final de `main.jsx`). No copia estructura, ni clases, ni rutas del
   prototipo: se escribe con los componentes y tokens reales del proyecto.

La decisión del propietario fue explícita: nada de verde espejo, el HTML solo
como guía de estilo, sin tocar rutas y sin dejar nada roto.

---

## Comparación de referencia

| Dimensión | `kronos.html` (guía) | Aplicación con «Cromo Espejo» |
|---|---|---|
| Fondo | Negro puro `#000` | Negro puro `#000` (oscuro) / blanco `#fff` (claro) |
| Armazón | Barra superior con marca + iconos; columna de 660 px; pestañas inferiores de 5 destinos | Igual: barra superior (marca + buscar/avisos/mensajes/rejilla/atajos), columna centrada de 660 px y pestañas inferiores fijas en móvil y escritorio |
| Acento | Ninguno: plata/blanco; solo estados con tono | Ninguno: el acento es el cromo; aviso ámbar y error rosa seco |
| Tipografía | `Helvetica Neue / Helvetica / Arial`, versalitas espaciadas | Igual: Helvetica en cuerpo y titulares, micro-etiquetas espaciadas |
| Cromo de letras | Degradado espejo de ~20 paradas | `--k-material-chrome` (23 paradas) y `--k-ring-chrome` (aro) |
| Marca | Wordmark en capas (extrusión + bisel + aro + cara) | Mismo lenguaje con CSS puro: `data-k-text` → `::before` (cuerpo extruido), cara cromada y `::after` (aro y bisel); el DOM conserva un solo texto |
| Botones | Aro cromado con interior negro | Aro cromado (`padding-box`/`border-box`, borde 1.6 px transparente) en primario, IA, envíos y pestañas activas |
| Superficies | Paneles `#060708` y líneas de un píxel | Paneles `#060708` + línea `rgba(200,210,224,.16)`; sin brillos |
| Campos | Aro de un píxel, interior negro, foco brillante | Igual, con aro cromado completo al enfocar |
| Píldoras | `badge`/`seg`/`chip` con versalitas y aro interior | Igual sobre `.k-badge*`, `.k-chip`, `.k-tabs`, `.k-profile-tabs` |
| Avatares e historias | Aro cromado, interior negro | Igual sobre `.k-avatar`, `.profile-avatar`, `.k-story-ring` |
| Estados | Caja con línea discontinua | Igual sobre `.k-state*` (discontinua; ámbar/rosa secos) |
| Avisos | Avisos tipo píldora, hojas y cajones con línea | Igual sobre `.k-toast*`, `[role="dialog"]`, `.k-drawer-*` |
| Semántica de color | Verde menta / ámbar / rosa | Cromo / ámbar / rosa seco (el éxito es cromo: decisión de esta rama) |

### Lo que NO se copió (a propósito)

- Rutas y nombres: el prototipo usa `#/crear`, `#/kairos-imagen`; la aplicación
  conserva las suyas (`/create/post`, `/kairos/image`) **y sus aliases**.
- Componentes y clases del prototipo (`.brand`, `.btn`, `.seg`, `.reel`, …): el
  diseño se reescribió sobre las clases reales (`k-*`), sin duplicar catálogos.
- El logo del prototipo: la aplicación conserva su reloj + esfera (contrato de
  las pruebas de portada), ahora cromados.

---

## Tema claro / oscuro y armazón (2026-10-03, instrucción del propietario)

- **Dos estilos, un solo diseño.** Configuración → «Notificaciones y apariencia»
  tiene ahora el control **Claro / Oscuro** (`ThemeToggle`), y el laboratorio de
  diseño lleva el mismo control. Los tonos del tema claro son exactamente los
  del laboratorio (blanco, tinta `#161a22`, gris `#666d77`, línea `#dfe2e7`,
  panel `#f2f3f5`); el cromo se invierte. La elección se guarda en el navegador
  (`kronos.theme-preference`), se aplica antes de hidratar y no toca la cuenta.
- **Armazón de la referencia, en móvil y en escritorio.** Barra superior fija
  con la marca y los accesos de icono (buscar, avisos, mensajes, «Más
  secciones», atajos), contenido en columna centrada de 660 px y pestañas
  inferiores fijas con cinco destinos. Se retiró la barra lateral; todos los
  destinos siguen accesibles por las pestañas, el cajón, el índice accesible y
  el mapa orbital (`G`). Ninguna ruta ni API cambió.
- **La portada ya no lleva el botón de 3D.** El conmutador «Movimiento en bucle»
  se retiró de la primera pantalla y se movió a Configuración, junto al tema.

## Qué se hizo

1. **Sistema de diseño nuevo**: `client/src/styles/kronos-chrome.css`
   (paleta, materiales, tipografía, botones de aro, campos, superficies,
   píldoras, avatares, estados, avisos, navegación, portada y movimiento
   reducido). Importado al final: manda sobre las pieles anteriores sin
   borrarlas.
2. **Sin verde en el árbol**: se retiró de `aqua-theme.css` (hoy capa de
   compatibilidad con alias de cromo), `flow.css`, `landing-void.css`,
   `interface-density.css` y de la luz 3D (`ChromeLoop.jsx`). Comprobación
   automática de literales verdes en `client/` y `server/`: **0 coincidencias**.
3. **Rutas intactas**: `App.jsx` no cambió ninguna ruta del producto (el
   laboratorio `/design-preview/kronos` es una ruta aislada de desarrollo).
4. **Verificación**: `npm run build` correcto; `npm run lint --workspace=client`
   limpio; 243 pruebas de interfaz + 29 de cliente en verde; revisión manual en
   el laboratorio (`/design-preview/kronos`) y en la aplicación (puerto 3000).
5. **Laboratorio de comparación** (ya existente): sirve para seguir afinando
   pantalla por pantalla contra la referencia, sin tocar producción.

### Límite honesto de la evidencia

No hay capturas automáticas: en este entorno no existe navegador instalado y la
descarga de Chromium para Playwright falla. La comprobación visual se hace en
las vistas previas; las suites de navegador (`client/test-browser`) siguen sin
poder ejecutarse aquí.

Lo que conviene afinar mirando pantalla en el tema claro (el oscuro es la piel
de origen y está probada): tablas y listas densas (analítica, moderación,
administración), los reels de Vertical junto a la nueva tira inferior, y el
contraste de los textos secundarios sobre panel claro. Todo eso vive en un solo
archivo (`kronos-chrome.css`, §14) y se cambia sin tocar componentes.

---

## Siguiente paso

El sistema ya está aplicado a todas las pantallas porque vive en la capa de
tokens y componentes. Lo que queda es afinado fino, por bloques y con el
propietario mirando cada uno: portada, feed y publicación, mensajes, Kairos,
ajustes y estados vacíos. Cualquier ajuste se hace en `kronos-chrome.css`
(un solo archivo) y se comprueba en las dos vistas antes de darlo por bueno.

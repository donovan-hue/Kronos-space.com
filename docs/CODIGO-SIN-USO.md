# Código que no forma parte del código principal

Revisión del proyecto kronos-space (el principal, «cronos») sobre el commit `e730528`.
Todo lo de este documento es resultado de medir, no de opinar: se recorrió el grafo de importaciones
desde las entradas reales (cliente: `src/main.jsx`; servidor: `src/server.js`), después desde las
pruebas y después desde las herramientas de `/scripts`, para distinguir tres casos:

- lo que **nadie importa** (candidato firme a borrar),
- lo que **solo usan las pruebas** o solo las herramientas (no llega al producto),
- lo que está **declarado y no se usa** (dependencias, exportaciones y clases de estilo).

**No se borró nada todavía.** Este documento es el reporte; cada paso se autoriza por separado.

---

## 1. Nadie lo importa (dos archivos, 5.4 KB)

| Archivo | Peso | Qué es | Quién lo usaba |
|---|---|---|---|
| `client/src/design-preview/DesignPreview.jsx` | 3.5 KB | Pantalla vieja de vista previa de diseño | Nadie. `App.jsx` solo monta el wordmark (`/design-preview/wordmark`) |
| `client/src/design-preview/NanoScene.jsx` | 1.9 KB | Escena 3D vieja (pirámide y tubo hexagonal) | Solo `DesignPreview.jsx`, que también se va |

Los dos son restos de las pruebas de diseño anteriores a la escena actual. No entran al paquete que
baja el usuario (Vite no los empaqueta), pero sí ensucian el repositorio y hacen perder tiempo.

## 2. Solo lo usan las pruebas (13 archivos, 13.7 KB)

| Archivo | Peso | Quién lo usa |
|---|---|---|
| `client/src/design-preview/hexTubeGeometry.js` | 2.9 KB | `test-ui/hex-tube.spec.js` y `test-ui/pyramid-skin.spec.js` |
| `client/src/design-preview/pyramidSkin.js` | 3.3 KB | `test-ui/pyramid-skin.spec.js` |
| `client/src/components/ui/avatar.jsx` | 1.3 KB | Pruebas |
| `client/src/components/ui/button.jsx` | 3.2 KB | Pruebas |
| `client/src/components/ui/input.jsx` | 1.0 KB | Pruebas |
| `client/src/components/ui/label.jsx` | 0.5 KB | Pruebas |
| `client/src/components/ui/skeleton.jsx` | 0.5 KB | Pruebas |
| `client/src/components/ui/textarea.jsx` | 1.0 KB | Pruebas |

Dos lecturas posibles, y hay que elegir una:

1. **El kit `components/ui/` se adopta** (los seis componentes son el juego de interfaz tipo shadcn)
   y se empieza a usar en el producto. Hoy la interfaz real usa `dialog.jsx`, `EmptyState.jsx` y
   `Spinner.jsx` de esa misma carpeta, pero no los otros seis.
2. **Se retira** el kit que nadie usa: los seis componentes, sus pruebas y las geometrías viejas del
   preview (13.7 KB).

## 3. Clases de estilo definidas y sin uso — **resuelto**

Este barrido dio pie a la consolidación: las 30 hojas de producto se fusionaron
en `client/src/styles/kronos.css` y **las 273 reglas cuya clase no usa nadie
se eliminaron al fusionarlas**. La tabla por hoja ya no aplica: hoy sólo hay
cuatro hojas y una es la de producto.

| Hoja | Estado |
|---|---|
| `client/src/styles/kronos.css` | **Única hoja de producto.** Generada por `scripts/styles/consolidate-identity.js` |
| `client/src/styles/design-tokens.css` | Vocabulario del color (tokens `--k-*`) |
| `client/src/styles/tailwind.css` | Motor de utilidades (capas `theme`/`base`/`utilities`) |
| `client/src/styles/app.css` | Entrada única |

El criterio de «clase viva» del generador es conservador: cuenta el atributo
`class`/`className` (literal, plantilla o ternario), las variables que llevan
las clases (`const clase = \`brand ${x}\``), los prefijos dinámicos
(`k-badge-${estado}`) y el uso directo en el DOM (`querySelector`,
`classList.add`, `setAttribute('class', …)`). Con ese criterio **ninguna clase
usada en el JSX se quedó sin estilo**, y las guardas de accesibilidad
(`!important`) se conservan aunque su clase no se use.

Las 37 de `styles.css` eran restos del reloj viejo y de la portada anterior
(`k-clock-root`, `k-sign-wet`, `k-master-cta-btn`, `nav-link`, `w2`…). **Ya no
existen**: la hoja se eliminó y su contenido útil quedó fusionado en
`kronos.css`.

Las 18 de `10-utilities.css` son ayudantes de espaciado y flex que nadie llama: `k-sp-4`, `k-sp-6`,
`k-sp-9`, `k-sp-10`, `k-sp-11`, `k-sp-12`, `k-sp-14`, `k-mb-6`, `k-mb-9`, `k-mt-9`, `k-flex`,
`k-grow`, `k-row`, `k-row-sm`, `k-wrap`, `k-between`, `k-pointer`, `k-divider-grow`.

## 4. Dependencias declaradas que el código no importa

| Paquete | Dónde está declarado | Lectura |
|---|---|---|
| `postprocessing` | `client/package.json` (dependencia) | No se importa directo: lo trae `@react-three/postprocessing`. Se puede quitar de la lista |
| `ajv` | `client/package.json` (desarrollo) | Solo vive dentro de `@hookform/resolvers`. Si no se va a usar el validador de ajv, se puede quitar |
| `lightningcss` | `package.json` (raíz) | Nadie la configura: Vite 7 no la usa salvo que se pida en `vite.config.js` |

Estas **sí se usan** y no hay que tocarlas: `vite`, `eslint`, `eslint-plugin-react-hooks`, `jsdom`,
`@testing-library/*`, `@playwright/test` (hay `playwright.config.js`), `@vitejs/plugin-react`,
`nodemon` (script `dev` del servidor), `@types/react`, `tailwindcss` (lo cargan
`styles/tailwind.css` y el propio Vite).

## 5. Exportaciones que nadie importa (33) y que solo usan las pruebas (13)

Nombres declarados con `export` que no aparecen en ninguna otra parte del código. Se listan por
archivo; **revisar antes de borrar**, porque algunas pueden ser API prevista para lo que viene.

**Nadie las usa (33):**

| Dónde | Nombres |
|---|---|
| `services/authStorage.js` | `peekSession`, `subscribeToSession`, `hasSession`, `hasRefreshToken`, `getSession` (este sí lo usan las pruebas), `getTokenExpiresAt`, `getRefreshTokenExpiresAt`, `decodeTokenPayload` |
| `services/apiUrl.js` | `PRODUCTION_API_URL`, `STATIC_FRONTEND_HOSTS`, `isStaticFrontendHost` |
| `services/publicUrl.js` | `CANONICAL_WEB_ORIGIN`, `LEGACY_PUBLIC_HOSTS` |
| `services/postsService.js` | `getFeedByRoute`, `getPostsByHashtag` |
| `services/aiService.js` | `deleteImageGeneration`, `deleteVideoGeneration`, `getVideoStatus` |
| `services/capsulesService.js` | `getCapsule` |
| `services/adminService.js` | `getAdminPosts` |
| `services/storiesService.js` | `getStory` |
| `services/queryKeys.js` | `postKeys` |
| `schemas/index.js` | `emailField`, `passwordField`, `usernameField`, `profileSchema` |
| `lib/mediaStudio.js` | `filtroPorId`, `esAjusteNeutro` |
| `navigation/navTransition.js` | `sectionDistance` |
| `features/social/postLists.js` | `setPostDetail` |
| `components/ui/button.jsx` | `buttonVariants` |
| `components/ui/dialog.jsx` | `DialogClose` |

**Solo las pruebas (13):** `ALIAS` (mapa de pantallas), `resetWebGLCacheForTests` (3D),
`getCreatorSupport`, `getSupportHistory`, `updateProfile`, `getMySignals`,
`hidePostAsModerator`, `restorePostAsModerator`, `createTestQueryClient`, `DialogTrigger`,
`resolvePostAuthRedirect`, `MOTIVO_SIN_CATALOGO`, `getSession`.

De ese segundo grupo, el único que conviene revisar es `resolvePostAuthRedirect`: está exportado
desde `Auth.jsx` (26 KB) y solo lo usan las pruebas, señal de que quedó como resto de una refactor.

## 6. Lo que sí ocupa espacio de verdad (lo que baja el usuario)

El peso real no está en los archivos muertos (que ni se empaquetan), sino en los trozos del build:

| Trozo | Peso | Cuándo se descarga |
|---|---|---|
| `Lightformer-*.js` (drei + three) | **940 KB** | Al montar cualquier escena 3D: el portón lo carga siempre que el equipo tenga WebGL |
| `index-*.js` (aplicación) | 399 KB | Siempre |
| `vendor-react-*.js` | 188 KB | Siempre |
| `Effects3D-*.js` | 79 KB | Solo gama media/alta con escena |
| `CreatePost-*.js` | 50 KB | Al abrir el compositor |
| `vendor-http`, `vendor-socket`, `vendor-router` | 47 + 41 + 37 KB | Según uso |

Total de `dist`: 2.6 MB en 71 trozos. **El trozo de 940 KB es el único gasto grande de verdad**, y
se explica por el estudio de luz: `StudioLighting.jsx` importa `Environment` y `Lightformer` de
`@react-three/drei`, y esa sola importación arrastra toda la librería drei más three. Si algún día
se quiere bajar, el camino es dibujar el estudio con lo mínimo (un cubo de luz propio) en lugar de
drei; no lo toco ahora porque está en pie y funcionando.

## 7. Lo que parece sin uso y **sí se usa** (no borrar)

| Qué | Por qué aparece como «sin uso» | Realidad |
|---|---|---|
| `server/src/migrations/*` (8 archivos) | No lo importa `server.js` | Corre aparte: `npm run db:migrate` → `scripts/db/migrate.js` → `runner.js` |
| `server/src/db/criticalQueries.js`, `indexPlan.js`, `integrity.js`, `registry.js`, `schemaReport.js` (5) | No los importa `server.js` | Los usan las herramientas `npm run db:*` (índices, integridad, esquema, banco de pruebas) y las pruebas de contrato del servidor |
| `client/src/lib/utils.js` | El primer barrido no vio que se importa con el alias `@/` | Lo usan los componentes de `components/ui/` |
| `client/src/design-preview/wordmark/*` | Está fuera del menú | `App.jsx` lo monta en la dirección `/design-preview/wordmark` |
| `client/public/*` (manifest, icono, fuentes) | No se importa desde JavaScript | Los referencian `index.html` y `wordmark.css` |

## 8. Resumen y propuesta

| Grupo | Cuánto | Riesgo de borrarlo |
|---|---|---|
| Dos archivos que nadie importa | 5.4 KB | Ninguno |
| Geometrías viejas del preview (solo pruebas) | 6.2 KB | Bajo, con sus dos pruebas |
| Kit `components/ui/` sin adoptar (6 componentes) | 7.5 KB | Medio: es decidir si se adopta o se retira |
| Exportaciones sin uso | 33 nombres | Medio: revisar una por una (pueden ser API prevista) |
| Clases de estilo muertas | 273 (eliminadas al fusionar) | Resuelto: la hoja única no las tiene |
| Dependencias no usadas | 3 | Bajo |

Orden propuesto, para que cada paso se pueda verificar solo:

1. **Borrar lo que nadie importa** (`DesignPreview.jsx`, `NanoScene.jsx`) y sus dos geometrías si se
   retiran sus pruebas. Es gratis y no toca nada visible.
2. **Decidir el kit de interfaz**: se adopta o se retira. No conviene dejarlo a medias.
3. ~~**Limpiar las 86 clases muertas**~~ — **hecho**: las 30 hojas se fusionaron en
   `kronos.css` y las reglas sin consumidor se eliminaron en la fusión.
4. **Quitar las tres dependencias** que nadie usa y volver a construir para confirmar.
5. **Dejar las exportaciones sin uso como están por ahora** y revisarlas de una en una: ahí puede
   haber API que quieras conservar para lo que viene.

Cada paso se ejecuta con la suite completa en verde antes de subir.

# KRONOS — Limpieza: eliminación de código no funcional y optimización

**Fecha:** 2026-09-21 · **Regla:** solo se eliminó código verificado como muerto, duplicado o colgante. Cada lote se validó con la suite completa (server 186 pruebas, client 146+20, lint, build) antes de continuar. **Nada funcional se tocó.**

## Qué se eliminó

### Código muerto (cero referencias en todo el proyecto)

| Archivo | Qué era | Verificación |
|---|---|---|
| `client/src/components/ui/WetChromeSign.jsx` | Letrero cromado de la marca | 0 imports en app y tests; el favicon es SVG inline propio |
| `client/src/components/ui/KronosClockLogo.jsx` | Logo de reloj orbital | 0 imports en todo `client/` |
| `client/src/components/ui/badge.jsx` | Badge shadcn | Solo lo usaba su propio test; ninguna pantalla |
| `client/src/components/ui/card.jsx` | Card shadcn | Ídem |
| `client/src/features/ai/KronosChat.jsx` | Página de chat de Kairos (151 líneas) | **Integración colgante**: sin ruta ni import; el chat vive vía `sendKairosMessage` en el compositor |
| `client/src/features/social/hooks/usePostActions.js` | Hook sin consumidor (122 líneas) | 0 referencias |
| `IMG-20260917-WA0001.jpg` | Imagen suelta en la raíz (357 KB) | 0 referencias en repo |

### Rutas duplicadas → redirects (8 montajes de menos)

`/feed` y `/social` montaban otra vez `SocialPage`; `/search` montaba otra vez `UserSearch`; `/ai`, `/ai/image`, `/ai/script`, `/ai/video` montaban de nuevo los 4 generadores de Kairos. Ahora **redirigen** (`<Navigate replace>`) a `/home`, `/explore` y `/kairos/*`: los bookmarks y links viejos siguen funcionando, pero no hay versiones duales. `VideoJobs` pasó a su ruta real `/kairos/video/jobs` (los 2 links internos migrados).

### CSS muerto (−1,173 líneas netas)

Parser de bloques con verificación de uso: una regla solo se elimina si **todas** sus clases están ausentes del código fuente (con lista blanca para clases dinámicas `is-*` y `k-badge-${status}`).

- `styles.css`: 3157 → ~2100 líneas (versiones de diseño previas: `ai-*`, `app-nav`, `btn-primary`, `image-*`, topbar viejo…)
- `design-system.css`: −175 (topbar y estados de la navegación anterior)
- `chrome-minimal.css`: −91, `fan-nav.css`: −13
- **Verificación de regresión:** el conjunto de clases eliminadas se cotejó contra el HEAD — 0 clases vivas eliminadas.

### Dependencias e instalación

- `prop-types` eliminada (0 usos) → lock actualizado (−3 paquetes).
- CI (`ci.yml`): `npm install` → `npm ci` (determinista, más rápido con el cache ya presente).
- **Se conservó** la pila 3D (`three`, `fiber`, `drei`): es funcional (fondos de Auth y Kairos, lazy-loaded, con 14 pruebas) — no es código muerto.

## Resultado medido

| Métrica | Antes | Después |
|---|---|---|
| Build del cliente | ~15–16 s | **11.5 s** |
| Líneas CSS | 10,146 | ~8,950 |
| Archivos fuente cliente | 113 | 106 |
| Montajes de ruta duplicados | 8 | 0 (redirects) |
| Dependencias cliente | 22 | 21 |

El bundle inicial (~1 MB min) no cambia con esta limpieza: su peso es de librerías funcionales (React, router, query, motion, socket, formularios). Reducirlo exige code-splitting de rutas con `React.lazy`, que es refactorización funcional, no limpieza — queda anotado como candidato en `PLAN-TRABAJO-RESTANTE.md`.

## Verificación de que nada funcional se rompió

- Servidor: 186 pruebas, 116 ok, 0 fallos (70 E2E solo en CI, como siempre).
- Cliente: vitest 28 archivos / 146 pruebas · `node --test` 20/20.
- ESLint limpio · `vite build` correcto.
- Server: análisis de alcanzabilidad — los 77 archivos de `server/src` se requieren desde `server.js` (0 huérfanos).
- Scripts de raíz (`verify-deploy.sh`, `auth-smoke-test.sh`, etc.): todos usados por workflows — se quedan.

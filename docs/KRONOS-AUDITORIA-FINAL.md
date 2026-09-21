# KRONOS — Auditoría final del repositorio (post-limpieza)

**Fecha:** 2026-09-21 · **Estado auditado:** commit `06ec571` + segundo pase de CSS. Validación completa re-ejecutada sobre el estado final.

## 1. Alcanzabilidad de código (cero huérfanos)

| Análisis | Resultado |
|---|---|
| Server: archivos `.js` alcanzables desde `server.js` por grafo de `require` | **77 / 77** — cero huérfanos |
| Client: archivos alcanzables desde `main.jsx` por grafo de imports (incl. `@/` y dinámicos) | **111 / 111** — cero huérfanos |

## 2. CSS muerto — segundo pase (nivel selector)

El primer pase eliminó bloques 100% muertos (−1,173 líneas, commit `06ec571`). Esta auditoría encontró ~100 clases muertas más viviendo en bloques mixtos (`.vivo, .muerto { }`). Se ejecutó un segundo pase quirúrgico que elimina solo el selector muerto del grupo:

- Verificación previa de clases dinámicas: se extrajeron TODOS los `className={\`...\${...}\`}` reales y su lista blanca de prefijos (`k-toast-`, `k-presence-dot`, `k-capsule-state`, `is-`, `k-badge-`, …). **Hallazgo del audit: `k-toast-${tone}` era dinámica y no estaba en la lista blanca original — corregido antes de tocar nada.**
- Resultado: `styles.css` −77 líneas netas (26 clases muertas fuera de grupos mixtos), `design-system.css` −2. Archivos cuyo re-ensamblado engordaba el formato (`aqua-theme`, `chrome-minimal`, `social-refresh`) se revirtieron: sus clases muertas restantes viven en bloques compartidos y su eliminación no compensa el riesgo de reformato.
- Verificación de regresión: el conjunto de clases eliminadas se cotejó contra el código fuente y la lista blanca — **0 clases vivas eliminadas**.

## 3. Rutas

- Cero montajes duplicados: cada pantalla se monta una vez; los alias (`/feed`, `/social`, `/search`, `/ai/*`) son redirects `<Navigate replace>`.
- Nota menor: `/explore` y `/users` montan el mismo componente `UserSearch` (dos entradas válidas a la misma búsqueda). Se unifica de forma natural con la búsqueda única del Bloque A de `PLAN-TRABAJO-RESTANTE.md`.

## 4. Dependencias

- Cliente: las 21 dependencias tienen uso verificado (incluida la pila 3D, que es funcional: fondos de Auth y Kairos con lazy-load y 14 pruebas).
- Server: las 14 dependencias tienen uso verificado.
- CI: `npm ci` con cache de npm.

## 5. Validación final re-ejecutada

| Prueba | Resultado |
|---|---|
| Server (`node --test`) | 186 pruebas · 116 ok · 0 fallos · 70 E2E solo en CI |
| Client (vitest) | 28 archivos · 146 pruebas · 146 ok |
| Client (`node --test`) | 20/20 |
| ESLint | limpio |
| Build Vite | ✓ 12.7 s (antes de la limpieza: 15–16 s) |
| Bundle | `index.js` 1012 KB · `Canvas3D` 948 KB (lazy, no bloquea la carga inicial) |

## 6. Residuos conocidos y aceptados (documentados, no errores)

1. ~90 clases CSS muertas en bloques compartidos de `aqua-theme`/`chrome-minimal`/`social-refresh` — se eliminan cuando esos archivos se reescriban con los Bloques B/C.
2. `styles.css` (2,100 líneas) sigue siendo el archivo más grande: su división por feature es parte del Bloque B.
3. Code-splitting de rutas (`React.lazy` por página) para reducir el bundle inicial: refactor funcional, candidato anotado en el plan.
4. `IMG-20260917-WA0001.jpg` fue la única artefacto binario sin uso — eliminado. No hay más binarios huérfanos en el repo.

**Veredicto: el repositorio queda sin código muerto eliminable con seguridad, sin huérfanos, sin rutas duplicadas y sin dependencias sin uso. Todo lo restante está inventariado con su razón.**

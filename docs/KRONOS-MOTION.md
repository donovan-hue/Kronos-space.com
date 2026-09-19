# KRONOS × Motion — Navegación fluida premium (Fase 4)

**Fecha:** 2026-09-19
**Rama:** `arena/01a0baf9-kronos-space-com`
**Alcance:** client/ únicamente. Lógica funcional intacta.

## 1. Auditoría de animaciones existentes

| Animación | Implementación | Decisión |
| --- | --- | --- |
| FanNav (abanico con stagger orbital) | CSS puro con `cubic-bezier(0.2, 1.35, 0.4, 1)` y delay por orbe | **Conservada tal cual** — ya es premium y fluida |
| Modales (Dialog Radix) | Keyframes CSS k-zoom/k-fade (fase UI kit) | **Conservados** |
| Botones/inputs (hover, focus ring, active) | CSS transitions | **Conservados** |
| Logo reloj, barrido cromado, letrero WetChrome | Keyframes CSS de marca | **Conservados** |
| Skeletons (k-pulse) | CSS | **Conservado** |
| **Transiciones de pantalla** | **No existían** — las vistas aparecían de golpe | **Motion** |
| **Toasts** | **Sin animación** (aparecían/desaparecían en seco) | **Motion** |
| **Microinteracciones like/guardar** | **Ninguna** | **Motion** |
| **Menú "⋯" de publicaciones** | `<details>` sin animación de entrada | CSS puro (ver §3) |
| `prefers-reduced-motion` | 4 media queries CSS legadas | ✓ ya existía; Motion se suma vía `MotionConfig` |

**Hallazgo clave:** `framer-motion@12` figuraba en package.json **sin importarse
ni una vez** (dependencia muerta). Se eliminó y se instaló `motion@13`
(nombre canónico actual, misma API `motion/react`) — no hay duplicación.

## 2. Qué se animó con Motion (y qué no)

Criterio: fluidez perceptible, costo mínimo, cero teatralidad.

| Elemento | Animación | Detalles de rendimiento |
| --- | --- | --- |
| **Transición de pantalla** (`AppLayout`) | Salida fade 0.12s → entrada fade+sube 10px 0.18s (`AnimatePresence mode="wait"`) | UN contenedor por navegación, solo `opacity/transform`; `initial={false}` evita animar el primer render |
| **Toasts** (`ToastProvider`) | Entrada y:16→0 + fade; salida inversa; `layout` reordena al cerrar uno | Máx. 4 avisos; solo transform/opacity |
| **Like / Guardar** (`PostActions`) | `whileTap` (gesto de presión, scale 0.94) + "pop" cromado del rótulo SOLO al cambiar de estado (spring 480/20) | El pop no se repite cuando llega la respuesta del servidor con el mismo estado |
| Menú "⋯" (`PostMoreMenu`) | Entrada CSS `k-menu-in` (0.16s, ligada a `[open]`) | CSS puro: Motion no re-dispara en un elemento ya montado dentro de `<details>` |
| Feed/listas, skeletons, FanNav, modales | — | **Sin stagger de listas** (regla de rendimiento): animar N tarjetas a la vez no aporta y cuesta |

## 3. Accesibilidad y respeto al sistema

- `MotionConfig reducedMotion="user"` (en `src/app/MotionProvider.jsx`, envolviendo
  la app): con `prefers-reduced-motion` las transformaciones se omiten y solo
  queda el desvanecido de opacidad.
- El CSS nuevo (menú) tiene su propia media query `prefers-reduced-motion: reduce`.
- `aria-live`/`role` de los toasts y roles de botones intactos (verificado por specs).

## 4. Costo real medido

| Bundle | Sin Motion | Con Motion | Δ |
| --- | --- | --- | --- |
| minificado | 762.66 kB | 893.42 kB | **+130.8 kB** |
| gzip | 233.89 kB | 277.15 kB | **+43.3 kB** |

Tree-shaking verificado (el bundle mínimo de `motion/react` con esbuild es
~128 kB min). Nota: el salto 525→762 kB previo a esta fase corresponde a las
dependencias de formularios (RHF+Zod) de la fase 3, no a Motion.

## 5. Validaciones (todas verdes)

| Validación | Resultado |
| --- | --- |
| `npm run lint` | ✓ |
| `npm run build` | ✓ |
| `npm run test:client` | ✓ 15 node + 69 vitest (65 previos + 4 nuevos `motion-integration.spec.jsx`) |
| `npm run test:server` | ✓ 47 pass / 0 fail |
| Smoke dev server | ✓ `motion/react` resuelto por Vite |

Tests nuevos: navegación real con Link a través de la transición de pantalla,
toast animado que desaparece del DOM (exit), microinteracciones conservando
roles/estados, y render con `prefers-reduced-motion` activo.

## 6. Guía rápida

```jsx
import { motion } from "motion/react";

// Microinteracción discreta
<motion.button whileTap={{ scale: 0.94 }}>…</motion.button>

// Presencia animada (salidas incluidas)
<AnimatePresence initial={false}>
  {items.map((item) => (
    <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
  ))}
</AnimatePresence>
```

Reglas: transiciones 0.12–0.2s; solo `opacity`/`transform`; nunca animar listas
completas; el estado de preferencia lo gestiona `MotionProvider` globalmente.

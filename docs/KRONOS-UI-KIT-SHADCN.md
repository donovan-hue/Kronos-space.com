# KRONOS UI KIT — Integración de shadcn/ui (Fase 1)

**Fecha:** 2026-09-19
**Rama:** `arena/01a0baf9-kronos-space-com`
**Alcance:** client/ únicamente. Sin cambios de backend, APIs ni servicios.

## 1. Auditoría previa (hallazgos)

| Aspecto | Estado antes de esta fase |
| --- | --- |
| Stack | React 19 + Vite 7 + Vitest (jsdom). `lucide-react` ya presente (iconos por defecto de shadcn). |
| Estilos | 6,346 líneas de CSS artesanal en 5 archivos; clases `k-*` + tokens `--k-*` (design-tokens.css = fuente de verdad). |
| Componentes | Solo 6 componentes bespoke (FanNav, ToastProvider, OfflineNotice, ImageEditor, 2 logos). Cero primitivas reutilizables. |
| Demanda real | 141 `<button>` crudos, 103 usos de `k-button`, 36 `<input>`, 17 `<textarea>`, 9 `<select>`, 3 modales con accesibilidad manual. |

## 2. Decisiones de integración

1. **Arquitectura shadcn/ui con Tailwind v4**, sin CLI: `ui.shadcn.com` no es
   alcanzable desde el sandbox, pero shadcn/ui es arquitectura de "componentes
   propios en el repo". Se instalaron las dependencias reales desde npm y se
   escribieron los componentes adaptados a KRONOS. `components.json` quedó
   configurado para que `shadcn add` funcione cuando haya red.
2. **Preflight de Tailwind DESACTIVADO** (`theme.css` + `utilities.css` sin
   `preflight`): el sistema legado ya trae su propio reset global. Activarlo
   alteraría headings y bordes de las pantallas existentes.
3. **Convivencia garantizada por capas CSS**: Tailwind emite en `@layer`; el
   CSS legado no usa capas y por tanto **gana cualquier conflicto de cascada**.
   Las pantallas actuales no cambian (verificado por specs existentes).
4. **Tokens KRONOS como única fuente de verdad**: las variables semánticas
   shadcn (`--background`, `--primary`, `--border`…) se mapean a `--k-*`.
   Paleta 100% monocromática (negro #000, plata/cromo, glassmorphism).
   Imposible introducir verde, cobre o rosa (ORDEN 00 preservada).
5. **Sin duplicar librerías**: no se añadió sonner (ToastProvider existe y
   funciona), no se añadió tw-animate-css (4 keyframes propios), lucide
   ya estaba. Radix solo donde aporta: `react-dialog` y `react-slot`.

## 3. Dependencias añadidas (client)

| Paquete | Tipo | Justificación |
| --- | --- | --- |
| `tailwindcss` + `@tailwindcss/vite` | dev | Fundación del sistema shadcn. |
| `clsx` + `tailwind-merge` | prod | `cn()` — composición de clases estándar shadcn. |
| `class-variance-authority` | prod | Variantes de componentes (Button/Badge). |
| `@radix-ui/react-dialog` | prod | Accesibilidad probada de diálogos (foco, Escape, scroll lock). |
| `@radix-ui/react-slot` | prod | `Button asChild` (Links con estilo de botón). |

## 4. Kit UI (`client/src/components/ui/`)

| Componente | Paridad KRONOS | Uso medido |
| --- | --- | --- |
| `button.jsx` | `.k-button` + variantes primary/secondary/ghost/danger (peligro = plata) | 141 botones |
| `input.jsx` | `.k-text-input` (chrome-minimal) | 36 inputs |
| `textarea.jsx` | mismo material cromado | 17 textareas |
| `label.jsx` | `.k-field-label` | formularios |
| `card.jsx` | `.k-surface` (negro, filo cromado, radio 18px) | 40 superficies |
| `badge.jsx` | estados en píldora, success/destructive plata | 45 `k-state` |
| `skeleton.jsx` | `.k-skeleton` (pulso k-pulse) | 31 usos |
| `avatar.jsx` | `.k-avatar` (sm/md/lg, filo cromado, glow) | perfiles |
| `dialog.jsx` | `.k-modal` + backdrop glass (blur 14px, rgba(0,0,0,.75)) | 3 modales |

Soporte: `src/lib/utils.js` (`cn`), `src/styles/tailwind.css` (tema + materiales
`bg-k-*`, `chrome-text`, `shadow-k-*`, `glass-k`), alias `@/` en
`vite.config.js`, `vitest.config.js` y `jsconfig.json`.

## 5. Aplicación progresiva (pantallas migradas)

1. **ReportDialog** — reemplaza focus-trap/Escape/backdrop manuales por Radix
   Dialog; formularios con Label/Textarea/Button del kit.
2. **ProfileFollowDialog** — Dialog + Button + Avatar + Skeleton.
3. **UserSearch** — Input (búsqueda), Button (todas las acciones, incl. `asChild`
   para "Ver publicación") y Avatar.

Pendiente para fases siguientes (progresivo, no rompe nada): Settings,
ModerationCenter, Auth (panel cromado bespoke), selects nativos → Select,
adopción de Card/Badge en feeds.

## 6. Validaciones (todas verdes)

| Validación | Resultado |
| --- | --- |
| `npm run build` | ✓ (CSS 127.9 kB con Tailwind + legacy intacto) |
| `npm run lint` | ✓ sin warnings |
| `npm run test:client` | ✓ 15 node + 50 vitest (43 previos + 7 nuevos `ui-kit.spec.jsx`) |
| `npm run test:server` | ✓ 47 pass / 0 fail (44 skips preexistentes) |
| Smoke test dev server | ✓ Vite 7 arranca; utilidades KRONOS compiladas en dev y prod |

## 7. Guía rápida de adopción

```jsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

<Button variant="secondary" size="sm">Guardar</Button>
<Button asChild variant="ghost"><Link to="/post/1">Ver</Link></Button>
```

Regla: pantallas nuevas usan el kit; pantallas legadas migran por superficie
(botones → inputs → modales → tarjetas) sin mezclar `k-*` con utilidades en el
mismo nodo.

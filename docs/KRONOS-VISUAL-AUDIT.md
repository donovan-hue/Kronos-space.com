# KRONOS — AUDITORÍA VISUAL COMPLETA (ORDEN 01)

Fecha: 2026-09-18 · Rama: `arena/01a0b103-kronos-space-com` · Commits: `4b14f86` + sistema de tokens
Regla: auditoría sin modificar funcionalidad. Solo se documentó; los cambios de estilo se hicieron aparte (ORDEN 02).

## 1. Rutas y páginas (37)

Auth: `/login` `/register` `/forgot-password` `/reset-password`
Social: `/` `/home` `/feed` `/social` `/explore` `/search` `/create` `/create-post` `/post/:id` `/saved` `/users` `/profile` `/profile/:username` `/users/:id`
Kairos/IA: `/kairos` `/kairos/image` `/kairos/video` `/kairos/script` `/kairos/history` `/ai` `/ai/image` `/ai/script` `/ai/video` `/ai/video/jobs` `/library`
Mensajería: `/messages` `/messages/:userId`
Notificaciones: `/notifications`
Configuración: `/settings` `/settings/profile` `/settings/security`
Moderación: `/moderation`
Fallback: `*`

## 2. Layouts y estructura

- `AppLayout` — shell con TopBar + Navigation + contenido.
- `ProtectedRoute` — guarda de sesión (sin impacto visual).
- Navegación: `Navigation` (sidebar 232px), `TopBar` (72px), `MobileNavigation`, `FloatingNavigation`.

## 3. Componentes de UI (`client/src/components/ui/`)

| Componente | Estado |
|---|---|
| `WetChromeSign` | ✅ Marca: letrero kronos-space.com cromado HD, todas las capas recortadas a las letras |
| `KronosLogo3D` | ⏸️ PENDIENTE por decisión del usuario — no integrado, sin usos |
| `Avatar` / `Button` / `Card` / `IconButton` | Legacy — consumir tokens |
| `KronosButton` / `KronosCard` | Duplicados de Button/Card → unificar |

## 4. Inventario interactivo

- Botones en JSX: **116**
- Inputs/select/textarea: **43**
- Estados CSS: `:hover` 46 reglas · `:focus` 15 · `:active` parcial · `:disabled` disperso
- Loaders: 24 archivos con estados de carga (sin spinner unificado)
- Mensajes: error `k-auth-error-box` (rojo) y éxito `k-auth-success-box` (verde) — semánticos, correctos sobre negro

## 5. Hallazgos (ordenados por prioridad)

| # | Hallazgo | Impacto |
|---|---|---|
| A1 | Dos sistemas CSS convivían: `styles.css` (3762 líneas legacy, muchos valores duros) + `design-system.css` (tokens) | Inconsistencia visual |
| A2 | Duplicados: `Button`↔`KronosButton`, `Card`↔`KronosCard`, burbujas `.kronos-bubble` legacy | Mantenimiento |
| A3 | Acentos por-app heredados (plata/cobre/rosa según feature) contradicen la ORDEN 00 | Identidad |
| A4 | Focus no unificado (varios colores/anchos); falta `:focus-visible` global | Accesibilidad |
| A5 | Loaders con textos "..." y sin indicador visual común | UX |
| A6 | `:disabled` sin token (opacidades distintas por componente) | Consistencia |
| A7 | Responsive: 14 `@media` dispersos; sin escala de breakpoints documentada | Mobile |

## 6. Cumplimiento ORDEN 00 por superficie

| Superficie | Negro absoluto | Cromo espejo | Estado |
|---|---|---|---|
| Auth (login/registro/recuperación) | ✅ `#000000` | ✅ Letrero HD + botones cromo | LISTO |
| App shell (topbar/nav) | ✅ topbar sólido sin blur | ✅ Bordes/estados plata | LISTO |
| Posts/tarjetas | ✅ `#000000` + borde cromo | ✅ | LISTO |
| Formularios/inputs | ✅ | ✅ focus cromado | LISTO |
| Features IA (Kairos/script/video) | ⚠️ Fondos oscuros legacy | ❌ Acentos cobre/rosa heredados | PENDIENTE |
| Mensajes/Notificaciones | ⚠️ Legacy | ⚠️ Legacy | PENDIENTE |
| Settings/Moderación | ⚠️ Legacy | ⚠️ Legacy | PENDIENTE |

## 7. Plan de migración (con ORDEN 02 activa)

1. ✅ Tokens globales únicos con todas las categorías (ORDEN 02).
2. Migrar features IA/Mensajes/Settings/Moderación a tokens (fondo `--k-bg`, bordes `--k-border`, acentos `--k-blue*` cromados).
3. Unificar duplicados (`KronosButton`→`Button`, `KronosCard`→`Card`).
4. Spinner único de carga + estados disabled/focus con tokens.
5. Logo infinito: pendiente de decisión del usuario.

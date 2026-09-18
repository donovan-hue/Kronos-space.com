# KRONOS — SISTEMA DE DISEÑO GLOBAL (ORDEN 02)

Identidad (ORDEN 00): **negro absoluto profundo + cromado espejo premium**.
Sensación objetivo: sistema tecnológico premium, iluminación de producto, no plantilla web.

## Regla de oro

> Ningún componente inventa su propio sistema visual.
> Todo consume tokens de `client/src/styles/design-tokens.css`.
> Si falta un token, se agrega ahí — nunca un valor duro en el componente.

## Fuente única de verdad

| Archivo | Rol |
|---|---|
| `client/src/styles/design-tokens.css` | Tokens: color, materiales, tipografía, espaciado, bordes, radios, sombras, reflejos, transiciones, z-index, dimensiones, estados |
| `client/src/styles/design-system.css` | Componentes base (topbar, nav, superficies) — solo consume tokens |
| `client/src/styles.css` | Pantallas y componentes de feature + sistema del letrero y estados semánticos |

## Materiales cromados (gradientes)

```css
--k-material-chrome        /* cara frontal: horizonte de reflexión */
--k-material-chrome-line   /* barras y bordes gruesos horizontales */
--k-material-chrome-btn    /* botones: cromo vertical con horizonte */
--k-reflect-horizon        /* reflejo húmedo suave */
```

Color interactivo = cromo espejo (`--k-blue: #dfe5eb` → hover `#ffffff`).
Los únicos colores permitidos fuera del cromo son **semánticos** (éxito `#34d399`, error `#f87171`, aviso `#fbbf24`) y solo en mensajes de estado.

## Superficies

Todo fondo es negro absoluto: `--k-bg: #000000`, `--k-surface: #000000`.
Sin texturas, sin ruido, sin blur translúcido: lo de enfante resalta, el fondo nunca refleja.
Elevaciones discretas: `--k-surface-2: #060608`, `--k-surface-3: #0b0b0e`.

## Estados interactivos (idénticos en toda la app)

- **hover** — fondo `--k-state-hover-bg`, borde `--k-state-hover-border`, elevación `translateY(-1px)`.
- **active** — hundido: `translateY(1px) scale(0.98)`.
- **focus** — anillo cromado `--k-state-focus-ring` (sin color).
- **disabled** — `opacity: 0.45` + `cursor: not-allowed`.
- Duraciones: rápido `0.12s` · base `0.2s` · lento `0.32s`; curvas `--k-ease-out`, `--k-ease-bounce`, `--k-ease-smooth`.

## Z-index (escala fija)

`base 0 · raised 10 · sticky 20 · nav 30 · overlay 40 · modal 50 · toast 60`

## Dimensiones

Topbar `72px` · Sidebar `232px` · Contenido máx `640px` · Objetivo táctil `44px`.
Breakpoints de referencia: `sm 640 · md 768 · lg 1024 · xl 1280`.

## Componentes de marca

- **Letrero** `WetChromeSign` — kronos-space.com en cromo espejo HD 3D con lluvia leve (todas las capas recortadas a las letras; tamaños `hero` y `sm`).
- **Logo** `KronosLogo3D` (dos infinitos cromados contrarrotantes) — **PENDIENTE de decisión del usuario**; sin integrar.

## Accesibilidad

- Contraste: texto claro `#f1f5f9` sobre `#000000` (>18:1).
- `prefers-reduced-motion` desactiva barridos, gotas y torsiones.
- Focus siempre visible; objetivo táctil mínimo 44px.

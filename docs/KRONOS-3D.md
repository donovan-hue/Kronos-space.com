# KRONOS-3D — Capa 3D con React Three Fiber

**Fase 5 del plan de modernización del cliente.** Infraestructura 3D profesional,
modular y optimizada, preparada para experiencias visuales avanzadas sin afectar
las funciones sociales. Fecha: 2026-09-19.

---

## 1. Auditoría previa (condición de la integración)

| Aspecto | Hallazgo | Consecuencia |
|---|---|---|
| React | 19.2.8 (lockfile) | `@react-three/fiber` **v9** es la línea correcta (peers `react >=19 <19.3`); v8 es para React 18 |
| Vite | 7.3.6 | ESM de three sin configuración; code-splitting automático de `import()` |
| SSR | No existe (SPA) | Sin riesgo de hidratación con canvas |
| Uso 3D previo | **Cero** (`three`/WebGL no aparecían en src) | Integración limpia, sin duplicar nada |
| Bundle | Un único chunk de 893.42 KB min / 277.15 KB gzip | Importar three estáticamente sería inaceptable: **+~600 KB al arranque de toda la app** → obligatorio chunk diferido |
| Tests | Vitest + jsdom | jsdom no tiene WebGL ni `matchMedia`/`IntersectionObserver` → la capa debe poder mockearse y degradarse sin error |
| Puntos aptos | `/login`+`/register` (fuera de AppLayout, pantalla completa) y hero de `/kairos` (ya tiene `position:relative; overflow:hidden` con hijos a z-index 1) | Superficies aisladas donde el 3D aporta sin riesgo |
| Puntos NO aptos | Feed, mensajes, formularios, navegación | La UI funcional sigue siendo HTML/React (regla 9) |

**Veredicto:** integración aprobada **solo** con carga diferida, fallback CSS y
montaje selectivo. Es exactamente lo implementado.

## 2. Decisiones

**Qué se integró:**

- `three@0.186.0` + `@react-three/fiber@9.7.0` — núcleo, exclusivamente tras
  `React.lazy`.
- `@react-three/drei@10.7.8` — **solo** por dos funciones concretas:
  - `Environment` + `Lightformer`: iluminación de estudio renderizada **en
    memoria** (256px, `frames={1}`). El cromo necesita algo que reflejar; así se
    evita descargar HDRIs externos (red + megas).
  - `PerformanceMonitor`: degradación progresiva del DPR si los FPS caen.
- `@react-three/postprocessing@3.1.1` (+ `postprocessing@6.39`) — **solo** por
  `Bloom` con `mipmapBlur` (la variante más barata en GPU): el resplandor de los
  reflejos de cromo sobre negro puro. En un **chunk propio** que solo descargan
  los dispositivos tier medio/alto; los móviles jamás lo piden.

**Qué NO se hizo (y por qué):**

- No se convirtió ninguna UI funcional a 3D.
- No se tocó el feed social ni la mensajería.
- No se reemplazó el logo-reloj CSS del landing (funciona y es identidad).
- Sin `Float`/`Sparkles`/etc. de drei: lo que aportan aquí se hace a mano con
  `useFrame` (menos chunk).
- El orbe de Kairos no lleva postprocessing: en lienzo pequeño, render limpio.

**Nota de instalación:** npm intentaba resolver los peers *opcionales* de fiber
(`expo-gl` → `react-native-reanimated`) incompatibles con un cliente web. Se
añadió `.npmrc` raíz con `legacy-peer-deps=true` y quedó documentado; **cero**
paquetes React Native instalados. Consecuencia manejada: RTL 16 declara
`@testing-library/dom` como peer, así que pasó a ser devDependency explícita
del cliente (con legacy-peer-deps los peers no se autoinstalan). Verificado
con `npm ci` desde cero: lint, 83/83 cliente, 47/0 servidor y build idéntico.

## 3. Arquitectura

```
client/src/three/
├── index.js              ← API pública (única puerta de la app)
├── capabilities.js       ← detección WebGL + tier de dispositivo (sin three)
├── SceneBackground.jsx   ← frontera: fallback CSS + lazy + error boundary
│                             + prefers-reduced-motion + pausa por visibilidad
├── Canvas3D.jsx          ← [CHUNK A diferido] Canvas real + registro de escenas
├── Effects3D.jsx         ← [CHUNK B diferido] Bloom (solo tier medio/alto)
└── scenes/
    ├── StudioLighting.jsx     ← Lightformers compartidos (estudio en memoria)
    ├── ChromeField.jsx        ← partículas cromadas (1 InstancedMesh = 1 draw call)
    ├── KronosGyroscope.jsx    ← escena "auth": giroscopio de anillos cromados
    └── KairosOrb.jsx          ← escena "kairos-orb": orbe con anillo y satélite
```

**Flujo de decisiones al montar `SceneBackground`:**

1. `supportsWebGL()` (webgl2 → webgl → experimental-webgl, con try/catch).
   Sin WebGL → solo fallback CSS. El chunk 3D **ni se pide**.
2. `getGraphicsTier()` → `low` (móvil/puntero grueso o ≤2 núcleos) |
   `medium` (escritorio base) | `high` (≥8 núcleos y ≥8 GB). Dimensiona DPR
   (1.25/1.75/2), partículas (80/160/260) y si se carga el chunk de Bloom.
3. Fallback CSS **siempre montado** debajo: es lo que se ve sin WebGL, mientras
   viaja el chunk y si la escena se descarta.
4. `React.lazy(Canvas3D)` → three/fiber/drei/escenas en chunk separado.
5. Render con guarda: `frameloop = "always"` | `"demand"` (un solo frame) si
   `prefers-reduced-motion` o si el contenedor sale del viewport
   (IntersectionObserver) → **0 GPU cuando no se ve**; la pestaña en segundo
   plano ya la para el propio rAF del navegador.
6. Redes de seguridad: `SceneErrorBoundary` (fallo de render) y listener de
   `webglcontextlost` (contexto revocado) → la escena se descarta en silencio
   y queda el fallback. La app jamás se entera.

**Inercia garantizada:** `.k-scene` lleva `pointer-events: none` + `aria-hidden`
+ `overflow: hidden`. El parallax de cámara escucha `mousemove` en `window`
(pasivo), no en el canvas: la escena nunca roba interacción.

## 4. Escenas

### `auth` — KronosGyroscope (fondo de /login y /register)

Tres anillos cromados concéntricos girando en ejes propios a velocidades lentas
distintas, núcleo de acero satinado y polvo de cromo orbitando en cáscara
aplanada con niebla negra para profundidad. Cámara con deriva lenta + parallax
de puntero (solo escritorio). La composición **enmarca** el contenido HTML (los
anillos pasan por detrás del titular) y la viñeta CSS
(`.k-scene--auth::after`) garantiza el contraste del texto vaya donde vaya la
luz. Postprocessing: Bloom (tier medio/alto). El canvas aparece con un
desvanecido de 0.9 s sobre el fallback.

### `kairos-orb` — KairosOrb (hero de /kairos)

Esfera de cromo espejo con anillo fino inclinado y un satélite orbitándolo,
desplazada a la derecha del titular y recortada por el propio hero. Polvo de
cromo más escaso (¹⁄₃ del auth). Sin postprocessing. Sin deriva de cámara.

## 5. Presupuesto de rendimiento (medido)

| Chunk | Peso | Cuándo viaja |
|---|---|---|
| `index.js` (app principal) | 897.10 KB min / **278.70 KB gzip** (+1.55 KB gzip por la fase) | Siempre |
| `Canvas3D-*.js` (three+fiber+drei+escenas) | 970.00 KB min / **265.47 KB gzip** | Solo al montar escena con WebGL |
| `Effects3D-*.js` (Bloom) | 81.16 KB min / **22.63 KB gzip** | Solo tier medio/alto en escena `auth` |
| CSS total | 129.54 KB (+0.86 KB) | Siempre |

La app social paga ~1.5 KB gzip por toda la infraestructura. Un visitante sin
WebGL (o con motion-reducido en móvil) no descarga ni un byte de three.

**Coste en runtime:** ~6 draw calls por escena (los tres anillos, núcleo, un
InstancedMesh para todas las partículas y el quad de postproceso), DPR
acotado por tier y degradación automática con `PerformanceMonitor`. Las
partículas se posicionan una vez al montar; por frame solo rota la matriz del
grupo — nunca cientos de elementos individuales (misma regla de rendimiento
que la fase Motion).

## 6. Móvil, accesibilidad y degradación

- **Móvil (tier low):** DPR ≤1.25, 80 partículas, sin antialias MSAA del
  canvas base, sin chunk de Bloom, sin parallax de puntero (no hay puntero).
- **`prefers-reduced-motion`:** escena congelada en pose fija (un solo frame
  renderizado, `frameloop="demand"`); el desvanecido de aparición lo neutraliza
  la media query global del sistema. El fallback CSS es estático por diseño.
- **Sin WebGL:** fallback plata/negro con tres gradientes radiales. Verificado
  por tests.
- **Contexto perdido / render que falla:** descarte silencioso + fallback.
- **Lectores de pantalla:** capa `aria-hidden`; el canvas no existe en el árbol
  accesible.

## 7. Cómo añadir una escena nueva

1. Crea `client/src/three/scenes/MiEscena.jsx` aceptando
   `{ tier, particles, reducedMotion }`.
2. Regístrala en `Canvas3D.jsx` (`SCENES`) con cámara y flag `postprocessing`.
3. Móntala donde toque: `<SceneBackground scene="mi-escena" className="k-scene--mi-clase" />`
   y añade el posicionamiento CSS de esa clase.
4. Nada más: el chunk, el fallback, la pausa y la degradación ya funcionan.

Candidatos futuros (documentados, no implementados): visor 3D de obras
generadas en Kairos, transición volumétrica entre hubs, fondo sutil de perfil.

## 8. Validaciones ejecutadas

- `npm run lint` (client) — ✓ sin hallazgos.
- Vitest cliente — **83/83** (69 previos + **14 nuevos** en
  `test-ui/three-layer.spec.jsx`: detección WebGL y caché, tiers low/medium/high,
  fallback sin WebGL, montaje diferido con props, reduced-motion, contención de
  errores, pérdida de contexto, integración Auth con y sin WebGL, integración
  AICenter).
- Tests de servidor — 47/0 (intactos).
- `vite build` — ✓ con los tres chunks anteriores y aviso esperado de tamaño
  (>500 KB) ya existente.
- Smoke de dev server — HTTP 200 en `/`, los 8 módulos de la capa y los
  pre-bundles de `@react-three/fiber`, `@react-three/drei`, `three` y
  `@react-three/postprocessing`.

> Nota para tests: React 19 **reintenta** el render tras un error, así que un
> `mockImplementationOnce` que lanza se "cura" solo. Para probar un error
> boundary hay que hacer que el mock falle de forma persistente (ver spec).

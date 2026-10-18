import reactHooks from "eslint-plugin-react-hooks";

/**
 * Las reglas se declaran explícitamente en lugar de heredar `recommended` de
 * `@eslint/js`: ese paquete no está instalado y añadirlo obligaría a mover el
 * lockfile. El conjunto es su núcleo de corrección, sin las reglas de estilo.
 *
 * Reparto error/aviso, igual que en el `eslint.config.js` de la raíz:
 *   error  lo que es un defecto o casi seguro lo produce.
 *   aviso  deuda probable, no defecto. `no-unused-vars` queda en aviso porque
 *          convive con dos cosas legítimas que no conviene bloquear: el
 *          modismo de desestructurar para omitir campos y las importaciones
 *          que las pruebas sí usan.
 *
 * Por qué importa: con solo `rules-of-hooks` y `no-restricted-imports`
 * activados, este lint no veía ninguno de los defectos que la auditoría
 * encontró en el cliente — una cache escrita en la clave equivocada por una
 * dependencia ausente, dos setters que nadie llamaba y dejaban una función
 * congelada, y una función completa que ningún botón invocaba.
 */

const GLOBALES_NAVEGADOR = {
  window: "readonly", document: "readonly", navigator: "readonly",
  console: "readonly", location: "readonly", history: "readonly",
  screen: "readonly", localStorage: "readonly", sessionStorage: "readonly",
  fetch: "readonly", URL: "readonly", URLSearchParams: "readonly",
  Blob: "readonly", File: "readonly", FileReader: "readonly",
  FormData: "readonly", Image: "readonly", Audio: "readonly",
  HTMLElement: "readonly", Element: "readonly", Node: "readonly",
  HTMLCanvasElement: "readonly", CanvasRenderingContext2D: "readonly",
  OffscreenCanvas: "readonly", MediaRecorder: "readonly",
  WebSocket: "readonly", Worker: "readonly",
  // WebRTC de las salas en vivo y capacidades del dispositivo.
  RTCPeerConnection: "readonly", RTCSessionDescription: "readonly",
  RTCIceCandidate: "readonly", MediaStream: "readonly",
  MediaStreamTrack: "readonly", devicePixelRatio: "readonly",
  innerWidth: "readonly", innerHeight: "readonly",
  outerWidth: "readonly", outerHeight: "readonly",
  Event: "readonly", CustomEvent: "readonly", KeyboardEvent: "readonly",
  MouseEvent: "readonly", PointerEvent: "readonly", TouchEvent: "readonly",
  InputEvent: "readonly", FocusEvent: "readonly", WheelEvent: "readonly",
  DragEvent: "readonly", Storage: "readonly",
  MutationObserver: "readonly", IntersectionObserver: "readonly",
  ResizeObserver: "readonly", PerformanceObserver: "readonly",
  requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly",
  matchMedia: "readonly", getComputedStyle: "readonly", getSelection: "readonly",
  visualViewport: "readonly", scrollTo: "readonly", scrollBy: "readonly",
  setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly",
  clearInterval: "readonly", queueMicrotask: "readonly",
  AbortController: "readonly", AbortSignal: "readonly",
  structuredClone: "readonly", crypto: "readonly", performance: "readonly",
  atob: "readonly", btoa: "readonly", alert: "readonly", confirm: "readonly",
  TextEncoder: "readonly", TextDecoder: "readonly", DOMParser: "readonly",
  globalThis: "readonly", process: "readonly", Buffer: "readonly",
  Promise: "readonly", Map: "readonly", Set: "readonly",
  WeakMap: "readonly", WeakSet: "readonly", Symbol: "readonly",
  Intl: "readonly", Number: "readonly", Object: "readonly", Array: "readonly",
  String: "readonly", JSON: "readonly", Math: "readonly", Date: "readonly",
  Error: "readonly", RegExp: "readonly", Boolean: "readonly",
  Function: "readonly", Uint8Array: "readonly", ArrayBuffer: "readonly",
  Float32Array: "readonly", AudioContext: "readonly",
  webkitAudioContext: "readonly", IS_REACT_ACT_ENVIRONMENT: "writable"
};

export default [
  {
    ignores: ["dist/**", "node_modules/**", "test-ui/**", "test/**"],
    linterOptions: { reportUnusedDisableDirectives: "off" }
  },
  {
    files: ["src/**/*.{js,jsx}", "config/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: GLOBALES_NAVEGADOR
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // Las dependencias ausentes no son estilo: `useFeed` escribía en la
      // cache de la órbita anterior porque `feedKey` no estaba en el array.
      // En aviso mientras se liquidan los nueve pendientes; se sube a error
      // cuando no quede ninguno.
      "react-hooks/exhaustive-deps": "warn",
      // Toda llamada HTTP pasa por services/apiClient.js y sus servicios de
      // dominio; impide reintroducir instancias/configuraciones divergentes.
      "no-restricted-imports": ["error", {
        paths: [{ name: "axios", message: "Usa los servicios de dominio basados en apiClient." }]
      }],

      // --- núcleo de corrección ---
      "no-dupe-args": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-cond-assign": ["error", "except-parens"],
      "no-fallthrough": "error",
      "no-redeclare": "error",
      "no-self-compare": "error",
      "no-sparse-arrays": "error",
      "no-unsafe-optional-chaining": "error",
      "no-loss-of-precision": "error",
      "no-compare-neg-zero": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "getter-return": "error",
      "no-async-promise-executor": "error",
      "no-undef": "error",
      // Un bloque vacío fue lo que dejó dos fallos de red del alta inicial sin
      // ningún aviso al usuario.
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
      "no-useless-escape": "warn",
      "no-prototype-builtins": "warn"
    }
  },
  {
    files: ["src/services/apiClient.js"],
    rules: { "no-restricted-imports": "off" }
  }
];

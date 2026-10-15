/**
 * ESLint del lado servidor: `server/`, `scripts/` y `guardian/`.
 *
 * Hasta ahora estos tres paquetes no tenían lint de ningún tipo. El CI los
 * cubría con 18 llamadas a `node --check` sobre archivos elegidos a mano, es
 * decir, 104 de los 121 archivos de `server/src` no se comprobaban ni por
 * sintaxis. Por ahí entraron un `require` a una carpeta inexistente silenciado
 * por un `catch {}` (el defecto C-04 de la auditoría) y cuatro imports sin
 * usar que tapaban comportamiento que faltaba.
 *
 * Las reglas se declaran explícitamente en lugar de heredar un preset: este
 * repositorio no tiene `@eslint/js` instalado y añadirlo obligaría a mover el
 * lockfile. El conjunto es el núcleo de corrección de `recommended`, sin las
 * reglas de estilo (las discute el propietario, no el lint).
 *
 * Reparto error/aviso:
 *   error  lo que es un defecto o casi seguro lo produce: claves duplicadas,
 *          código inalcanzable, `typeof` inválido, comparaciones con NaN,
 *          promesas que nunca se resuelven, `await` ausente en un sitio donde
 *          rompe, catch vacíos.
 *   aviso  lo que suele ser deuda y no defecto: variables sin usar (aquí hay
 *          un modismo legítimo —desestructurar para omitir campos— que no
 *          conviene bloquear) y `no-undef` (Node CommonJS resuelve globales
 *          que este archivo no enumera exhaustivamente).
 */

const REGLAS_CORRECCION = {
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
  "no-misleading-character-class": "error",
  "no-compare-neg-zero": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
  "getter-return": "error",
  "no-async-promise-executor": "error",
  // Un catch vacío fue exactamente lo que ocultó C-04 durante meses.
  "no-empty": ["error", { allowEmptyCatch: false }],
  "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
  "no-undef": "error",
  "no-useless-escape": "warn",
  "no-prototype-builtins": "warn"
};

const GLOBALES_NODE = {
  require: "readonly", module: "writable", exports: "writable",
  __dirname: "readonly", __filename: "readonly", process: "readonly",
  console: "readonly", Buffer: "readonly", URL: "readonly",
  URLSearchParams: "readonly", fetch: "readonly", TextEncoder: "readonly",
  TextDecoder: "readonly", AbortController: "readonly", globalThis: "readonly",
  queueMicrotask: "readonly", structuredClone: "readonly", performance: "readonly",
  setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly",
  clearInterval: "readonly", setImmediate: "readonly", clearImmediate: "readonly",
  crypto: "readonly", describe: "readonly", it: "readonly", before: "readonly",
  after: "readonly", beforeEach: "readonly", afterEach: "readonly", mock: "readonly",
  // Globales de la Web API que Node expone desde la 18 y que el servidor usa
  // de verdad (fetch a proveedores de IA, subidas multipart, abortos por
  // tiempo agotado). Sin ellos `no-undef` solo producía ruido y no se podía
  // subir a error.
  AbortSignal: "readonly", FormData: "readonly", Blob: "readonly",
  File: "readonly", Response: "readonly", Request: "readonly",
  Headers: "readonly", ReadableStream: "readonly", WritableStream: "readonly",
  TransformStream: "readonly", Uint8Array: "readonly", ArrayBuffer: "readonly",
  DOMException: "readonly", Event: "readonly", EventTarget: "readonly",
  MessageChannel: "readonly", BroadcastChannel: "readonly", WebSocket: "readonly"
};

export default [
  {
    // El cliente tiene su propio `client/eslint.config.js` con sus globales de
    // navegador y sus reglas de React. Lintarlo también desde aquí lo evaluaría
    // con el entorno equivocado.
    ignores: [
      "client/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "server/uploads/**",
      "docs/**"
    ]
  },
  {
    files: ["server/**/*.js", "scripts/**/*.js", "scripts/**/*.mjs", "guardian/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      // `scripts/` mezcla CommonJS y módulos ESM; los `.mjs` se corrigen abajo.
      sourceType: "commonjs",
      globals: GLOBALES_NODE
    },
    rules: REGLAS_CORRECCION
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { sourceType: "module" }
  }
];

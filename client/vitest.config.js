import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Alias "@" → src (mismo alias que vite.config.js, para los specs).
const srcPath = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": srcPath,
    },
  },
  test: {
    environment: "jsdom",
    include: ["test-ui/**/*.spec.{js,jsx}"],
    // Aislamiento de red: sin esto, cualquier pantalla que llame a un
    // servicio no simulado lanzaba peticiones XHR reales que jsdom no
    // puede servir, llenando la salida con `AggregateError` (ver el
    // comentario de test-ui/setup.js).
    setupFiles: ["./test-ui/setup.js"],
    clearMocks: true
  }
});

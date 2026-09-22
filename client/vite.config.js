import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Alias "@" → src (convención shadcn/ui).
const srcPath = fileURLToPath(new URL("./src", import.meta.url));

/**
 * A-1 — Content-Security-Policy de producción.
 * FUENTE ÚNICA del CSP en meta: debe coincidir con `client/vercel.json`
 * (salvo `frame-ancestors`, que los navegadores ignoran en <meta> y solo
 * aplica vía cabecera). Se inyecta SOLO en build: en dev rompería el HMR.
 * Lo verifica `client/test/csp-parity.test.mjs`.
 *
 * Decisiones:
 * - `script-src 'self' accounts.google.com`: sin inline scripts en prod;
 *   GSI carga su SDK por <script src> dinámico (Auth.jsx).
 * - `style-src 'unsafe-inline'`: motion/react inyectan <style>; no hay
 *   forma estricta sin nonces por build (pendiente si se endurece más).
 * - `img-src/media-src ... https:`: los posts admiten media externa.
 * - Sin `dangerouslySetInnerHTML` en todo src (auditoría A-1) ni iframes
 *   propios; los 2 enlaces _blank llevan rel="noreferrer".
 */
export const PRODUCTION_CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; " +
  "script-src 'self' https://accounts.google.com; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https:; " +
  "media-src 'self' blob: https:; " +
  "connect-src 'self' https://api.kronos-space.com wss://api.kronos-space.com https://accounts.google.com; " +
  "font-src 'self' data:; " +
  "frame-src https://accounts.google.com; " +
  "form-action 'self'";

function cspMetaPlugin() {
  return {
    name: "kronos-csp-meta",
    apply: "build",
    transformIndexHtml(html) {
      const meta =
        `    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />\n`;
      return html.replace("</head>", `${meta}  </head>`);
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspMetaPlugin()],
  resolve: {
    alias: {
      "@": srcPath,
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Vendors estables en chunks propios: el hash del bundle de la app
        // cambia en cada deploy, pero react/query/router se cachean aparte.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query", "axios", "socket.io-client"],
          "vendor-motion": ["motion"],
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-slot",
            "class-variance-authority",
            "clsx",
            "tailwind-merge",
            "lucide-react"
          ]
        }
      }
    }
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app"],
    port: 3000,
    proxy: {
      "/api": "http://localhost:5000",
      "/uploads": "http://localhost:5000",
      "/socket.io": {
        target: "http://localhost:5000",
        ws: true
      }
    }
  }
});

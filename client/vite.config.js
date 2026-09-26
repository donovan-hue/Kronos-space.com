import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Alias "@" → src (convención shadcn/ui).
const srcPath = fileURLToPath(new URL("./src", import.meta.url));

// The isolated design server opens the experiment, not the login screen.
// Normal dev/build/preview behavior remains unchanged.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "design-preview" ? [{
    name: "design-preview-entry",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] === "/") {
          response.writeHead(302, { Location: "/design-preview", "Cache-Control": "no-store" });
          response.end();
          return;
        }
        next();
      });
    }
  }] : [])],
  resolve: {
    alias: {
      "@": srcPath,
    },
  },
  // FASE 8 (frontend) — reparto de dependencias en trozos estables.
  //
  // Solo se agrupan las librerías que YA viajan en el arranque (React, el
  // router, la capa de consultas, el cliente HTTP y el socket): así un
  // cambio en el código de producto no invalida su caché.
  //
  // El resto se deja a Rollup a propósito. Un "vendor" cajón de sastre
  // arrastraba `three` y `zod` a la primera carga: bastaba con que un
  // módulo del arranque compartiera trozo con una dependencia del 3D para
  // que el navegador precargara 980 kB de motor gráfico en el login. Medido
  // y descartado; las dependencias exclusivas de rutas diferidas deben
  // quedarse en el trozo de su ruta.
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react-dom|react|scheduler)[\\/]/.test(id)) return "vendor-react";
          if (/[\\/]node_modules[\\/]react-router(-dom)?[\\/]/.test(id)) return "vendor-router";
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return "vendor-query";
          if (/[\\/]node_modules[\\/](socket\.io-client|engine\.io-client|engine\.io-parser|socket\.io-parser)[\\/]/.test(id)) return "vendor-socket";
          if (/[\\/]node_modules[\\/]axios[\\/]/.test(id)) return "vendor-http";
          return undefined;
        }
      }
    }
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 3000,
    proxy: {
      "/api": "http://localhost:5000",
      "/uploads": "http://localhost:5000",
      "/socket.io": {
        target: "http://localhost:5000",
        ws: true
      }
    }
  },
  // Mismo contrato para el artefacto de producción (`npm run preview`).
  // Sin este bloque, la vista previa escuchaba solo en localhost:4173 y
  // rechazaba los hosts del sandbox, así que no se podía comprobar el
  // build real —justo el que se despliega— antes de publicarlo.
  preview: {
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
}));

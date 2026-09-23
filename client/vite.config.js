import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Alias "@" → src (convención shadcn/ui).
const srcPath = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": srcPath,
    },
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
});

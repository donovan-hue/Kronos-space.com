/**
 * M-13 (cierre) — capturas reales para el manifest PWA.
 *
 * Los `screenshots` del manifest enriquecen el diálogo de instalación
 * (Chrome los muestra como vista previa de la app). Deben ser capturas
 * REALES de la interfaz, no composiciones: este script las genera.
 *
 * Requisitos (una sola vez, en tu máquina con navegador):
 *   cd client && npm i -D playwright && npx playwright install chromium
 *
 * Uso:
 *   1. Arranca el frontend:  npm run dev --workspace=client   (puerto 3000)
 *   2. Captura:               node client/scripts/capture-screenshots.mjs
 *      (o con otro origen:    node client/scripts/capture-screenshots.mjs https://kronos-space.com)
 *
 * Genera:
 *   client/public/screenshots/narrow.png  (540x720, móvil, pantalla de acceso)
 *   client/public/screenshots/wide.png    (1280x720, escritorio, pantalla de acceso)
 *
 * Después pega este bloque en `client/public/manifest.webmanifest`
 * (al mismo nivel que "icons"):
 *
 *   "screenshots": [
 *     {
 *       "src": "/screenshots/narrow.png",
 *       "sizes": "540x720",
 *       "type": "image/png",
 *       "form_factor": "narrow",
 *       "label": "Acceso a Kronos Space en móvil"
 *     },
 *     {
 *       "src": "/screenshots/wide.png",
 *       "sizes": "1280x720",
 *       "type": "image/png",
 *       "form_factor": "wide",
 *       "label": "Acceso a Kronos Space en escritorio"
 *     }
 *   ],
 *
 * Si quieres capturar una pantalla autenticada (/home), inicia sesión
 * manualmente con `headless: false` abajo y cambia las rutas antes de
 * capturar (o reutiliza el storageState de Playwright).
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = process.argv[2] || "http://localhost:3000";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "screenshots");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "Falta el paquete `playwright`.\n" +
    "Instálalo con: cd client && npm i -D playwright && npx playwright install chromium"
  );
  process.exit(2);
}

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();

try {
  // Móvil (narrow): iPhone-ish 540x720.
  const mobile = await browser.newPage({
    viewport: { width: 540, height: 720 },
    deviceScaleFactor: 2,
    isMobile: true
  });
  await mobile.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(800);
  await mobile.screenshot({ path: join(OUT_DIR, "narrow.png") });
  await mobile.close();
  console.log("OK", join(OUT_DIR, "narrow.png"));

  // Escritorio (wide): 1280x720.
  const desktop = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });
  await desktop.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await desktop.waitForTimeout(800);
  await desktop.screenshot({ path: join(OUT_DIR, "wide.png") });
  await desktop.close();
  console.log("OK", join(OUT_DIR, "wide.png"));
} finally {
  await browser.close();
}

console.log(
  "\nPega el bloque \"screenshots\" en client/public/manifest.webmanifest " +
  "(ver la cabecera de este script)."
);

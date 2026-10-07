import { defineConfig } from '@playwright/test';

/**
 * Suite de navegador (local/verificación del propietario; CI no la ejecuta).
 *
 * Dos superficies distintas:
 *  - `app`            → la app normal (`npm run dev`, :3000).
 *  - `design-preview` → el modo Vite `design-preview` (`npm run dev:design`, :3002),
 *                       donde `/` redirige a `/design-preview` y sirve el wordmark 3D.
 *
 * Antes la suite asumía que el servidor ya estaba levantado en :3000 y que el
 * modo design-preview corría aparte: `design-preview.spec.js` fallaba en
 * cualquier máquina sin :3002. Ahora `webServer` arranca ambos (o reutiliza los
 * que ya escuchan), así que `npx playwright test` pasa sin preparación manual.
 * Los overrides por entorno siguen disponibles: `KRONOS_TEST_URL` (app) y
 * `KRONOS_DESIGN_URL` (design-preview).
 */
const appURL = process.env.KRONOS_TEST_URL || 'http://localhost:3000';
const designURL = process.env.KRONOS_DESIGN_URL || 'http://localhost:3002';

const launchOptions = process.env.CHROMIUM_PATH
  ? {
      executablePath: process.env.CHROMIUM_PATH,
      args: ['--no-sandbox', '--no-zygote', '--disable-dev-shm-usage'],
    }
  : {};

export default defineConfig({
  testDir: './test-browser',
  workers: 1,
  timeout: 60000,
  use: {
    headless: true,
    launchOptions,
  },
  webServer: [
    {
      command: 'npm run dev -- --port 3000 --strictPort',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 180000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev:design',
      url: 'http://localhost:3002',
      reuseExistingServer: true,
      timeout: 180000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
  projects: [
    {
      name: 'app',
      testIgnore: /design-preview\.spec\.js/,
      use: { baseURL: appURL },
    },
    {
      name: 'design-preview',
      testMatch: /design-preview\.spec\.js/,
      use: { baseURL: designURL },
    },
  ],
});

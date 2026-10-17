# Preparación y modularización — 17 de octubre de 2026

**Rama:** `arena/1fcd155b-kronos-space-com`.

Cambios y comprobaciones locales, no certificación del despliegue público. Se conserva el trabajo previo de la rama, el negro profundo, el cromo espejo, el reloj basado en la hora del dispositivo y el planeta orbital. Identidad de entrada comprobada: **KRONOS-SPACE** / **Tu tiempo Tu espacio Tu dominio**. La imagen de referencia no se utiliza como fondo. La revisión final encontró una copia idéntica ya rastreada en el commit base: se retira de `client/src/assets/` y se añade su ruta a `.gitignore`. El adjunto original se mantiene fuera del repositorio; no se reescribe el historial previo. Se unifica también la marca en título, metadatos y manifest PWA.

## Cambios implementados

- **Dependencias:** actualizaciones compatibles de dependencias vulnerables y del lockfile, sin `npm audit fix --force`. El informe completo de la raíz pasó de 12 vulnerabilidades a 0. La cadena vulnerable de `nodemon` se elimina sustituyéndolo por `node --watch`; el arranque de producción conserva `node src/server.js`. Auditoría independiente de Guardian también en 0.
- **Servidor:** `server.js` pasa de 757 a 367 líneas. `http/registerRoutes.js` concentra los montajes; `http/errorHandlers.js` conserva las respuestas JSON sanitizadas; `realtime/registerSocketHandlers.js` concentra autenticación y eventos Socket.IO. El compositor mantiene seguridad HTTP, salud, arranque y apagado. Las rutas de sesión siguen ANTES del limitador de credenciales; los errores terminales siguen DESPUÉS de las rutas; las ACL de medios no se mueven.
- **Cliente:** `App.jsx` conserva rutas diferidas y guardas; `app/useAppSession.js` concentra hidratación, renovación, eventos de sesión, caché, logout y conexión/desconexión del socket. Sin rediseño.
- **Aislamiento de entornos:** solo los hosts públicos explícitos reciben automáticamente la API de producción. Un tenant/preview arbitrario de Vercel o un subdominio de prueba ya no hereda esa API. Un preview estático necesita `VITE_API_URL` de staging; se conserva el alias público histórico y los dominios oficiales.
- **Build:** Three se divide por sus módulos ESM de núcleo/renderer, manteniendo la carga diferida. Ningún chunk JS supera 500.000 bytes; el mayor mide **417.911 bytes**. La comprobación del manifiesto también rechaza imports estáticos transitivos que precarguen el motor 3D en el arranque.
- **Advertencias de compilación:** un transform limitado a dos comentarios explicativos de Zod corrige menciones textuales de la marca de pureza que Rollup interpretaba incorrectamente. No se filtra el logger, no se borran anotaciones reales y no cambia código ejecutable; tiene pruebas de regresión. No se eleva el límite de chunks.
- **Regresión:** nuevas pruebas HTTP y Socket.IO sobre el compositor real verifican rutas protegidas, presupuesto de login independiente de la sesión y rechazo de sockets sin autorización, expirados o con firma/algoritmo inválidos, sin acceder a MongoDB. Los contratos estáticos existentes apuntan al nuevo registro, conservando sus comprobaciones.
- **Navegador y CI:** la suite puede probar el build servido por `vite preview`. Una prueba antigua importaba `/src/services/authStorage.js`; ahora actualiza el avatar mediante la UI real y comprueba usuario, access token y refresh token persistidos. No se añaden hooks de prueba al producto. CI incorpora auditoría completa, presupuesto de bundle y navegador sobre el build. El lint bloquea advertencias con `--max-warnings=0` e incluye el nuevo módulo de configuración.

## Resultado final local

| Comprobación | Resultado |
|---|---|
| Instalación limpia con el lockfile (`npm ci`) | Correcta; ver avisos transitivos abajo |
| Auditoría completa raíz, incluidos paquetes de desarrollo | 0 vulnerabilidades reportadas |
| Auditoría independiente de Guardian | 0 vulnerabilidades reportadas |
| Árbol `npm ls --all` | Correcto |
| Lint cliente/configuración/servidor/scripts/Guardian | Sin errores ni advertencias |
| Servidor | **484 aprobadas**, **103 omitidas**, 0 fallos |
| Contratos Node del cliente | **58 aprobadas**, 0 fallos |
| Interfaz Vitest | **334 aprobadas** en 54 archivos, 0 fallos |
| Guardian | **8 aprobadas**, 0 fallos |
| Chromium | **67 aprobadas**, 0 fallos: 66 de la app sobre build y 1 del servidor de diseño separado |
| Build Vite + presupuesto de bundle | Correctos, sin advertencias; 81 chunks JS y 6 chunks iniciales, sin motor 3D precargado |
| Barrido estricto de utilidades CSS | Correcto |
| Documento generado de rutas (`--check`) | Correcto |
| `git diff --check` | Correcto |

**951 pruebas aprobadas en conjunto; las 103 omitidas NO se cuentan como aprobadas.** Las pruebas del servidor se ejecutaron sin `MONGODB_URI` ni `KRONOS_E2E_MONGODB_URI` para no tocar datos de producción. Las pruebas de interfaz/navegador utilizan respuestas HTTP y Socket.IO simuladas donde lo indica cada fixture; acreditan comportamiento del cliente, no disponibilidad de proveedores o acceso real a una cuenta de Google. Los casos negativos de servidor pueden registrar errores esperados al ejercitar deliberadamente fallos.

### Avisos de instalación aún existentes

`npm ci` muestra dos avisos de obsolescencia transitiva: `whatwg-encoding@3.1.1` (entorno de pruebas jsdom) y `node-domexception@1.0.0` (cadena Google Auth → gaxios → node-fetch → fetch-blob). No son vulnerabilidades reportadas ni advertencias del build/lint. No se silencian, no se aplican overrides incompatibles y no se declara que la instalación tenga cero avisos. Su sustitución requiere una actualización compatible de sus consumidores y nueva regresión.

## Límites para declarar producción cerrada

Estas comprobaciones **no autorizan afirmar «cero bugs» ni «producción validada al 100 %»**:

1. Ejecutar las 103 pruebas MongoDB contra una base aislada identificada como E2E; no reutilizar la URI de producción.
2. Publicar esta rama mediante el flujo de revisión/despliegue y verificar que el frontend y `/health` correspondan al commit publicado. La publicación autorizada posteriormente por el propietario se limita a esta rama de trabajo: no incluye merge a `main` ni despliegue de producción. Los resultados de CI del commit publicado deben comprobarse en GitHub.
3. Probar en staging Google real, correo de verificación/reset y cada proveedor IA configurado, con cuentas y presupuesto autorizados. No se han enviado correos ni generado cargos.
4. Verificar restauración de backups, almacenamiento durable, carga y operación con la configuración real del hosting. La presencia de scripts no acredita haber restaurado un backup.
5. Mantener la restricción de una instancia mientras presencia, limitadores y otros estados sigan en memoria; el multi-replica necesita coordinación compartida y pruebas específicas.
6. Live conserva STUN sin TURN: falta implementar/configurar TURN y probar dispositivos y redes NAT reales. Los límites IA actuales no sustituyen un presupuesto monetario durable por cuenta. Los trabajos de video persisten pero su avance depende del polling, no de un worker independiente.
7. Resolver política de privacidad/retención y eliminación de cuentas antes de presentarlas como capacidades completas. Este trabajo no inventa esos flujos ni textos legales.

## Repetición

```bash
npm ci
npm run audit:dependencies
npm run lint
# Entorno aislado, nunca la base de producción:
env -u MONGODB_URI -u KRONOS_E2E_MONGODB_URI npm test
npm --prefix guardian test
npm run build
node scripts/ci/barrido-utilidades.mjs --estricto
node scripts/ci/generate-route-docs.mjs --check
# Con Chromium instalado por Playwright:
cd client
npx playwright install chromium
KRONOS_BROWSER_PRODUCTION=1 npm run test:browser
```

En esta máquina Chromium se proporcionó externamente mediante `CHROMIUM_PATH` y librerías temporales; no se incorpora el navegador al repositorio. La vista previa local sirve el frontend compilado; no constituye un backend conectado ni un despliegue público.

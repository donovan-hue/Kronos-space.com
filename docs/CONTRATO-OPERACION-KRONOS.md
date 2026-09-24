# Contrato técnico de operación — KRONOS

Estado: contrato derivado del código; **no certifica el hosting remoto**. Vinculado al Plan Maestro (H18/H17/V02/V07/H15). No modifica navegación, dominios públicos ni proveedores. Actualizar este documento, no crear versiones paralelas.

## 1. Procesos y artefactos existentes

| Proceso | Comando existente | Responsabilidad |
|---|---|---|
| Build frontend | `npm ci && npm run build` | Genera `client/dist`; no arranca ni integra una API |
| API | `npm start` | Arranca Express/Socket.IO desde `server/src/server.js`; conecta Mongo antes de escuchar |
| Desarrollo | `npm run dev` | Vite :3000 y API :5000; proxy Vite para `/api`, `/uploads`, `/socket.io` |
| Preview local del build | `npm run preview --workspace=client` | Vite preview; no sustituye un hosting de producción |
| Guardian | `npm ci --prefix guardian` | Instalación independiente; su ejecución puede escribir en GitHub, no es un health check |

El servidor no sirve `client/dist`. El hosting del frontend y la API son responsabilidades separadas. No se añade un manifiesto de plataforma sin conocer su configuración efectiva. Backend declara Node >=20; Vite/ESLint requieren versiones más recientes dentro de las ramas soportadas (no asumir que Node 20.0 sirve para el build). CI selecciona Node 20; correcciones locales verificadas en 22.22.3.

## 2. Entorno y conexiones

- Plantilla mantenida: `server/.env.example`; `server/env.example` conserva el mismo contenido por compatibilidad, comprobado en tests. Copiar únicamente a un entorno propio y sustituir los valores de ejemplo; nunca versionar `.env` efectivo.
- API: `MONGODB_URI`, `JWT_SECRET` y `CLIENT_URL` reales. En producción `NODE_ENV=production`. `PORT` por plataforma (default 5000). No revelar URI/secretos en logs o informes.
- `CLIENT_URL`: lista de orígenes exactos separada por comas; el primero determina links de correo/referer. Dominio público vigente: `https://kronos-space.com`. No alterar aliases ni redirecciones como corrección técnica.
- `TRUST_PROXY=1` solo detrás del proxy conocido de un salto que asume el servidor. No activarlo sin contrastar topología/IP/rate limiting.
- `VITE_API_URL` se incorpora al **build**, no al arrancar un hosting estático; incluye `/api`. Tras cambiarla hay que reconstruir. Un preview debe apuntar a una API de pruebas aislada configurada realmente, no a un dominio inventado.
- Precaución: el fallback actual de `*.vercel.app` alcanza la API de producción. No ejecutar pruebas mutantes en previews sin comprobar el destino efectivo. No se cambió ese fallback en esta tarea.
- Socket.IO deriva el origen de la API retirando `/api`; conservar transporte `/socket.io`, upgrade WebSocket y las políticas de origen del backend.
- El `localhost:5000` de `vite.config.js` pertenece al servidor proxy de desarrollo: no es la dirección que debe contactar el navegador remoto.

## 3. Límite operativo: una instancia de API

La topología actualmente soportada por el código es **un proceso/una réplica API**. No es una afirmación sobre cuántas réplicas tiene el hosting remoto.

Evidencia:
- `server/src/modules/messages/presence.js`: Map local por proceso.
- `server/src/server.js`: Socket.IO sin adaptador distribuido; rate limit con memoria predeterminada; temporizador de apertura de cápsulas por proceso.
- Reiniciar pierde presencia y conexiones; Mongo persiste datos, no distribuye automáticamente las salas Socket.IO.

No activar cluster/varios workers/autoscaling horizontal sin un bloque específico que configure y pruebe adaptador de sockets, estado/límites compartidos, afinidad de transporte cuando aplique y tareas periódicas. **No se ha añadido Redis ni un proveedor ficticio.** Antes de release, comprobar configuración real de réplicas/workers, y probar dos cuentas en la misma instancia: DM, grupo, notificaciones, refresh y reconexión. Dos instancias requieren pruebas independientes antes de admitirse.

## 4. Media, cifrado y respaldo

- `server/src/config/storage.js`: copia local en `server/uploads` y copia durable en GridFS. `/uploads` sirve disco y fallback GridFS. No sustituir esta persistencia por archivos temporales ni describir URLs de media como almacenamiento privado.
- Definir `CAPSULE_SECRET` independiente **antes de crear cápsulas nuevas**. Si existen cápsulas creadas usando el fallback JWT_SECRET, cambiar la clave sin migración las vuelve ilegibles. Inventariar datos y probar migración/restauración antes de rotar cualquiera de esos secretos. No se rotaron claves en esta tarea.
- `node scripts/backup-verify.js`: crea respaldo usando Mongo real; usa mongodump si está disponible o exportación JSON como alternativa.
- `node scripts/backup-verify.js --check <directorio>`: comprueba archivos/conteos/checksums según modo del manifiesto. La integridad local **no demuestra restauración**.
- La alternativa JSON actual usa JSON.stringify, no Extended JSON: no prometer round-trip de todos los tipos BSON (ObjectId, fechas, binarios/GridFS). Para un respaldo de recuperación completo usar herramientas MongoDB y demostrar restore en una base aislada. El manifiesto/checksum por sí solo no resuelve este límite.
- Restore real y validación de cápsulas/uploads permanecen pendientes de MongoDB/herramientas/entorno aislado; nunca ejecutar restauraciones o dropDatabase sobre producción.

## 5. IA: presupuesto de peticiones

El contrato local se valida con tests de transporte y servicios, no sustituye una generación real.

| Operación cliente | Presupuesto cliente | Proveedor / motivo |
|---|---:|---|
| Imagen | 120 s | Catálogo hasta 10 s, generación hasta 45 s, descarga remota opcional hasta 45 s, margen para persistencia/transporte |
| Guion | 60 s | Generación hasta 45 s más persistencia/transporte; sin retries automáticos del SDK |
| Video: crear o consultar trabajo | 45 s | Proveedor hasta 30 s más persistencia/transporte |
| Chat Gemini | 60 s | Proveedor acotado a 45 s y un solo intento |
| Historial/borrado y otras APIs | 15 s | Conservan default de apiClient |

El hosting/proxy debe permitir estos tiempos para las rutas existentes. Debe comprobarse en infraestructura real: no se configuraron límites remotos. Un timeout/desconexión no garantiza cancelación del trabajo del proveedor, no es idempotencia y no autoriza retry automático de una generación. Antes de reenviar manualmente, comprobar historial/trabajos existentes. Falta prueba real de operaciones lentas/costos/resultados y contratos de idempotencia/cancelación de cada proveedor. Si la plataforma no admite el presupuesto se necesita diseñar un flujo asíncrono; no introducir jobs ficticios.

## 6. Comprobaciones de release (evidencia aún requerida)

1. Instalación limpia, árbol de dependencias, lint, build, pruebas; registrar skips como pendientes.
2. `scripts/verify-deploy.sh`: health/CORS/bundle de solo lectura. CI lo tiene como comprobación no bloqueante: un check verde general no certifica despliegue. Exigir su evidencia antes de decidir release.
3. Hosting SPA: entrada directa/recarga de `/home`, `/profile/:username`, `/messages/:userId` y demás rutas existentes debe servir la app, sin convertir errores de API/assets en HTML. No se cambió ningún rewrite remoto.
4. HTTPS, headers frontend/API, CORS de orígenes autorizados y ajenos, socket/reconexión, 401/403/503, dependencias externas.
5. MongoDB aislado para `npm run test:e2e`; inspeccionar aislamiento de cada suite antes de elegir URI (no todas usan una base temporal del mismo modo). La suite de auth opera sobre la URI indicada y limpia sus usuarios: eso no habilita ejecutarla en producción.
6. Restauración completa en base aislada; después verificar datos, GridFS y cápsulas.
7. Navegador real: consola, rutas, controles, responsive y permisos de medios. Los cambios visuales requieren autorización por separado.

## 7. Bloqueos comprobados en el entorno de esta sesión

Sin `mongod`/Docker local ni URI configurada para E2E; conexión TLS a la descarga oficial de MongoDB falla. No se instaló ni usó una base en memoria. No se verificó configuración de hosting remoto ni se activó ningún proveedor. Estas dependencias impiden certificar E2E, restore y producción; no impiden corregir y probar contratos locales.

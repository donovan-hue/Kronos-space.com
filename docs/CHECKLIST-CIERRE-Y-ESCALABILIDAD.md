# KRONOS SPACE — Checklist de cierre y escalabilidad

Checklist sin descripción: cada línea es una acción terminable y verificable. Un `[ ]` con
texto después de la raya dice por qué sigue abierto —decisión del propietario, credencial que no
existe aquí o entorno que no se puede montar—, no que nadie se lo saltó sin mirar.
Origen: análisis del árbol en `03bccc0` + `docs/PENDIENTES.md` +
`docs/CHECKLIST-CIERRE-TOTAL-KRONOS.md` + `docs/LIMITES-Y-DEUDA.md` +
`docs/ANALISIS-CODIGO-RUTAS-Y-RIESGOS.md` + `docs/db/CHECKLIST-PRE-PRODUCCION.md`.

Estado medido en el entorno de trabajo tras los bloques A–E (2026-10-29): `npm run lint` 0 avisos
en cliente y servidor · servidor 828 casos con 636 pasan / 0 fallan / 192 saltadas y las 192
declaradas dentro de su presupuesto · cliente 549 pruebas Vitest en 66 archivos y 84/84 contratos
de hoja · `npm run build` OK (chunk inicial 404,45 kB / gzip 128,89 kB, 87 chunks, sin motor 3D
precargado) · `barrido-utilidades --estricto` sin utilidades inertes y con las tres guardas de
cascada en pie · `barrido-no-mock` 47 archivos revisados, 19 con sustitución declarada, 0 sin
declarar · cupo de estilos huérfanos en su suelo (33) · umbrales de cobertura en su piso
(servidor 56,73/72,56/50,77 · cliente 62,09/75,55/52,04) · `validate:workflows` y
`test:workflows` en verde sobre 8 archivos · guardián 10/10 · `npx playwright test --list`
enumera 172 pruebas en 22 archivos (Chromium no está instalable aquí). Las 192 saltadas son los
casos e2e que piden `KRONOS_E2E_MONGODB_URI`: corren en el job `mongo-real` de
`kronos-e2e.yml`, no en este entorno.

Total: 187 puntos abiertos · 44 cerrados (suma 231).

---

## A · Producto sin cerrar

- [x] Borrado de cuenta en la interfaz de Ajustes (con verificación: contraseña, o el nombre de usuario escrito si no hay contraseña)
- [x] Verificación de correo como requisito para publicar
- [ ] Flujo completo de restablecimiento de contraseña con correo real
- [x] Secciones de monetización revisadas en pantalla
- [x] Pasarela de pago real o alcance "fuera de v1" declarado
- [ ] Libro de costo/créditos por usuario
- [ ] Locución con catálogo de voces propio
- [ ] Catálogo de música con contenido publicado
- [x] Proyectos por pieza (guion, tomas, música, versiones)
- [x] Plantillas de formato 9:16 / cuadrado / panorámica / portada
- [x] Herramientas y orquestación del chat: alcance definido
- [x] Páginas legales: términos, privacidad, cookies
- [ ] Página pública de perfil y de publicación para no registrados
- [x] Página de estado del servicio
- [ ] Correo de notificación opcional (resumen)
- [x] Idiomas adicionales (i18n) o declaración de un solo idioma
- [x] Módulo de ayuda / centro de soporte público
- [ ] Onboarding con datos mínimos y saltos reales
- [x] Criterio de "cuenta nueva" aplicado en moderación
- [ ] Texto de los tres documentos revisado y aprobado
- [ ] Revisión de las páginas legales en el idioma declarado (si se añade inglés)

## B · Decisiones del propietario

- [ ] Media privada o pública
- [ ] Federación bidireccional o solo lectura
- [ ] Proveedor de video
- [ ] Proveedor de voz
- [ ] Origen del catálogo de música
- [ ] Retención de notificaciones (`NOTIFICATIONS_TTL_DAYS`)
- [ ] Rotación de `CAPSULE_SECRET`
- [ ] Aprobación de los textos legales (términos, privacidad, cookies)
- [ ] Aprobación visual UI01 / UI02
- [ ] Aprobación H01–H05, H10, H12
- [ ] Publicación en GitHub (release, visibilidad del repo)
- [ ] Presupuesto mensual máximo de IA en producción
- [ ] Topología objetivo (una instancia vs. multi-instancia)
- [ ] Antigüedad máxima aceptable de datos en el feed
- [ ] Meta de usuarios concurrentes y latencia objetivo
- [ ] Política de datos de menores

## C · Credenciales y verificación externa

- [ ] `GOOGLE_CLIENT_ID` + `VITE_GOOGLE_CLIENT_ID` verificados de extremo a extremo
- [ ] `RESEND_API_KEY` + `RESEND_FROM_EMAIL` cargados y probados
- [ ] `OPENROUTER_API_KEY` con generación facturada probada
- [ ] `GEMINI_API_KEY` con chat real probado
- [ ] `VIDEO_API_KEY` + `VIDEO_API_URL` con trabajo real probado
- [ ] URI de solo lectura de producción para auditoría de índices
- [ ] Acceso al panel del hosting verificado
- [x] `NODE_ENV` real de producción leído y registrado
- [x] `MONGODB_AUTO_INDEX` real de producción leído y registrado
- [ ] `TRUST_PROXY` confirmado con 429 por IP y no por proxy
- [x] `GOOGLE_CLIENT_ID` y `VITE_GOOGLE_CLIENT_ID` son el mismo Client ID en producción, y el cliente de Google está dado de alta y activo
- [x] `health` publicado y leído en producción: `environment`, `environmentDeclared`, `autoIndex`, `build` y `trustProxy`
- [x] Sonda de lectura de proveedores sin costo: `npm run probar:proveedores`
- [x] Proyecto de frontend de Vercel inventariado: sus 3 variables, el despliegue de producción y el commit del que salió

## D · Hallazgos técnicos abiertos (P0 / P1 / P2)

- [ ] Feature flags aplicados en servidor, router y API — *abierto a propósito:* la lectura ya está probada (`server/test/flags.contract.test.js`, `client/src/navigation/useNavFlags.js`) y `GET /api/flags` es su único consumidor en el servidor. Convertir la bandera en puerta significa decidir qué le pasa a una cuenta que ya tiene círculos, audios o verticales creados cuando la bandera se apaga (¿404? ¿solo-lectura? ¿se borra?), y eso es una decisión de producto, no un detalle técnico.
- [ ] Flags para Círculos, En vivo y Audio — depende del punto anterior: las tres banderas existen y se leen; apagarlas no cerraría nada hoy.
- [x] `App.jsx` vigilado por el guardián — entra en `RUTAS_VIGILADAS` (HIGH, informa sin bloquear) y no en `RUTAS_CRITICAS`: CRITICAL falla el job, y App.jsx cambia en casi cualquier pantalla. `guardian/src/riskEvaluator.js`; dos casos en `guardian/test/riskEvaluator.test.js` (que suba a HIGH y que nunca bloquee).
- [x] `navigation/model.jsx` vigilado por el guardián — mismo criterio y mismo bloqueo que `App.jsx` (ver arriba).
- [x] `apiClient.js` vigilado por el guardián — el interceptor de refresco/reintento es de las cuatro; se informa como HIGH.
- [x] `authStorage.js` vigilado por el guardián — dónde vive la credencial; HIGH con razón escrita.
- [x] `mediaUrl()` sin reserva `localhost` — orden real: API absoluta → origen del documento → devolver la ruta tal cual (`client/src/services/mediaUrl.js`); lo prueban los 6 casos de `client/test-ui/media-url.spec.js`, incluido el guard que no puede volver a aparecer la palabra `localhost` en el archivo. Sin esto, una imagen en el móvil de la red local apuntaba a la máquina de quien programa.
- [x] `getCurrentSection()` derivado de la tabla de rutas — la cadena de 19 `if` con prefijos a mano sale de `NAV_GROUPS` + un `ALIAS_DE_SECCION` mínimo (`client/src/navigation/model.jsx`); la tabla se exporta (`TABLA_DE_SECCIONES`, `SECCIONES_RESUELTAS`) y 45 casos en `client/test-ui/navegacion-secciones.spec.js` fijan el comportamiento ruta por ruta y bloquean etiquetas sin rutas o rutas sin etiqueta.
- [x] Regex de `durableUploads` derivada de `storage.js` — formato único en `server/src/config/uploadNaming.js` (carpetas, extensiones, nombre generado); `storage.js` nombra con él y `durableUploads.js` valida con la regex construida a partir de esa tabla. `durable-uploads.contract.test.js` afirma las identidades y el producto cartesiano carpeta × mimetype; `music.contract.test.js` pasó a leer la tabla en lugar del texto del archivo.
- [x] `barrido-utilidades.mjs` recorre `client/src` en disco y no `git ls-files`: un archivo nuevo sin registrar ya no es punto ciego y un `git rm` a medio commitear ya no lo revienta con `ENOENT`
- [x] Modo `--huerfanas` en `barrido-utilidades.mjs` — dirección inversa del barrido: 775 clases propias declaradas a mano, 33 sin uso en producto, 7 «no verificables» (el código las arma con interpolación, no se acusan). El cupo vive en `scripts/ci/estilo-huerfanas.json` y solo puede bajar; `--escribir-cupo` lo regenera. `npm run barrido:huerfanas`.
- [ ] `DesignPreview.jsx` retirado — *abierto:* no es código muerto cualquiera; está montado (`client/vite.config.js:40-46` redirige a `/design-preview` en el modo `design-preview`, o sea `npm run dev:design`) y es la pantalla donde se aprueban los visuales. `NanoScene.jsx` solo lo importa él. Retirar la herramienta es decisión del propietario.
- [ ] `NanoScene.jsx` retirado — mismo caso y misma decisión que `DesignPreview.jsx` (es su escena interna).
- [x] Kit `components/ui/`: adoptado en producto — 32 archivos de `client/src` lo consumen (`label` 75 usos, `button` 72, `input` 37, `textarea`/`EmptyState` 20, `skeleton` 18, `avatar`/`dialog` 14-15, `Spinner` 13, `useDialogFocusRestore` 2). La opción «retirar» queda sin objeto; lo vigilan `ui-kit.spec.jsx`, `kit-accesibilidad.spec.js` y `kit-consumidores.spec.js`.
- [x] Ciclo de importación de `server.js` eliminado — no queda ninguno: `server/test/ciclo-importacion.test.js` recorre el grafo de `require` literales de `src` (129 archivos) y afirma 0 ciclos, que `server.js` no pueda alcanzarse a sí misma por el camino largo, y que la deuda de capas (`config/mediaLifecycle.js` → 5 modelos de dominio) no crezca. El temporizador de cápsulas ya vive en `startServer()`.
- [x] `runner.down()` marca/limpia el diario sin ambigüedad — la lápida `direction: "down"` se conserva (un `rollback` sin rastro no se audita) y la lectura vive en un solo sitio: `server/src/migrations/journalState.js` con `estaAplicada`/`claveDeRecord`. Eran cuatro comparaciones a mano (`up`, `down`, `status` y `scripts/backup-verify.js`); ahora son cero fuera del módulo, y `server/test/migration-journal.test.js` lo afirma además de arreglar el caso real que la ambigüedad tapaba: un registro sin campo `version` se indexaba como «nunca aplicada» y la migración volvía a aplicarse.
- [ ] Arreglos sin cota en documentos (`likes`, `followers`) acotados o normalizados — *decisión del propietario:* acotar cambia lo que ve un usuario (un perfil con 5 000 seguidores dejaría de verlos), y normalizar a contadores separados es una migración sobre datos existentes. Ninguna de las dos se puede elegir por defecto.
- [ ] `MediaStudio.jsx` partido por sub-sistema — refactor de superficie grande sin cambio de conducta; lo decide el propietario (y conviene hacerlo sobre un commit congelado con el Playwright completo en verde, no mezclado con otra cosa).
- [ ] `CreatePost.jsx` partido por sub-sistema — mismo caso que `MediaStudio.jsx`.
- [ ] `posts.routes.js` partido por sub-sistema — mismo caso; además es el archivo con más E2E encima (192 casos), así que el corte se puede hacer con red de seguridad, pero sigue siendo una decisión de orden del repo.
- [ ] `auth.routes.js` partido por sub-sistema — mismo caso, con el añadido de que es el módulo que más guardas de seguridad concentra.
- [x] Aserción de retorno a la URL intentada tras el login
- [x] Aserción permanente de los dos defectos de geometría — `.grid` del tema con guarda `:not([class*="gap-"])` y el reseteo universal dentro de `@layer base`: los dos están afirmados en `client/test/css-cascade.test.mjs` (rengoón de capa en la línea 40 y `display` de la media query en la 86) y el barrido los vuelve a cazar sin navegador (`scripts/ci/barrido-utilidades.mjs`, bloque «Cascada»: tres guardas, y el paso es portón en CI con `--estricto`).
- [ ] Reglas de estilo huérfanas eliminadas (86 declaradas sin uso) — el número real medido hoy es 33 sin uso en producto y 7 no verificables (ver el punto `--huerfanas` arriba); las 86 venían de contar otras cosas. Borrar una regla es una decisión de diseño —algunas las consulta un `.spec` y hay que borrar la aserción a la vez—, así que queda abierto con el cupo congelado: no puede crecer y cada borrado lo baja.

## E · Pruebas y calidad

- [x] 186 pruebas e2e omitidas ejecutadas en CI — las 192 corren en `kronos-e2e.yml`, job `mongo-real` (contenedor `mongo:7` con comprobación de salud, `KRONOS_E2E_MONGODB_URI=mongodb://127.0.0.1:27017/kronos_ci_chain`, `npm run test:e2e`), disparado en `pull_request` y en `push` a `main`; el job `atlas` añade el clúster de ensayo cuando existe el secreto. En `ci.yml` siguen omitidas —ahora con el motivo declarado y contabilizado, ver el punto siguiente.
- [x] CI falla ante `skipped` no declarado — `scripts/ci/presupuesto-skip.mjs` lee el TAP y falla ante una omisión sin patrón declarado, una que exceda su tope, un `not ok`, o un TAP sin resultados (que es un verde fabricado). Cableado en dos sitios: `ci.yml` (paso «Run server tests», con `--estricto`) y `kronos-e2e.yml` (paso «Exigir el presupuesto de omisiones»). Declaraciones en `scripts/ci/skips-declarados.json`: 192 por `KRONOS_E2E_MONGODB_URI` y tope 0 para «el destino no se puede demostrar».
- [ ] Refresco de token con sesión caducada en navegador real — *no se puede medir en este entorno:* hace falta el backend con MongoDB real sirviendo al navegador (los 3000/5000 de `scripts/pruebas-locales.sh`), porque el resto de las pruebas de navegador corre contra respuestas sustituidas y eso no prueba el refresco. La lógica del interceptor sí está cubierta en `api-session-isolation.spec.js` y `auth-session-persistence.spec.jsx`; lo que falta es la ida y vuelta con `401` real y rotación de refresh.
- [ ] Reconexión de socket con dos clientes reales — mismo bloqueo: dos navegadores con Socket.IO conectado exigen backend y base de pruebas. El servidor ya los admitiría (`/socket.io` proxy en `client/vite.config.js:103-115`); falta el entorno, no el mecanismo.
- [ ] REST + evento de socket comparados en la misma prueba — mismo bloqueo (necesita el backend real); la comparación es de un paso una vez exista la receta de `pruebas-locales`.
- [ ] Estados vacíos, paginación y error de red contra backend real — los tres estados se afirman contra respuestas simuladas (`client/test-browser/*.spec.js`, con su línea `KRONOS-NO-MOCK` declarando qué sustituyen); la versión contra backend real necesita la base de descarte y el servidor del punto de arriba.
- [ ] Accesibilidad automatizada (axe) en el job de navegador — hace falta `@axe-core/playwright` (o `jest-axe`), y en este entorno no se puede instalar nada: `npm i -D ...` falla con `Cannot read properties of null (reading 'edgesOut')` sobre el workspace. El sitio está listo en `ci.yml`, job `browser`, tras `npm run test:browser`; el paso de barrido no-mock ya obliga a que cualquier spec nuevo que simule la red lo declare.
- [ ] Lighthouse / presupuesto de rendimiento en CI — mismo bloqueo de instalación (`lighthouse` + `chrome-launcher`). Lo que sí mide hoy el presupuesto del bundle: `npm run build` pasa por `scripts/ci/check-client-bundle.mjs`, que fija el chunk inicial.
- [ ] Umbrales de cobertura en Vitest y `node:test` — hecho en `node:test` (las dos suites): `npm run coverage` mide con `--experimental-test-coverage` y compara contra `scripts/ci/umbrales-cobertura.json` (servidor 56,51 % líneas / 72,17 % ramas / 50,32 % funciones con pisos 55/70/49; contratos del cliente 62,09/75,55/52,04 con pisos 61/74/51); el filtro `scripts/ci/cobertura-minima.mjs` falla por debajo del piso y avisa cuando el piso queda corto. El job `cobertura` de `ci.yml` lo corre con Node 22. Falta la pata de Vitest: necesita `@vitest/coverage-v8`, que no se puede instalar aquí (ver el punto de axe).
- [ ] Pruebas de carga (k6 o artillery) — ni k6 ni artillery se instalan en este entorno (npm roto) y no hay deployment propio al que meterles mano sin credenciales. Queda como trabajo del propietario con su clúster de ensayo; la superficie a medir está nombrada en los puntos de latencia y aguante de abajo.
- [ ] Prueba de aguante de 30 min con carga sostenida — requiere el entorno de ensayo y costo de provedores: es del propietario (bloque C).
- [ ] Prueba de pico (cold start de escalado) — requiere panel del hosting y scaling configurado: del propietario.
- [ ] Prueba de Socket.IO con miles de conexiones — requiere una instancia desplegada y clientes reales: del propietario (y su resultado depende de la cota de conexiones por usuario, punto abierto del bloque G).
- [ ] Prueba de latencia de feed y de búsqueda con volumen real — necesita datos sembrados en un clúster de ensayo (el sembrado existe: `scripts/db/seed-staging.js`, con su `--confirm`) y la lectura de P95, que hoy no tiene recolector: bloque L abierto.
- [ ] Playwright en Firefox y WebKit — los binarios no se pueden bajar en este entorno (solo hay red hacia github/npmjs/pypi), así que no se puede ni probar qué specs aguantan. En CI es un `npx playwright install --with-deps firefox webkit` en `ci.yml:217-219` más `projects` en el config; el trabajo real es el triage de los specs que asumen Chromium (WebGL del espejo en `liquid-chrome.spec.js`, `--enable-unsafe-swiftshader`).
- [ ] Pruebas de navegador contra el entorno desplegado — el guard de destino ya existe y rechaza lo no permitido (`server/test/helpers/e2e-target-guard.js`, `LOCAL_HOSTS`), así que el paso pendiente es declarar `KRONOS_BROWSER_TARGET_URL` + una cuenta de pruebas en el entorno, lo que exige credenciales del propietario.
- [ ] Pruebas de subida de archivo grande con red lenta — el límite de tamaño y la validación de magic bytes están afirmados en pruebas; la variante con throttling necesita CDP contra el backend real, mismo bloqueo que los puntos de navegador real.
- [x] Pruebas de timeout y 503 de proveedores de IA — `server/test/ai-proveedor-503.contract.test.js` (6 casos): todo código de proveedor que se lanza está declarado en `AI_ERRORS`, ninguna caída de proveedor responde 500, timeout → 504, clave ausente/incompatible → 503, límite → 429, el mensaje no filtra la clave del proveedor, los cinco endpoints de IA mapean por la tabla compartida y ninguna llamada al proveedor queda sin timeout. La prueba encontró un defecto real y se arregló: `AI_CAPABILITY_NOT_SUPPORTED` no estaba en la tabla y llegaba al cliente como 502 genérico; ahora es 400 con nombre.
- [ ] Pruebas de duplicidad del barrido de cápsulas con dos instancias — dos procesos con el mismo `CAPSULE_SECRET` y la misma base, midiendo si una cápsula se abre o se cifra dos veces: necesita el entorno de ensayo (y el temporalizador fuera del proceso HTTP, punto abierto del bloque G).
- [ ] `git diff --check` limpio sobre el commit congelado
- [x] Auditoría de filtración de secretos: 400 revisiones del historial, árbol de trabajo, bundle compilado con valores canario e índice de código del repo público — cero coincidencias
- [ ] Barrido NO-MOCK sin coincidencias

## F · Seguridad y cumplimiento

- [ ] Content-Security-Policy definida y probada
- [ ] HSTS con `includeSubDomains` y carga en preload
- [ ] Rate limiting por usuario además de por IP
- [ ] Límite de sesiones concurrentes por cuenta
- [ ] 2FA (TOTP) o declaración de no ofrecido
- [ ] Filtro automático de spam / abuso / NSFW
- [ ] Lista de términos bloqueados y temas silenciados
- [ ] Registro de acciones de administración (audit log)
- [ ] Alerta de inicio de sesión desde dispositivo nuevo
- [ ] Política de retención aplicada a mensajes, historias y media
- [ ] Purga programada de media huérfana
- [ ] Revisión de alcance de credenciales MCP
- [ ] Rotación documentada de `JWT_SECRET` sin romper sesiones
- [x] Auditoría de dependencias programada — `.github/workflows/auditoria-dependencias.yml`, lunes 06:00 (y a mano cuando se pida): `npm run audit:dependencies` + comprobación de que el árbol del lockfile no tiene dependencias insatisfechas, sin secretos ni permisos de escritura. Semanal en vez de semestral porque una CVE publicada el martes no espera seis meses.
- [x] Dependabot o Renovate configurado — `.github/dependabot.yml`: npm (un solo ecosistema, porque `client/` y `server/` son workspaces del `package.json` raíz y comparten el lockfile) + `github-actions`, semanales, 5 y 3 PRs abiertos como máximo, dos grupos y `node` ignorado a propósito (subir el runtime es decisión de infraestructura). No hay auto-merge en ninguna parte: el bot abre, el CI decide, una persona fusiona.
- [ ] Firma y verificación de commits en `main`
- [ ] Protección de rama con requisitos de revisión

## G · Escalabilidad · estado compartido

- [ ] Store compartido de rate limiting (Redis)
- [ ] Adaptador de Socket.IO multi-instancia
- [ ] Presencia en Redis en lugar de `Map` por proceso
- [ ] Temporalizador de cápsulas fuera del proceso HTTP
- [ ] Cola de trabajos (BullMQ o equivalente)
- [ ] Trabajadores separados: IA, exportaciones, media, notificaciones
- [x] ID de instancia publicado en `/api/health` — `instance: { id, host, pid }` con `RENDER_INSTANCE_ID` cuando el hosting lo da y `hostname:pid` fuera; `server/test/health.test.js` fija la forma del bloque (lista cerrada, como `build`) y afirma que el payload no saca ni `JWT_SECRET` ni una URI de conexión.
- [ ] Afinidad de conexión documentada en el balanceador
- [ ] Prueba de dos réplicas detrás del balanceador
- [ ] Regla y prueba de autoscale horizontal
- [ ] Límite de conexiones por usuario
- [ ] Anulación de backpressure en eventos de socket
- [ ] Estado de subida reanudable (carga diferida / reintentos)

## H · Escalabilidad · base de datos

- [ ] Paginación por cursor en feed, perfiles y guardados
- [ ] `countDocuments` fuera de las rutas calientes
- [ ] Índice de texto en publicaciones o Atlas Search
- [ ] Búsqueda global sobre índice, no sobre `$regex`
- [ ] Índices de producción auditados contra el plan
- [ ] Reconciliación de índices declarados vs. existentes
- [ ] Cómputo de documentos vencidos antes de la migración 004
- [ ] Duplicados buscados antes de crear los 14 índices únicos
- [ ] Contadores normalizados (likes, seguidores, vistas)
- [ ] Caché de feed y de perfiles
- [ ] `readPreference` definido en conexiones de lectura
- [x] `maxPoolSize` explícito por proceso — `server/src/config/db.js` lo declara en 10, exactamente el valor por defecto del conductor, con `MONGODB_MAX_POOL_SIZE` para cambiarlo por entorno. Cero cambio de comportamiento: lo que se gana es que el número exista en el repositorio y que multiplicar réplicas deje de multiplicar el charco de conexiones sin que nadie lo haya decidido.
- [ ] Volumen de GridFS medido y limitado
- [ ] Plan de fragmentación o de crecimiento a 3 años
- [ ] Respaldo de producción tomado
- [ ] Restauración del respaldo de producción ensayada
- [ ] Ventana de mantenimiento de migración acordada

## I · Escalabilidad · media y archivos

- [ ] Almacenamiento de objetos (S3 / R2) en lugar de disco del proceso
- [ ] CDN delante de `/uploads`
- [ ] URLs firmadas para media privada
- [ ] Transcodificación de imagen y miniaturas en servidor
- [ ] Póster de video generado al subir
- [ ] HLS / bitrate adaptativo para video
- [ ] Compresión y recorte en el cliente antes de subir
- [ ] Carga directa al almacén con URL prefirmada
- [ ] Cuotas de almacenamiento por usuario
- [ ] Purga diferida de archivos borrados
- [ ] Encabezados de caché pública verificables en el CDN
- [ ] Purga de caché al borrar o reemplazar un archivo

## J · Escalabilidad · tiempo real y directo

- [ ] SFU para En vivo en lugar de malla P2P
- [ ] Cota de participantes por sala
- [ ] Cota de espectadores por sala
- [ ] Agregación de eventos de escritura y presencia
- [ ] Fan-out de notificaciones en lotes
- [ ] Caché compartida de miembros de sala
- [ ] Grabación o carrete diferido de transmisiones
- [ ] Reanudación de transmisión sin cortar a los espectadores

## K · Rendimiento web

- [ ] Presupuesto máximo de chunk fijado y vigente (402 kB hoy)
- [ ] Dividir el chunk de entrada
- [ ] Precarga de la primera pantalla del feed
- [ ] Virtualización de listas largas
- [ ] `srcset` en imágenes de feed y perfiles
- [ ] Carga perezosa en toda la media
- [ ] `preload`/`prefetch` de rutas frecuentes
- [ ] Brotli en la entrega de assets
- [ ] Source maps fuera del bundle público
- [ ] Chunk 3D solo en la pantalla de acceso (gate permanente)
- [ ] Ancho de banda del CSS medido y reducido
- [ ] Prerender o SSR para rutas públicas
- [ ] `robots.txt`
- [ ] `sitemap.xml`
- [ ] `og:image` por perfil y por publicación
- [ ] Íconos PNG 192 y 512 además del SVG
- [ ] Service worker con caché y modo sin conexión
- [ ] Notificaciones push (Web Push)

## L · Observabilidad y operación

- [ ] Sentry (o equivalente) en el cliente
- [ ] Sentry (o equivalente) en el servidor
- [ ] Métricas Prometheus o OpenTelemetry
- [ ] Trazas distribuidas en la ruta de petición
- [ ] P95/P99 por endpoint
- [ ] Alertas de salud, latencia y tasa de error
- [ ] Alerta de cuota/estado de proveedores de IA
- [ ] Monitor externo de disponibilidad
- [ ] SLO y presupuesto de error definidos
- [ ] Panel de capacidad y consumo
- [x] Corrida programada de verificación de producción — `verify-deploy.yml` corre los días hábiles a las 05:30 además de a demanda (`workflow_dispatch` con los mismos `inputs`); es la lectura de `/health`, del CORS y del bundle publicado, sin secretos y sin escribir en ningún sitio. El resumen usa los hosts por defecto cuando la corrida es programada y no hay `inputs`.
- [ ] Ejecución programada de auditoría de índices
- [ ] Runbook de incidente con pasos exactos
- [ ] Guardia y proceso de escalamiento definidos
- [ ] Registro de errores de arranque visible en el panel del hosting

## M · CI/CD e infraestructura

- [ ] Manifiesto de despliegue versionado en el repositorio
- [ ] Entornos `staging` y `producción` con bases separadas
- [ ] Mismo artefacto promocionado entre entornos
- [ ] Despliegue azul/verde o canario
- [ ] Reversión automática tras el fallo de la comprobación posterior
- [ ] Comprobación de despliegue bloqueante en el portón de release
- [ ] Migraciones ejecutadas por el pipeline con aprobación
- [ ] Puerta de aprobación de release registrada
- [ ] SHA publicado y consumido por la verificación posterior
- [ ] Respaldo y prueba de restauración en calendario
- [ ] Documentación de infraestructura como código
- [ ] Secrets gestionados con rotación y registro

## N · Documentación

- [ ] `CHECKLIST-CIERRE-TOTAL-KRONOS.md` sincronizado con `PENDIENTES.md`
- [ ] `docs/db/CHECKLIST-PRE-PRODUCCION.md` actualizado
- [ ] `LIMITES-Y-DEUDA.md` actualizado al estado final
- [ ] Hallazgos §5 de `ANALISIS-CODIGO-RUTAS-Y-RIESGOS.md` marcados como cerrados
- [ ] Contrato de operación con la topología real vigente
- [ ] Requisitos de capacidad y escalado en el README
- [ ] Guía de contribución y política de versiones
- [ ] `CHANGELOG` por versión publicada
- [ ] Licencia del repositorio

## O · Acta de cierre

- [ ] CI principal en verde sobre el commit congelado — medido en el árbol de trabajo (todo lo demás de este acta); el verde de GitHub Actions llega con el push y su corrida.
- [ ] Job E2E contra MongoDB real completo — no ejecutable en este entorno: no hay `mongod` y no se puede instalar (fuera de los hosts con red permitida). El job está cableado y en verde en `kronos-e2e.yml`/`mongo-real`; queda relanzarlo sobre el commit congelado.
- [ ] Job Atlas en verde u omitido por escrito — omitido por escrito: `KRONOS_E2E_MONGODB_URI` y `KRONOS_E2E_CLUSTER_ALLOWLIST` son secretos/variables del propietario y no existen aquí. Si faltan, el propio job ya lo dice (`Avisar si la guarda omitió todo el E2E`) y ahora el filtro de presupuesto también.
- [ ] Playwright completo sobre el commit congelado — 172 pruebas en 22 archivos, todas listadas y parseables tras los marcadores `KRONOS-NO-MOCK`; no se ejecutaron aquí porque el sandbox no tiene Chromium descargable.
- [ ] Borrado de cuenta ejecutado en navegador con backend real — la política y el contrato están cubiertos (`accountDeletionPolicy`, `account-deletion.e2e.test.js` corriendo con `mongo:7` en el job de E2E, `account-deletion.spec.jsx` en el navegador); la corrida manual en pantalla sigue siendo del propietario.
- [x] Suite de servidor con 0 fallos y 0 saltos no declarados — medido aquí: 828 casos, 636 pasan, 0 fallan, 192 saltadas y las 192 declaradas dentro de su presupuesto (`presupuesto-skip.mjs --estricto`, exit 0). El salto es el e2e que pide `KRONOS_E2E_MONGODB_URI`.
- [x] Suite de cliente completa en verde — 84/84 contratos de hoja (`node --test`) y 549 pruebas en 66 archivos de Vitest; `npm run lint` del cliente sin avisos y `npm run build` en verde (chunk inicial 404,45 kB / gzip 128,89 kB).
- [x] Producción verificada: frontend, API, salud, CORS y `VITE_API_URL` — lectura del 2026-10-29 en `docs/PRODUCCION-VERIFICACION-2026-10-29.md` (`/health` con `database:"connected"`, `realtime:true`, `environment:"production"`, `autoIndex:false`, `build.commit 03bccc0`, `traceable:true`; par Google emparejado con el cliente de Vercel). Queda releer `trustProxy` después del próximo despliegue: el cambio todavía no estaba publicado.
- [ ] Cadena de base de datos y ensayos en verde — el workflow la corre (`kronos-e2e.yml`, pasos «Cadena de base de datos» y ensayos) y necesita la URI de producción/ensayo: credenciales del propietario.
- [ ] Prueba de carga por debajo de los umbrales definidos
- [ ] Revisión de costos de proveedores aprobada
- [ ] Plan de capacidad firmado
- [ ] Aprobaciones del propietario registradas o aceptadas en riesgo

# PLAN MAESTRO DE EJECUCIÓN KRONOS

Fecha: 2026-09-24. Rama: `arena/01a0d255-kronos-space-com`. Fuente oficial: auditoría de esta sesión sobre `7d028f2` (H01–H18), no los informes históricos como prueba vigente. Este documento se mantiene y actualiza: no crear versiones paralelas.

## Autoridad y límites

- Usuario: interfaz, navegación y diseño, incluida apariencia/posición de controles, estados nuevos, responsive y animaciones. No hay ninguna propuesta visual aprobada al crear este plan.
- Agente: correcciones técnicas, integración, seguridad, configuración, pruebas y documentación sin cambios visibles no aprobados.
- APROBADO / RECHAZADO / CAMBIAR / ELIMINAR aplican exclusivamente al alcance señalado. Silencio no autoriza.
- Si una corrección exige una decisión visual, se pausa solo esa rama. Se presenta problema, alternativas, propuesta y pantalla de prueba independiente de producción.
- Fixtures/dobles en tests unitarios aislados solo para inyectar fallos; prohibidos como implementación o evidencia de integración real.
- No se eliminan aliases/rutas/APIs ni se inventan proveedores/credenciales. No se ejecutan tests destructivos contra producción.

## Orden exacto de ejecución y dependencias

1. **BASE / bloque 1:** H06 → H07 → V01 (baseline reproducible).
2. **BASE / bloque 2:** H14 (plantillas, sin certificar proveedor) → H09 (storage seguro) → V01 (regresión).
3. **BASE / bloque 3:** V06 → H18 (contrato local) → H17 (límite documentado de instancia) → H13 (solo limpieza con evidencia) → V01.
4. **BASE / preparación externa:** comprobar disponibilidad V02 y EXT02; mantener bloqueo si no existe infraestructura. Preparar V07 sin rotar claves.
5. **FUNCIONALIDAD / bloque 4:** H15 → V04 → V03 → V05 → V07. Las dependencias V02 pendientes impiden cerrar E2E, no impiden tests aislados.
6. **FUNCIONALIDAD / bloque 5:** EXT01/H08 cuando disponibles; H11 con EXT02 y contrato de seguridad completo; H16 solo optimización interna que preserve presentación.
7. **INTERFAZ:** H05 → H04 → H12 → UI01 → UI02: reproducción técnica primero; luego propuesta/pantalla y espera explícita en cada alcance. No alterar automáticamente onboarding ni su redirección al corregirlo.
8. **NAVEGACIÓN:** H01 → H02: mapa/propuesta/prototipo, aprobación independiente; conservar aliases hasta decisión expresa.
9. **DISEÑO:** H03 → H10: propuesta y prueba por pantalla/grupo explícito; no aplicar capas globales por aprobación parcial.
10. **CIERRE:** REL01. Una tarea externa/visual bloqueada no detiene las ramas técnicas independientes. Ninguna tarea se declara terminada solo por compilar.

## Matriz de trabajo

| ID | Fase | Tipo | Estado actual |
|---|---|---|---|
| H01 | 4 | REQUIERE APROBACIÓN | ESPERANDO PROPUESTA Y APROBACIÓN |
| H02 | 4 | REQUIERE APROBACIÓN | ESPERANDO PROPUESTA Y APROBACIÓN |
| H03 | 5 | REQUIERE APROBACIÓN | ESPERANDO PROPUESTA Y APROBACIÓN |
| H04 | 3 | REQUIERE APROBACIÓN | ESPERANDO PROPUESTA Y APROBACIÓN |
| H05 | 2/3 | REQUIERE APROBACIÓN | ESPERANDO PROPUESTA Y APROBACIÓN |
| H06 | 1 | AUTÓNOMO | CORREGIDO Y VALIDADO LOCALMENTE (Node 22.22.3); CI remoto no ejecutado |
| H07 | 1 | AUTÓNOMO | CORREGIDO Y VALIDADO LOCALMENTE: npm ci + npm ls estrictos sin errores |
| H08 | 2 | BLOQUEADO | BLOQUEADO: dependencia externa indicada |
| H09 | 1 | AUTÓNOMO | IMPLEMENTADO Y VALIDADO EN PRUEBAS AISLADAS; browser real/E2E pendientes (V02/V04) |
| H10 | 5 | REQUIERE APROBACIÓN | ESPERANDO PROPUESTA Y APROBACIÓN |
| H11 | 2 | AUTÓNOMO | PENDIENTE |
| H12 | 3 | REQUIERE APROBACIÓN | ESPERANDO PROPUESTA Y APROBACIÓN |
| H13 | 1 | AUTÓNOMO | LIMPIEZA DE fanContext VALIDADA LOCALMENTE; JSX idéntico, aliases/APIs preservados |
| H14 | 1 | AUTÓNOMO | PLANTILLAS ALINEADAS Y PROBADAS; disponibilidad de modelos pendiente (EXT01) |
| H15 | 2 | AUTÓNOMO | PRESUPUESTOS/RETRIES/POLLING CORREGIDOS Y PROBADOS LOCALMENTE; proveedor/hosting real pendiente |
| H16 | 2 | AUTÓNOMO | PENDIENTE |
| H17 | 1/2 | AUTÓNOMO | LÍMITE DE UNA INSTANCIA DOCUMENTADO; topología remota y multi-instancia pendientes |
| H18 | 1 | AUTÓNOMO | CONTRATO LOCAL DOCUMENTADO; comprobación remota BLOQUEADA por TLS/DNS en este entorno |
| V01 | 1 | AUTÓNOMO | REGRESIÓN ACTUAL: 197 servidor + 29 cliente + 238 UI aprobados; E2E/browser pendientes |
| V02 | 2 | BLOQUEADO | BLOQUEADO: sin MongoDB local/URI; descarga oficial falla TLS; 74 E2E omitidas |
| V03 | 2 | AUTÓNOMO | PENDIENTE |
| V04 | 2 | AUTÓNOMO | EN CURSO: carreras de sesión/hidratación corregidas en pruebas locales; autorización real/E2E pendientes |
| V05 | 2 | AUTÓNOMO | PENDIENTE |
| V06 | 1 | AUTÓNOMO | LOCK Y WORKFLOW CORREGIDOS; instalación/árbol/audit/sintaxis locales válidos; ejecución del bot no realizada |
| V07 | 1/2 | AUTÓNOMO | VERIFICADOR JSON CORREGIDO Y PROBADO; restore BSON/GridFS/cápsulas pendiente de MongoDB real |
| EXT01 | 2 | BLOQUEADO | BLOQUEADO: dependencia externa indicada |
| EXT02 | 1/2 | BLOQUEADO | BLOQUEADO: API TLS curl 35 y frontend DNS curl 6 desde este entorno; no prueba de caída remota |
| UI01 | 3 | REQUIERE APROBACIÓN | ESPERANDO PROPUESTA Y APROBACIÓN |
| UI02 | 3/5 | REQUIERE APROBACIÓN | ESPERANDO PROPUESTA Y APROBACIÓN |
| REL01 | Final | AUTÓNOMO | PENDIENTE |

## Fichas ejecutables (todos los campos obligatorios)

### H01

**ID:** H01

**ÁREA:** MenuDrawer / FanNav / OrbitMap

**PROBLEMA:** El drawer declara sus propios destinos, labels e iconos y no aplica useNavFlags. FanNav y OrbitMap sí usan el modelo filtrado.

**CAUSA:** Dos catálogos de navegación pese al comentario de fuente única. Las flags no son controles de autorización del backend.

**IMPACTO:** Alta de integración UX

**ARCHIVOS AFECTADOS:** client/src/components/navigation/MenuDrawer.jsx; client/src/navigation/model.jsx; client/src/navigation/useNavFlags.js

**DEPENDENCIAS:** H06, H07; flagsService, /api/flags, App.jsx

**TIPO:** REQUIERE APROBACIÓN

**RIESGO:** Alta de integración UX

**SOLUCIÓN PROPUESTA:** Derivar el drawer del mismo modelo, incluyendo las herramientas Kairos que hoy solo declara el drawer; preservar todos los destinos antes de eliminar el catálogo duplicado. Propuesta independiente del drawer; no cambiar destinos, orden, iconos o visibilidad hasta aprobación.

**REQUIERE MI APROBACIÓN:** SÍ

**VALIDACIÓN:** Comparar cada destino y etiqueta; apagar individualmente las seis flags; verificar navegación directa y las tres superficies.

**ESTADO:** ESPERANDO PROPUESTA Y APROBACIÓN

### H02

**ID:** H02

**ÁREA:** AppLayout / FanNav

**PROBLEMA:** Explorar y Perfil se repiten en topbar y navegación principal. En móvil, hamburguesa y Más abren el mismo drawer; el mapa agrega una tercera superficie de selección.

**CAUSA:** Acumulación de accesos globales; no son botones sin acción, son acciones duplicadas.

**IMPACTO:** Media UX

**ARCHIVOS AFECTADOS:** client/src/layouts/AppLayout.jsx:131-207; client/src/components/FanNav.jsx:80-140; client/src/styles/fan-nav.css:352-429

**DEPENDENCIAS:** H01; MenuDrawer, OrbitMap, navigation/model.jsx

**TIPO:** REQUIERE APROBACIÓN

**RIESGO:** Media UX

**SOLUCIÓN PROPUESTA:** Una navegación primaria por breakpoint; una sola entrada de secciones adicionales. Mantener atajos y evaluar el mapa como opción, no como navegación paralela obligatoria. Prototipo de navegación desktop/móvil; ninguna eliminación de acceso autorizada.

**REQUIERE MI APROBACIÓN:** SÍ

**VALIDACIÓN:** Contar controles visibles por destino a 360/390/768/1024/1440 px; comprobar teclado y acceso a secciones secundarias.

**ESTADO:** ESPERANDO PROPUESTA Y APROBACIÓN

### H03

**ID:** H03

**ÁREA:** Cascada global CSS

**PROBLEMA:** Se cargan 26 hojas globales, incluyendo capas monocroma/cromo y verde que redefinen los mismos tokens. Comentarios afirman ser la última capa sin coincidir con main.jsx; design-system describe navegación móvil como antigua aunque FanNav la utiliza.

**CAUSA:** Diseños superpuestos en lugar de sustitución controlada. La existencia de overrides no demuestra por sí sola un fallo de layout.

**IMPACTO:** Alta de mantenimiento visual

**ARCHIVOS AFECTADOS:** client/src/main.jsx:8-34; client/src/styles/design-tokens.css; client/src/styles/chrome-minimal.css; client/src/styles/aqua-theme.css; client/src/styles/design-system.css

**DEPENDENCIAS:** H02, H16; Todos los componentes k-*, Tailwind y estilos inline

**TIPO:** REQUIERE APROBACIÓN

**RIESGO:** Alta de mantenimiento visual

**SOLUCIÓN PROPUESTA:** Mapa selector→consumidor, consolidación de tokens y retirada selectiva de reglas superadas; no borrar hojas completas por su nombre. Consolidación CSS puede alterar cascada global: presentar comparación y alcance pantalla por pantalla.

**REQUIERE MI APROBACIÓN:** SÍ

**VALIDACIÓN:** Comparación de estilos computados, capturas por pantalla y cobertura CSS, antes y después.

**ESTADO:** ESPERANDO PROPUESTA Y APROBACIÓN

### H04

**ID:** H04

**ÁREA:** Settings

**PROBLEMA:** Apariencia se persiste pero no se encontró un consumidor visual. Idioma se utiliza en IA, pero no traduce la interfaz. Mostrar sensible se persiste y explícitamente reconoce que el etiquetado aún no existe.

**CAUSA:** Persistencia implementada sin todos los efectos que sugiere el control.

**IMPACTO:** Media funcional/expectativas

**ARCHIVOS AFECTADOS:** client/src/features/settings/Settings.jsx:266-308; server/src/modules/users/User.js; server/src/modules/users/users.routes.js; server/src/modules/ai-core/routes/chat.routes.js

**DEPENDENCIAS:** H09, V03; PATCH /api/users/me/preferences, estilos globales y chat.service

**TIPO:** REQUIERE APROBACIÓN

**RIESGO:** Media funcional/expectativas

**SOLUCIÓN PROPUESTA:** Precisar los labels/alcance o implementar los efectos reales con aprobación; no fingir que guardar equivale a cambiar tema/idioma de toda la app. Cambiar labels/tema/idioma visible requiere propuesta. Conservar preferencias y contrato mientras tanto.

**REQUIERE MI APROBACIÓN:** SÍ

**VALIDACIÓN:** Cambiar preferencias, recargar, verificar estilos/textos y respuesta IA; separar persistencia de efecto visual.

**ESTADO:** ESPERANDO PROPUESTA Y APROBACIÓN

### H05

**ID:** H05

**ÁREA:** Onboarding

**PROBLEMA:** Errores de carga/unión/seguimiento se silencian. completeOnboarding marca onboarded=true localmente aun si falla updatePreferences y navega igualmente. Recomendación de usuarios usa búsqueda literal a, no un recomendador.

**CAUSA:** catch vacíos y fallback local presentado como finalización.

**IMPACTO:** Alta de coherencia de datos

**ARCHIVOS AFECTADOS:** client/src/features/onboarding/Onboarding.jsx:37-124

**DEPENDENCIAS:** H09, V02; usersService, orbitsService, authStorage, PATCH /api/users/me/preferences

**TIPO:** REQUIERE APROBACIÓN

**RIESGO:** Alta de coherencia de datos

**SOLUCIÓN PROPUESTA:** Estados de error/reintento; si se permite omitir, diferenciar explícitamente omisión de guardado exitoso. No inventar recomendación personalizada. El fallo requiere decidir error/reintento/omisión y redirección visible. Preparar reproducción técnica; no modificar ese flujo sin pantalla de prueba aprobada.

**REQUIERE MI APROBACIÓN:** SÍ

**VALIDACIÓN:** 401/403/500/offline en cada paso; recargar y contrastar preferencias del servidor con cliente.

**ESTADO:** ESPERANDO PROPUESTA Y APROBACIÓN

### H06

**ID:** H06

**ÁREA:** npm workspaces

**PROBLEMA:** package.json admite >=20.0.0; el registro server del lock mantiene 20.x. npm ci emitió EBADENGINE en Node 22.22.3.

**CAUSA:** Metadatos del lock desincronizados.

**IMPACTO:** Media de reproducibilidad

**ARCHIVOS AFECTADOS:** server/package.json:engines; package-lock.json:9117; .github/workflows/ci.yml

**DEPENDENCIAS:** Ninguna; npm ci, Node y workflows con Node 20

**TIPO:** AUTÓNOMO

**RIESGO:** Media de reproducibilidad

**SOLUCIÓN PROPUESTA:** Decidir matriz soportada y regenerar metadatos del lock, sin actualizaciones indiscriminadas. Alinear lock con engines declarado; no cambiar por conveniencia el runtime de producción.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** npm ci limpio y pruebas en versiones realmente soportadas sin EBADENGINE.

**ESTADO:** CORREGIDO Y VALIDADO LOCALMENTE (Node 22.22.3); CI remoto no ejecutado

### H07

**ID:** H07

**ÁREA:** Árbol npm

**PROBLEMA:** npm ls --all --json falla (ELSPROBLEMS): ajv@6.15.0 invalid y @types/react faltante para @types/react-reconciler@0.28.9. npm audit informa 0 vulnerabilidades, lo que no valida peers.

**CAUSA:** Resolución que ignora peers; árbol instalado inconsistente aunque build/lint actuales pasan.

**IMPACTO:** Alta de calidad de dependencias

**ARCHIVOS AFECTADOS:** .npmrc; package-lock.json; client/package.json

**DEPENDENCIAS:** H06; ESLint/AJV y tipados del ecosistema React/Three

**TIPO:** AUTÓNOMO

**RIESGO:** Alta de calidad de dependencias

**SOLUCIÓN PROPUESTA:** Analizar cadenas exactas del árbol y resolver rangos/peers compatibles; no suprimir el error con otro ignore. Resolver peers con árbol mínimo compatible; evitar actualizaciones masivas. Validar .npmrc antes de retirarlo.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Instalación limpia, npm ls sin problemas, lint/build/tests; validar peers web sin añadir React Native innecesario.

**ESTADO:** CORREGIDO Y VALIDADO LOCALMENTE: npm ci + npm ls estrictos sin errores

### H08

**ID:** H08

**ÁREA:** Live / ensurePeer

**PROBLEMA:** Solo STUN público; no hay configuración TURN observada. La señalización real no garantiza media entre NAT/firewalls que requieren relay.

**CAUSA:** Conectividad WebRTC incompleta para producción heterogénea.

**IMPACTO:** Alta en redes restringidas

**ARCHIVOS AFECTADOS:** client/src/features/live/Live.jsx:17,107

**DEPENDENCIAS:** V02, EXT01; RTCPeerConnection, permisos de cámara/micrófono, Socket.IO, servicio STUN de Google

**TIPO:** BLOQUEADO

**RIESGO:** Alta en redes restringidas

**SOLUCIÓN PROPUESTA:** Diseñar provisión de TURN con credenciales temporales y diagnóstico de conexión; no inventar una URL TURN. Faltan TURN real/credenciales temporales y dos redes/dispositivos de prueba. Preparación técnica sin inventar proveedor. Indicadores nuevos requieren aprobación aparte.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Dos dispositivos/redes distintas, red corporativa, relay forzado, denegación de permisos y salida/desconexión.

**ESTADO:** BLOQUEADO: dependencia externa indicada

### H09

**ID:** H09

**ÁREA:** authStorage / interceptor de petición

**PROBLEMA:** getToken accede a localStorage/sessionStorage sin defensa, a diferencia de readStored. Reproducido: getter de almacenamiento bloqueado lanza SecurityError. Access y refresh tokens son accesibles a JS en Web Storage: riesgo de exposición ante XSS, no prueba de XSS existente.

**CAUSA:** Uso mezclado de helpers defensivos y acceso directo.

**IMPACTO:** Media de robustez; alta si existe XSS

**ARCHIVOS AFECTADOS:** client/src/services/authStorage.js:117-136; client/src/services/apiClient.js:22

**DEPENDENCIAS:** H06, H07; Hydrate, interceptores, login, Socket.IO

**TIPO:** AUTÓNOMO

**RIESGO:** Media de robustez; alta si existe XSS

**SOLUCIÓN PROPUESTA:** Unificar acceso seguro y definir degradación honesta; evaluar aparte migración de refresh a cookie HttpOnly con diseño CSRF/CORS. Corregir acceso defensivo al storage; no introducir sesión simulada, fallback persistente distinto ni cookies nuevas sin revisar contrato. Migración HttpOnly separada de robustez local.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Storage bloqueado/cuota excedida, login/logout/refresh y cambio entre cuentas; revisión XSS/CSP del frontend real.

**ESTADO:** IMPLEMENTADO Y VALIDADO EN PRUEBAS AISLADAS; browser real/E2E pendientes (V02/V04)

### H10

**ID:** H10

**ÁREA:** MotionProvider / SceneBackground

**PROBLEMA:** motionEnabled y sceneFrozen ignoran la preferencia del SO por defecto; main marca full si no hay elección. MotionProvider usa user. Comentarios contradictorios. El código documenta una decisión histórica del propietario, no una corrección accidental pendiente.

**CAUSA:** Políticas diferentes entre CSS, Three y Motion.

**IMPACTO:** Alta de accesibilidad

**ARCHIVOS AFECTADOS:** client/src/lib/motionPreference.js; client/src/main.jsx; client/src/three/SceneBackground.jsx:37-45; client/src/app/MotionProvider.jsx

**DEPENDENCIAS:** H03; matchMedia, localStorage, CSS data-k-motion y capa Three

**TIPO:** REQUIERE APROBACIÓN

**RIESGO:** Alta de accesibilidad

**SOLUCIÓN PROPUESTA:** Solicitar aprobación explícita para unificar política accesible: respetar SO salvo elección consciente del usuario. Política de animación afecta decisión visual histórica; presentar matriz SO/preferencia y prototipo antes de cambiar.

**REQUIERE MI APROBACIÓN:** SÍ

**VALIDACIÓN:** SO reduced/full × elección local ausente/full/reduced; todas las escenas y transiciones, sin WebGL.

**ESTADO:** ESPERANDO PROPUESTA Y APROBACIÓN

### H11

**ID:** H11

**ÁREA:** router de federación

**PROBLEMA:** Para usuario existente devuelve 501 FEDERATION_INBOX_NOT_IMPLEMENTED. WebFinger/actor/outbox no equivalen a federación bidireccional operativa.

**CAUSA:** No hay verificación de firmas/procesamiento de actividades entrantes en ese handler.

**IMPACTO:** Alta si se anuncia federación bidireccional

**ARCHIVOS AFECTADOS:** server/src/modules/federation/federation.routes.js:inbox

**DEPENDENCIAS:** V02, EXT02; User, federation.service, dominios públicos

**TIPO:** AUTÓNOMO

**RIESGO:** Alta si se anuncia federación bidireccional

**SOLUCIÓN PROPUESTA:** Mantener la limitación visible; implementar protocolo solo con alcance aprobado. No cambiar 501 por éxito falso. Implementación técnica solo con protocolo/seguridad definidos y pruebas reales de interoperabilidad. Mantener 501 hasta implementar de verdad; no prometer cierre en este bloque.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Firmas, replay, recepción real, permisos y consistencia de actor/outbox antes de habilitar recepción.

**ESTADO:** PENDIENTE

### H12

**ID:** H12

**ÁREA:** AdminCenter / load

**PROBLEMA:** Solicita página predeterminada con límite 25; no renderiza navegación paginada. Usuarios fuera de la primera página requieren búsqueda específica. App.jsx protege sesión, no rol; la API sí exige rol, por lo que no se afirma bypass.

**CAUSA:** Contrato paginado no completado en UI; autorización visual delegada a errores de API.

**IMPACTO:** Media funcional

**ARCHIVOS AFECTADOS:** client/src/features/admin/AdminCenter.jsx:15-25,95-141; client/src/services/adminService.js; server/src/modules/admin/admin.routes.js:PAGE_LIMIT

**DEPENDENCIAS:** V02, V04; GET /api/admin/users; requireAdmin

**TIPO:** REQUIERE APROBACIÓN

**RIESGO:** Media funcional

**SOLUCIÓN PROPUESTA:** Consumir metadata de paginación y mostrar estado 403 explícito; mantener autorización obligatoria en backend. Controles de paginación y estado 403 requieren propuesta AdminCenter; autorización backend se valida autónomamente en V04.

**REQUIERE MI APROBACIÓN:** SÍ

**VALIDACIÓN:** 26+ usuarios, última página, búsqueda y accesos como user/admin, sin mostrar 0 como resumen exitoso tras fallo.

**ESTADO:** ESPERANDO PROPUESTA Y APROBACIÓN

### H13

**ID:** H13

**ÁREA:** fanContext

**PROBLEMA:** Se escriben recuerdos de navegación, pero getLastProfile y getLastConversationUserId no tienen consumidores en código de aplicación. La finalidad del antiguo abanico no está integrada en la navegación actual.

**CAUSA:** Restos de diseño previo.

**IMPACTO:** Baja técnica

**ARCHIVOS AFECTADOS:** client/src/services/fanContext.js; client/src/features/users/Profile.jsx; client/src/features/messages/Messages.jsx

**DEPENDENCIAS:** H07; Imports y llamadas de Profile y Messages

**TIPO:** AUTÓNOMO

**RIESGO:** Baja técnica

**SOLUCIÓN PROPUESTA:** Eliminar setters/imports/módulo solo tras aprobar que esa funcionalidad histórica ya no es requisito; alternativamente integrarla con pruebas. Demostrar contratos/consumidores antes de eliminar; preservar rutas y todos los servicios públicos.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Búsqueda de referencias completa y regresión Perfil↔Mensajes; no borrar lógica por estética.

**ESTADO:** LIMPIEZA DE fanContext VALIDADA LOCALMENTE; JSX idéntico, aliases/APIs preservados

### H14

**ID:** H14

**ÁREA:** getAIProviderConfig

**PROBLEMA:** env.example comienza con un fence Markdown y omite variables documentadas en .env.example. VIDEO_MODEL tiene defaults distintos entre ejemplos. Gemini usa gemini-3.6-flash en código frente a gemini-2.5-flash en .env.example; disponibilidad real no verificada.

**CAUSA:** Plantillas duplicadas y defaults divergentes.

**IMPACTO:** Media de configuración

**ARCHIVOS AFECTADOS:** server/.env.example; server/env.example; server/src/config/aiProviders.js

**DEPENDENCIAS:** H07; dotenv, configuración de proveedores y scripts operativos

**TIPO:** AUTÓNOMO

**RIESGO:** Media de configuración

**SOLUCIÓN PROPUESTA:** Elegir una plantilla mantenida, normalizar formato y contrato documentado; validar catálogo real antes de cambiar modelo. Alinear plantillas conservando ambas rutas por compatibilidad; no inventar modelo válido ni sustituir proveedor. Catálogo real separado en EXT01.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Copiar plantilla a entorno aislado, validar variables requeridas y smoke real de cada proveedor sin exponer claves.

**ESTADO:** PLANTILLAS ALINEADAS Y PROBADAS; disponibilidad de modelos pendiente (EXT01)

### H15

**ID:** H15

**ÁREA:** apiClient / servicios de IA

**PROBLEMA:** Cliente impone 15 s globales; imagen y guion permiten 45 s al proveedor y video 30 s. Una operación que tarde más de 15 s puede continuar en backend tras timeout de UI.

**CAUSA:** Presupuestos de tiempo no alineados; riesgo estático comprobable, no se simuló una generación real.

**IMPACTO:** Alta de integración IA

**ARCHIVOS AFECTADOS:** client/src/services/apiClient.js:21; client/src/services/aiService.js; server/src/modules/image-ai/image.service.js:21; server/src/modules/script-ai/script.service.js:10; server/src/modules/video-ai/video.service.js:61

**DEPENDENCIAS:** H09, H14; Axios, OpenRouter, proveedor de video, historial de generaciones

**TIPO:** AUTÓNOMO

**RIESGO:** Alta de integración IA

**SOLUCIÓN PROPUESTA:** Definir contrato de trabajos asíncronos o timeout específico y cancelación/idempotencia; preservar resultados reales y evitar reintentos que dupliquen gasto. Alinear presupuestos por operación; mantener timeout normal de API, errores reales y no añadir reintentos automáticos de generación.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Generaciones reales lentas, recuperación por historial, cancelación, reintento y ausencia de duplicación/cobro repetido.

**ESTADO:** PRESUPUESTOS/RETRIES/POLLING CORREGIDOS Y PROBADOS LOCALMENTE; proveedor/hosting real pendiente

### H16

**ID:** H16

**ÁREA:** Bundle principal / capa 3D

**PROBLEMA:** Build real: JS principal 1113.68 kB (335.99 gzip), Canvas3D 971.64 kB (265.91 gzip), CSS 218.40 kB (41.05 gzip). Vite advierte chunks >500 kB. La capa 3D ya tiene lazy; no todas las rutas.

**CAUSA:** Imports eager de pantallas y cascada global grande.

**IMPACTO:** Media de rendimiento móvil

**ARCHIVOS AFECTADOS:** client/src/App.jsx; client/src/main.jsx; client/src/three/SceneBackground.jsx; client/vite.config.js

**DEPENDENCIAS:** H07, V01; React, Three, Motion, CSS global

**TIPO:** AUTÓNOMO

**RIESGO:** Media de rendimiento móvil

**SOLUCIÓN PROPUESTA:** Perfilar, dividir rutas manteniendo estados de carga/error y consolidar CSS con evidencia; no limitarse a subir chunkSizeWarningLimit. Medición/optimización no visual únicamente. Lazy routes con nuevos fallbacks o retirada de CSS se derivan a aprobación, no se aplican aquí.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Medir red/CPU y métricas en dispositivo móvil real, rutas frías/calientes y recuperación de errores de chunks.

**ESTADO:** PENDIENTE

### H17

**ID:** H17

**ÁREA:** Map de presencia / io

**PROBLEMA:** Presencia es explícitamente por instancia; no hay adaptador distribuido Socket.IO configurado. Los limitadores mostrados usan almacenamiento por defecto en memoria.

**CAUSA:** Arquitectura de instancia única.

**IMPACTO:** Alta al escalar a varias instancias

**ARCHIVOS AFECTADOS:** server/src/modules/messages/presence.js; server/src/server.js:Socket.IO y rateLimit

**DEPENDENCIAS:** H18, V02; Balanceador, sticky sessions, sockets, rate limits

**TIPO:** AUTÓNOMO

**RIESGO:** Alta al escalar a varias instancias

**SOLUCIÓN PROPUESTA:** Documentar y respetar límite de una instancia, o diseñar estado/adaptador compartido con pruebas; no agregar Redis sin aprobación. Documentar restricción de instancia única y validar límites. Adaptador distribuido depende de topología/servicio real EXT02, no Redis inventado.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Dos procesos, clientes repartidos, presencia/notificaciones/typing/salas y límites consistentes.

**ESTADO:** LÍMITE DE UNA INSTANCIA DOCUMENTADO; topología remota y multi-instancia pendientes

### H18

**ID:** H18

**ÁREA:** Hosting frontend separado de API

**PROBLEMA:** No hay archivos de despliegue/rewrite de Vercel/Cloudflare/Render versionados. El backend no sirve client/dist; npm start arranca solo API. La comprobación de despliegue en CI es continue-on-error. No se inspeccionó configuración remota efectiva.

**CAUSA:** Parte del contrato de producción depende de paneles externos y verificaciones no bloqueantes.

**IMPACTO:** Alta de reproducibilidad de producción

**ARCHIVOS AFECTADOS:** client/vite.config.js; server/src/server.js; .github/workflows/ci.yml; scripts/verify-deploy.sh

**DEPENDENCIAS:** H06, H07; VITE_API_URL, CLIENT_URL, dominio canónico, hosts preview y Socket.IO

**TIPO:** AUTÓNOMO

**RIESGO:** Alta de reproducibilidad de producción

**SOLUCIÓN PROPUESTA:** Documentar/versionar configuración verificable de hosting, distinguir preview/staging de producción y exigir puerta de release acordada. Revisar scripts y contrato técnico de hosting sin cambiar rutas/redirects visibles. Configuración remota y despliegue efectivo separados en EXT02.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** GET directo y recarga de cada deep link, CORS de hosts autorizados/ajenos, API y websocket por HTTPS; no afirmar que falta un rewrite remoto solo porque no está en Git.

**ESTADO:** CONTRATO LOCAL DOCUMENTADO; comprobación remota BLOQUEADA por TLS/DNS en este entorno

### V01

**ID:** V01

**ÁREA:** Calidad / CI

**PROBLEMA:** Lint limitado, ausencia de typecheck y advertencias de build no equivalen a calidad completa.

**CAUSA:** Scripts y reglas actuales cubren subconjunto del proyecto.

**IMPACTO:** Errores pueden escapar de puertas locales.

**ARCHIVOS AFECTADOS:** package.json; client/eslint.config.js; client/vite.config.js; .github/workflows/ci.yml

**DEPENDENCIAS:** H06, H07

**TIPO:** AUTÓNOMO

**RIESGO:** Media

**SOLUCIÓN PROPUESTA:** Reejecutar baseline por bloque, registrar omisiones; ampliar checks solo con pruebas y sin formateo masivo. TypeScript N/A hasta configuración aprobada técnicamente.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Lint/build/tests/check de sintaxis/git diff --check y revisión de archivos afectados.

**ESTADO:** REGRESIÓN ACTUAL: 197 servidor + 29 cliente + 238 UI aprobados; E2E/browser pendientes

### V02

**ID:** V02

**ÁREA:** Persistencia / E2E

**PROBLEMA:** 74 pruebas MongoDB omitidas en auditoría local.

**CAUSA:** No había instancia MongoDB real configurada en la ejecución anterior.

**IMPACTO:** No se certifica persistencia ni autorización E2E.

**ARCHIVOS AFECTADOS:** server/test/*.e2e.test.js; server/src/config/db.js; .github/workflows/kronos-e2e.yml

**DEPENDENCIAS:** H07; MongoDB real aislado disponible

**TIPO:** BLOQUEADO

**RIESGO:** Alta

**SOLUCIÓN PROPUESTA:** Usar instancia local/CI real con base temporal; nunca MongoMemoryServer ni URI de producción para tests destructivos. Revisar disponibilidad, no pedir credenciales en chat.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Ejecutar E2E sin omisiones y comprobar limpieza de bases temporales.

**ESTADO:** BLOQUEADO: sin MongoDB local/URI; descarga oficial falla TLS; 74 E2E omitidas

### V03

**ID:** V03

**ÁREA:** Regresión social y contratos

**PROBLEMA:** Publicaciones, comentarios, perfiles, biblioteca y notificaciones tienen implementación pero no certificación dinámica integral.

**CAUSA:** Pruebas UI aisladas y MongoDB pendiente.

**IMPACTO:** Riesgo de regresión de payload/permisos/persistencia.

**ARCHIVOS AFECTADOS:** server/test/social.integration.test.js; server/test/*.e2e.test.js; client/test-ui/*.spec.jsx; servicios y features correspondientes

**DEPENDENCIAS:** V01, V02

**TIPO:** AUTÓNOMO

**RIESGO:** Alta

**SOLUCIÓN PROPUESTA:** Validar flujos existentes uno por uno; abrir subtarea con reproducción si aparece error, sin inventar endpoints ni rediseñar.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Crear/leer/editar/borrar, audiencias, comentarios, follow, historial, notificaciones y recarga con backend real.

**ESTADO:** PENDIENTE

### V04

**ID:** V04

**ÁREA:** Sesiones / seguridad / permisos

**PROBLEMA:** Sesión y permisos requieren validación real adicional; no asumir bypass por ausencia de guard visual.

**CAUSA:** Autorización real reside en middleware/backend.

**IMPACTO:** Acceso indebido o pérdida de sesión si falla integración.

**ARCHIVOS AFECTADOS:** server/src/middleware/auth.js; server/src/middleware/requireAdmin.js; server/src/modules/auth/; client/src/services/apiClient.js; client/src/services/authStorage.js; client/src/App.jsx; client/test-ui/api-session-isolation.spec.js; client/test-ui/session-end.spec.jsx; server/test/auth*.js

**DEPENDENCIAS:** H09, V02

**TIPO:** AUTÓNOMO

**RIESGO:** Alta

**SOLUCIÓN PROPUESTA:** Probar revocación, rotación, reutilización de refresh, roles y bloqueos; corregir defectos reproducidos sin alterar controles.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** 401/403/503 reales; cambio de cuenta, expiración, sesión revocada y acceso user/admin.

**ESTADO:** EN CURSO: carreras de sesión/hidratación corregidas en pruebas locales; autorización real/E2E pendientes

### V05

**ID:** V05

**ÁREA:** Socket.IO / mensajes

**PROBLEMA:** Comunicación/presencia no comprobada entre dos clientes reales en esta fase.

**CAUSA:** Suites locales parciales; estado por proceso.

**IMPACTO:** Pérdida de eventos o membresía incorrecta.

**ARCHIVOS AFECTADOS:** server/src/server.js; server/src/modules/messages/; client/src/services/socket.js; server/test/live-signaling.e2e.test.js

**DEPENDENCIAS:** V02, V04, H17

**TIPO:** AUTÓNOMO

**RIESGO:** Alta

**SOLUCIÓN PROPUESTA:** Dos cuentas reales: DM/grupo/typing/entrega/lectura/reconexión, sin emitir éxito simulado.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** REST persistido más evento recibido; reconexión con refresh; salas rechazadas sin membresía.

**ESTADO:** PENDIENTE

### V06

**ID:** V06

**ÁREA:** Guardian / reproducibilidad

**PROBLEMA:** Guardian fuera de workspaces usa npm ci || npm install y carece de lock propio versionado.

**CAUSA:** Paquete separado no cubierto por instalación/pruebas raíz.

**IMPACTO:** CI no determinista y falsa cobertura de audit.

**ARCHIVOS AFECTADOS:** guardian/package.json; .github/workflows/kronos-guardian.yml; guardian/src/

**DEPENDENCIAS:** H07

**TIPO:** AUTÓNOMO

**RIESGO:** Media

**SOLUCIÓN PROPUESTA:** Crear lock dedicado compatible y usar npm ci sin fallback; validar sin publicar comentarios ni mutar GitHub.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** npm ci, npm ls, npm audit y node --check independientes; no ejecutar el bot con efectos.

**ESTADO:** LOCK Y WORKFLOW CORREGIDOS; instalación/árbol/audit/sintaxis locales válidos; ejecución del bot no realizada

### V07

**ID:** V07

**ÁREA:** Cifrado / uploads / backup

**PROBLEMA:** Rotar JWT_SECRET puede afectar cápsulas sin CAPSULE_SECRET; backups y durabilidad deben probarse.

**CAUSA:** Clave alternativa y almacenamiento disco/GridFS.

**IMPACTO:** Pérdida de datos o promesa de privacidad incorrecta.

**ARCHIVOS AFECTADOS:** server/src/modules/capsules/capsule.crypto.js; server/src/config/durableUploads.js; scripts/backup-verify.js; docs/KRONOS-CAPSULES.md

**DEPENDENCIAS:** H14, V02; infraestructura aislada para restore

**TIPO:** AUTÓNOMO

**RIESGO:** Alta

**SOLUCIÓN PROPUESTA:** Documentar migración y comprobar restore; no rotar secretos ni borrar datos existentes durante correcciones.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Cápsula cifrada legible, copia durable tras borrar solo copia local de prueba, backup/restore aislado.

**ESTADO:** VERIFICADOR JSON CORREGIDO Y PROBADO; restore BSON/GridFS/cápsulas pendiente de MongoDB real

### EXT01

**ID:** EXT01

**ÁREA:** Proveedores externos

**PROBLEMA:** No se validaron Gemini/OpenRouter/video/Google/Resend/TURN contra servicios operativos.

**CAUSA:** Faltan configuración efectiva, credenciales seguras y/o infraestructura/dispositivos.

**IMPACTO:** No puede declararse integración funcional.

**ARCHIVOS AFECTADOS:** server/src/config/aiProviders.js; server/src/config/openrouter.js; servicios IA/auth; client/src/features/live/Live.jsx

**DEPENDENCIAS:** H14, H15; proveedor real y permiso para consumir recursos

**TIPO:** BLOQUEADO

**RIESGO:** Alta

**SOLUCIÓN PROPUESTA:** Verificar preparación técnica y separar disponibilidad. Usar configuración segura existente; nunca inventar claves/modelos/URLs ni ejecutar consumos de producción sin alcance controlado.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Smoke real de cada proveedor, entrega de correo, OAuth real, generación persistida y live en redes distintas.

**ESTADO:** BLOQUEADO: dependencia externa indicada

### EXT02

**ID:** EXT02

**ÁREA:** Infraestructura remota / federación / escala

**PROBLEMA:** Topología, rewrites, CORS, restore, dominio y peers federados no comprobados remotamente.

**CAUSA:** Configuración de paneles/servicios ajena al checkout.

**IMPACTO:** Release o escalado podría fallar aunque compile.

**ARCHIVOS AFECTADOS:** scripts/verify-deploy.sh; .github/workflows/; server/src/modules/federation/; server/src/server.js

**DEPENDENCIAS:** H18; acceso operativo a entorno real aislado

**TIPO:** BLOQUEADO

**RIESGO:** Alta

**SOLUCIÓN PROPUESTA:** Documentar contrato y obtener evidencia remota de solo lectura; no cambiar URLs públicas, habilitar múltiples instancias ni afirmar interoperabilidad sin prueba.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Deep links existentes, HTTPS, CORS, sockets, headers, observabilidad y federación firmada en entorno controlado.

**ESTADO:** BLOQUEADO: API TLS curl 35 y frontend DNS curl 6 desde este entorno; no prueba de caída remota

### UI01

**ID:** UI01

**ÁREA:** Interfaz / responsive

**PROBLEMA:** Revisión visual real pendiente: controles pequeños, padding acumulado, hilos y formularios densos.

**CAUSA:** Cascada global y no se midió layout en navegador real.

**IMPACTO:** Ergonomía, foco, contraste o solapamientos desconocidos.

**ARCHIVOS AFECTADOS:** client/src/styles/fan-nav.css; client/src/styles/chrome-minimal.css; Comments.jsx; PostCard.jsx; pantallas D del informe

**DEPENDENCIAS:** V03; navegador real; aprobación por pantalla

**TIPO:** REQUIERE APROBACIÓN

**RIESGO:** Media/alta

**SOLUCIÓN PROPUESTA:** Generar estado actual + propuesta concreta + pantalla de prueba; empezar por alcance acotado, no propagar diseño.

**REQUIERE MI APROBACIÓN:** SÍ

**VALIDACIÓN:** 320/360/390/700/701/768/900/901/1024/1440px, teclado, safe area, scroll, foco, contraste, loading/empty/error/success.

**ESTADO:** ESPERANDO PROPUESTA Y APROBACIÓN

### UI02

**ID:** UI02

**ÁREA:** Componentes / superficies duplicadas

**PROBLEMA:** Comentarios, historial/biblioteca/jobs, CTA de creación y niveles de apoyo tienen solapamientos.

**CAUSA:** Responsabilidades compartidas con implementaciones distintas.

**IMPACTO:** Eliminar por similitud puede romper contratos o accesos.

**ARCHIVOS AFECTADOS:** Comments.jsx; PostCard.jsx; KairosHistory.jsx; MediaLibrary.jsx; VideoJobs.jsx; CreateHub.jsx; SupportDialog.jsx; support.routes.js

**DEPENDENCIAS:** V03, UI01

**TIPO:** REQUIERE APROBACIÓN

**RIESGO:** Alta

**SOLUCIÓN PROPUESTA:** Separar reutilización interna demostrable de cambios visibles; conservar rutas/APIs; propuesta individual si cambia control o composición.

**REQUIERE MI APROBACIÓN:** SÍ

**VALIDACIÓN:** Mismos permisos/payloads/acciones, revisión de consumidores y aceptación explícita del alcance visual.

**ESTADO:** ESPERANDO PROPUESTA Y APROBACIÓN

### REL01

**ID:** REL01

**ÁREA:** Release / cierre

**PROBLEMA:** No hay evidencia suficiente para declarar producción apta.

**CAUSA:** Hallazgos abiertos, dependencias externas y aprobaciones pendientes.

**IMPACTO:** Despliegue prematuro.

**ARCHIVOS AFECTADOS:** Plan maestro; CI; scripts de verificación; archivos modificados en cada bloque

**DEPENDENCIAS:** Todas las tareas que formen parte del alcance de release y aprobaciones correspondientes

**TIPO:** AUTÓNOMO

**RIESGO:** Alta

**SOLUCIÓN PROPUESTA:** Cerrar con evidencia por tarea; registrar pendientes y riesgos aceptados. No desplegar ni marcar terminado por build verde.

**REQUIERE MI APROBACIÓN:** NO (solo alcance técnico; dependencias externas no autorizan cambios visuales)

**VALIDACIÓN:** Todas las puertas del contrato de terminado; consola/browser/API/persistencia y pruebas reales; diff limpio sin basura experimental.

**ESTADO:** PENDIENTE

## Puertas de validación por bloque

- Dependencias: npm ci reproducible, npm ls sin ELSPROBLEMS, versiones de Node coherentes, audit sin confundir seguridad con compatibilidad.
- Lint/build/suites completas tras cada bloque importante; sintaxis backend y Guardian según archivos afectados; git diff --check.
- Pruebas enfocadas antes y después, incluyendo errores, rollback y regresiones.
- E2E de backend real en base aislada; omisión documentada ≠ aprobación.
- Rutas/acciones: suites existentes más prueba real donde se dispone; no modificar UI para hacer pasar test.
- Consola y responsive: browser real requerido para certificar; si no se ejecuta, se declara pendiente, aunque no se tocaran estilos.
- TypeScript: actualmente N/A, JS/JSX; no inventar resultado de tsc.
- Integraciones externas: evidencia real por proveedor; valores sensibles fuera del informe.

## Registro de aprobación visual

Ninguna aprobación recibida. Ninguna pantalla propuesta o implementada en este bloque de base técnica. Cuando se alcance una rama visual se registrará: pantalla, versión de propuesta activa, archivos, cambios y decisión literal; un reemplazo limpia la propuesta anterior sin tocar funcionalidades.

## Registro de ejecución

Plan creado y entregado antes de modificar código. A continuación solo se ejecutan tareas AUTÓNOMAS, documentando error → causa → archivo → función → corrección → nueva verificación.

### Bloque 1 — H06/H07 + puerta V01 (2026-09-24)

**Objetivo y archivos previstos antes del cambio:** metadatos Node, peers y lock; manifiestos, `.npmrc`, `package-lock.json` y CI. Riesgo: romper herramientas de frontend/Three. Sin cambios de diseño.

**ERROR → CAUSA:** `npm ls` fallaba por el peer opcional AJV ^8.12 de `@hookform/resolvers`, que resolvía al AJV 6 de ESLint, y por `@types/react` requerido por `@types/react-reconciler` (its-fine/Fiber). El lock de server conservaba `20.x` mientras package.json admite `>=20.0.0`.

**CORRECCIÓN:** dos devDependencies cliente explícitas para satisfacer esos contratos (`ajv` y `@types/react`); ESLint mantiene AJV 6 y el cliente obtiene AJV 8 en árboles separados. Lock alineado al engines existente de servidor, sin cambiar su runtime. `.npmrc` elimina legacy-peer-deps y activa strict-peer-deps. CI ahora ejecuta `npm ls --all` después de instalar.

**EVIDENCIA:** instalación limpia `npm ci` exit 0; `npm ls --all --json` exit 0; sin EBADENGINE; audit 0 vulnerabilidades. El lock no añade Expo/React Native ni cambia las versiones previas: solo incorpora los peers y transitivas necesarias. Lint/build exit 0; 187 tests servidor + 20 cliente Node + 200 UI aprobados; 74 E2E omitidos. JS/CSS generados en este bloque conservaron los hashes de la auditoría (sin modificación de app aún).

**LÍMITE:** probado en Node 22.22.3/npm 10.9.8; no se ejecutó GitHub Actions/Node 20 remotamente ni se declara compatible cualquier versión Node 20 inferior al mínimo de las herramientas frontend. El `engines` corregido pertenece al backend, no es una garantía del toolchain frontend completo.

### Bloque 2 — H14/H09 + puerta V01 (2026-09-24)

**Objetivo y archivos previstos antes del cambio:** las dos plantillas backend; `authStorage.js`, `apiClient.js` y tests de sus contratos. Riesgo alto por sesión; interfaces públicas conservadas y nuevo cuarto parámetro opcional en updateTokens. No se tocaron Auth.jsx, App.jsx ni JSX/CSS de pantallas.

**H14 / ERROR → CAUSA:** plantillas diferentes, fences Markdown, OPENAI_API_KEY sin consumidor y modelos Gemini/video divergentes.

**CORRECCIÓN:** `.env.example` es canónica; se conserva `env.example` con contenido idéntico por compatibilidad. Test exige igualdad y sintaxis dotenv. Gemini/video se dejan vacíos para heredar el default ya existente del código; no se cambia `aiProviders.js` ni se inventa disponibilidad del modelo. El placeholder OPENAI_API_KEY se retira únicamente de la plantilla: búsqueda previa en client/src, server/src, scripts y workflows no encontró consumidor. Ningún `.env` efectivo ni credencial fue modificado.

**H09 / ERROR → CAUSA:** lecturas y escrituras directas lanzaban errores; guardado/rotación podían dejar un par parcial. Además, Auth envía `refreshExpiresAt` y el almacenamiento solo leía `expiresAt`; la renovación no persistía la nueva caducidad ni verificaba éxito antes de emitir refreshed.

**REPRODUCCIÓN:** primero se agregaron nueve tests de storage; los nueve fallaron antes de la corrección (10 anteriores pasaban). Tres tests iniciales de integración aislada apiClient/storage también fallaron antes del cambio al interceptor.

**CORRECCIÓN:** lectura defensiva por operación; guardar en el storage elegido o propagar error tipado `SESSION_STORAGE_UNAVAILABLE`, nunca cambiar “recordar” ni simular persistencia. Escritura parcial invalida/limpia claves; logout intenta limpiar todas sin lanzar. Invalida en memoria exclusivamente handles de Storage que no deben reutilizarse, no almacena una sesión alternativa. Expiración acepta el nombre real del contrato y el histórico; rotación guarda refreshExpiresAt. API anuncia renovación solo si se persistió. Una respuesta tardía no escribe sobre otra sesión ni un 401 de renovación anterior cierra la nueva cuenta.

**PRUEBAS:** 19 tests de authStorage; 5 tests apiClient/storage con fallos explícitos; regresión de Auth Google y session-end; 2 tests de plantillas. Suite completa tras el bloque: servidor 189 aprobados/74 omitidos, cliente Node 29 aprobados, UI 205 aprobados (41 archivos); lint/build exit 0. Los dobles de Storage/axios son inyección de fallos unitaria, no se usan en producción ni certifican MongoDB/Google.

**LÍMITES:** falta navegador real y E2E autenticado. Si el navegador impide borrar físicamente storage, se evita reutilizarlo durante esta carga, pero no se promete borrado tras recarga: sigue siendo necesaria la revocación backend. No se migró a HttpOnly ni se declara resuelto todo riesgo XSS. No se modificó el flujo visible de onboarding; H05 continúa esperando su propuesta/aprobación.

### Bloque 3 — V06: instalación independiente de Guardian (2026-09-24)

**Objetivo/archivos/riesgo previos:** `guardian/package-lock.json` y workflow dedicado; asegurar npm ci sin fallback. Riesgo: resolver transitivas de Octokit; no ejecutar bot con efectos en GitHub.

**ERROR → CAUSA:** faltaba lock dedicado y el workflow ocultaba el fallo de npm ci mediante npm install.

**CORRECCIÓN:** lock dedicado generado para el manifiesto existente (sin cambiar versión declarada de Octokit). Workflow usa solo npm ci, después npm ls y validación de sintaxis.

**EVIDENCIA:** npm ci --prefix guardian instala 17 paquetes; npm ls exit 0; npm audit 0 vulnerabilidades; node --check de todas sus fuentes exit 0. No se arrancó Guardian ni se escribieron PRs, comentarios, commits o configuración remota.

### Verificación consolidada de esta entrega

| Comprobación | Resultado real |
|---|---|
| npm ci raíz (tras cambios de dependencias) | exit 0; sin EBADENGINE |
| npm ls --all raíz y Guardian | ambos exit 0 |
| npm audit raíz y Guardian | ambos 0 vulnerabilidades reportadas |
| npm run lint | exit 0 |
| npm run build | exit 0; warnings Zod y chunks grandes continúan |
| npm test servidor | 263 totales: 189 pass, 0 fail, 74 skip |
| npm test cliente Node | 29 pass, 0 fail |
| Vitest UI/servicios | 205 pass, 41 archivos, 0 fail |
| Sintaxis server/src y guardian/src | exit 0 |
| git diff --check | exit 0 |
| Rutas/navegación | suites existentes incluidas en Vitest; router/modelo/controles no modificados |
| Persistencia backend / providers | no certificados; MongoDB/externos pendientes |
| Consola/responsive/browser real | no ejecutados; no convertir jsdom en aprobación visual |
| TypeScript | N/A: JS/JSX, sin typecheck propio |

**Cambios visibles autorizados:** ninguno. **Cambios de pantallas/estilos/menús/rutas ejecutados:** ninguno. El bundle CSS conserva `index-BSPtnK3U.css` (218.40 kB) de la auditoría; no sustituye comparación visual pero confirma que no se editó CSS.

**Warnings conservados:** deprecaciones transitivas whatwg-encoding/node-domexception; anotaciones Zod eliminadas por Rollup; bundle principal 1114.23 kB y Canvas3D 971.64 kB. No se han ocultado ni elevado umbrales para simular resolución de H16.

### Próximo bloque autónomo pendiente (sin pedir aprobación visual)

Continuar el orden del plan: H18/H17 (contrato técnico local de hosting y restricciones de instancia) → H13 (solo eliminación con prueba de ausencia de contratos) → preparación V02/V07. Después H15 y validaciones funcionales. No se ha iniciado una propuesta de interfaz: al llegar a H05/H04/H12 se preparará y mostrará la prueba correspondiente antes de cambiar su interfaz o redirección.

**Definición de terminado:** ninguno de estos resultados locales equivale a certificar el proyecto completo ni a cerrar los 18 hallazgos. H09/H14 conservan explícitamente sus validaciones externas pendientes. No se desplegó la aplicación y no se requiere una aprobación visual para continuar los pendientes técnicos independientes.


### Continuación — bloques 4 y 5 (2026-09-24)

Se continúa por autorización técnica del usuario (“Sigele”), sin interpretarla como aprobación visual. Los resultados de las entregas anteriores se conservan arriba como histórico; la matriz refleja el estado actual.

#### H18/H17 — contrato operativo, sin fingir una corrección de hosting

**Archivos afectados:** `docs/CONTRATO-OPERACION-KRONOS.md`, README y este plan. **Objetivo/riesgo:** hacer trazable el contrato local y evitar desplegar varias instancias que no comparten presencia/salas/límites; no cambiar plataformas, dominios, headers o navegación sin conocer la infraestructura.

Se documentaron comandos reales, build/API separados, configuración de entorno, riesgo del fallback API en previews Vercel, WebSocket/CORS, una instancia de API, GridFS, claves de cápsulas y verificación/restore. No se añadió Redis, un manifiesto de plataforma especulativo ni nuevos endpoints/configuraciones efectivas.

**Validación externa intentada (solo lectura, sin credenciales):** API `/health`: curl exit 35 / HTTP 000 (fallo TLS); raíz frontend: curl exit 6 / HTTP 000 (no resuelve DNS). Es una limitación de comprobación desde este entorno, no evidencia suficiente de caída global. No se ejecutó un despliegue. H18/H17 NO quedan cerrados integralmente.

#### H13 — retirada demostrada de contexto muerto del abanico

**Problema/causa:** `fanContext.js` retenía dos variables de módulo. Dos efectos las escribían, pero ni `getLastProfile` ni `getLastConversationUserId` tenían lectores en cliente, tests, servidor, scripts o workflows. No persistía, emitía eventos ni exponía una ruta/API/global. El paquete cliente es privado, no exporta ese módulo como biblioteca. Búsqueda de referencias exactas previa: solo definiciones, import y escritura de Profile/Messages.

**Archivos/funciones afectados:** eliminado `client/src/services/fanContext.js`; retirados únicamente su import/efecto en `features/users/Profile.jsx` y `features/messages/Messages.jsx`. El ref `hydratedProfileRef` era exclusivo de esa escritura y se retiró junto al efecto. Los demás useRef/useEffect y acciones se conservan.

**Rutas consumidoras:** `/profile`, `/profile/:username`, `/users/:id`, `/messages`, `/messages/:userId`. Ninguna se elimina ni redirige; los destinos reales de Perfil/Mensajes no dependían de esos valores. No se borraron otros exports candidatos de servicios o APIs públicas.

**Riesgo/validación:** bajo tras demostrar ausencia de lectura, pero posible regresión en consumidores; se extrajeron nodos JSX con Babel antes/después y sus hashes coinciden exactamente. 28 pruebas enfocadas de perfil, mensajes, navegación y consistencia de rutas pasan. Build/lint y suite completa pasan. Búsqueda posterior no encuentra referencias runtime o de tests al módulo retirado. La evidencia AST no sustituye pruebas de navegador real, que siguen pendientes.

#### V02/V07 — bloqueo Mongo y error real del verificador de respaldos

**Dependencia externa:** no hay mongod/Docker ni URI de pruebas configurada. HEAD a descarga oficial `fastdl.mongodb.org` falla TLS (curl 35). No se instaló MongoMemoryServer ni se reemplazó persistencia real con mocks. E2E/restore quedan bloqueados.

**ERROR → CAUSA → ARCHIVO → FUNCIÓN:** `scripts/backup-verify.js` → `runCheck`: intentaba `verifyMongodumpBackup` antes de JSON y confiaba en `.catch`; el helper usa `process.exit(1)`, que no puede ser capturado. Por eso el respaldo JSON anunciado como verificable no pasaba `--check`.

**Corrección técnica:** leer `manifest.json` y seleccionar explícitamente json/mongodump; rechazar modo desconocido sin fallback que esconda corrupción. Ningún formato de backup existente se cambia ni se inventa un respaldo válido. Este cambio estaba dentro de preparación V07 y fue anunciado antes de editar.

**Pruebas:** se añadieron seis casos que ejecutan el CLI en subprocesos sobre archivos temporales. Antes del arreglo fallaban JSON válido, modo desconocido y conteo JSON; después pasan los ocho tests de backup existentes+nuevos, incluidos checksum/tamaño corrupto. Los fixtures de archivo no son un mongodump real ni prueban restauración.

**Límite adicional detectado y documentado:** el backup JSON utiliza JSON.stringify y no EJSON; no se garantiza restitución de tipos BSON, índices ni binarios/GridFS. Verificar checksums NO es restaurar. Mantener recuperación completa pendiente de dump/restore real en base aislada y prueba de claves de cápsulas; no se rotaron secretos ni se tocó ninguna base.

#### H15 — presupuestos IA sin reintentos implícitos de generación

**Archivos previstos/afectados:** `client/src/services/aiService.js`, `server/src/config/openrouter.js`, `server/src/modules/ai-core/services/model.service.js` y nuevos tests `client/test-ui/ai-request-budget.spec.js` / `server/test/ai-request-budget.contract.test.js`. **Riesgo:** modificar tiempos de espera/carga al proveedor; se conservan payloads, URLs, modelos y UI. El timeout global de apiClient sigue en 15s.

**ERROR → CAUSA:** 15s de cliente eran menores que llamadas proveedor de 30/45s. Imagen además puede consultar catálogo y descargar resultado. El cliente SDK OpenRouter de guion heredaba retries; Gemini tampoco tenía timeout/reintentos acotados en el constructor. Esto permitía repetir trabajo tras errores sin un contrato de idempotencia.

**Corrección:** imagen 120s, guion/chat 60s, creación/consulta de video 45s; historiales y demás APIs mantienen default. OpenRouter usa maxRetries=0 por defecto; Gemini usa HttpOptions reales del SDK instalado (`timeout:45000`, `retryOptions:{attempts:1}`: incluye el intento inicial). No se añadió fallback de generación ni resultado simulado. Los errores se propagan por mecanismos existentes.

**Polling:** los intervalos existentes son de 5s; aumentar espera podía acumular GETs de estado. `getVideoJob` ahora comparte únicamente la petición en curso por job y token, la elimina al resolver/rechazar y no reutiliza datos entre tokens. Una respuesta vieja no elimina la entrada de la sesión nueva. No cachea resultados ni cambia el intervalo/control de ninguna pantalla; no deduplica POSTs de generación.

**Pruebas rojo→verde:** dos contratos backend fallaron antes (retries OpenRouter y opciones Gemini), cinco presupuestos cliente fallaron antes, y dos nuevos casos de polling fallaron antes de deduplicar. Ahora pasan dos contratos backend y doce casos cliente. El test OpenRouter usa SDK y HTTP real contra un servidor LOCAL que responde 503 y comprueba un solo intento; no certifica conexión al proveedor externo. Gemini usa doble explícito de constructor para inspeccionar opciones y propagación del error. No hay dobles en implementación productiva.

**Límites pendientes:** no garantiza duración absoluta del backend (persistencia/red), ni cancelación upstream, ni idempotencia ante reintento manual, ni soporte del proxy/hosting para 120s. No se probó generación facturable real. Corresponde comprobar historial/estado antes de reenviar y validar el presupuesto con infraestructura/proveedores. No se crearon jobs ficticios para aparentar un flujo asíncrono.

### Verificación consolidada de la continuación

| Comprobación | Resultado |
|---|---|
| npm run lint | exit 0 |
| npm run build | exit 0; warnings de chunks/Zod permanecen |
| npm ls --all | exit 0 |
| npm test servidor | 271 totales: 197 pass, 0 fail, 74 skip |
| npm test cliente Node | 29 pass, 0 fail |
| Vitest | 217 pass en 42 archivos, 0 fail |
| node --check de scripts/servicios modificados | exit 0 |
| git diff --check | exit 0 |
| JSX de Perfil/Mensajes antes vs después | idéntico, sin cambios de controles o destinos |
| CSS generado | mismo hash index-BSPtnK3U.css que en auditoría |
| E2E/restore/proveedores/browser real | pendientes, no certificados |

**Resultado:** 443 pruebas aprobadas; las 74 omitidas NO se contabilizan como aprobadas. Ninguna pantalla/propuesta visual se implementó ni aprobó en esta continuación. No se modificaron rutas, estilos, menús, flags visibles ni animaciones. Los cambios en dos archivos JSX fueron eliminación de efectos muertos, no modificación del árbol visual.

**Próximo alcance técnico:** continuar V04/V03/V05 con errores reproducibles y pruebas aisladas donde proceda; cierre integrado depende de V02. Las propuestas H05/H04/H12/UI01 siguen separadas y sin aprobación. No se declara producción apta.


### Continuación — bloque 6: aislamiento asíncrono de sesiones (V04, 2026-09-24)

**Objetivo y riesgo:** impedir que solicitudes ya identificadas con A entreguen datos, renueven, cierren o envíen operaciones con las credenciales de B después de un cambio de cuenta. Riesgo alto por tocar interceptores comunes y arranque; se conserva el contrato HTTP, las rutas, los controles y la composición visual. Dependencias: Axios, almacenamiento de sesión y App. No se modificó mensajería en este bloque.

**Trazabilidad error → causa → archivo/función → corrección → reverificación:**

| Error reproducido / escenario | Causa y ubicación | Corrección y prueba |
|---|---|---|
| 401 de A cierra B | `apiClient.js`, interceptor de respuesta: decide con la sesión vigente al recibir, no con la emisora | Revisión de sesión estampada en solicitud; respuesta obsoleta rechazada con `CanceledError` sin renovar/cerrar B |
| 200 de A entrega datos tras iniciar B | Mismo interceptor no verificaba pertenencia | Cancelación local del resultado antiguo; prueba de respuesta privada demorada |
| POST de A esperando renovación sale con credenciales de B | Interceptor de solicitud vuelve a leer tokens después de esperar | Verificar revisión después del await, antes de enviar; adaptador no se invoca en la prueba |
| B comparte renovación pendiente de A | Promesa global no distinguía cuenta | `refreshFlight` por revisión y refresh token; limpieza en finally solo si sigue siendo ese vuelo |
| Hidratación vieja elimina B | `App.jsx`, `hydrate`: `active` solo controlaba desmontaje, no cambio de sesión durante await | Capturar revisión inicial y comprobarla antes de mutar almacenamiento/estado tras renovación o `/auth/me` |
| Riesgo de rotación innecesaria por 401 tardío de la misma sesión | Respuesta puede llegar después de otra renovación | Comparar token enviado con token vigente y reintentar una sola vez; prueba de no efectuar segunda renovación |

`authStorage.js`: `getSessionRevision()` expone un contador local incrementado por `clearSession` (también llamado desde `saveSession`); `updateTokens` conserva la identidad durante rotaciones normales. No se persiste ni transmite el contador. El finally de A no elimina la renovación pendiente de B, comprobado con orden de resolución controlado.

**Evidencia roja → verde:**
- `api-session-isolation.spec.js`: 4 fallos / 3 pases iniciales; ahora 9/9, incluyendo dos comprobaciones adicionales de rotación y limpieza de vuelos.
- `session-end.spec.jsx`: nueva reproducción de hidratación falló (`new-user` sustituido por sesión nula); ahora 3/3, manteniendo casos anteriores de cierre irrecuperable y renovación/socket.
- Regresión focal con `session-storage-failure.spec.js`: **17/17**.
- Se restauraron dependencias con `npm ci` (el intento previo no arrancó por `vitest: not found`); instalación exitosa, sin relajar peers ni cambiar versiones.

**Regresión completa posterior:**
- `npm test`: servidor **197 aprobadas / 74 omitidas**, cliente Node **29 aprobadas**, Vitest **227 aprobadas / 43 archivos**. Total **453 aprobadas, 0 fallidas, 74 omitidas**.
- `npm run lint`, `npm run build`, `npm ls --all` y `git diff --check`: salida 0.
- Árbol JSX completo de `App.jsx` comparado mediante parser Babel antes/después: idéntico. No se cambiaron definiciones de rutas/redirects ni estilos. CSS compilado conserva `index-BSPtnK3U.css` (218.40 kB).
- Persisten advertencias de anotaciones PURE de Zod y chunks mayores a 500 kB; no se ocultaron ni se elevaron umbrales.
- Logs locales: `/home/user/kronos-isolation-{green,full,lint,build,tree}.log`, `/home/user/kronos-hydrate-red.log`.

**Límites y pendientes, V04 NO TERMINADA:** adaptadores unitarios y jsdom ejercitan interceptores/App reales, pero no certifican MongoDB, navegador real, roles administrativos ni proveedor remoto. El contador es del módulo/pestaña, no sincronización entre pestañas. Cancelar la entrega local no aborta ni revierte una operación ya recibida por backend. La identidad se captura al ejecutar el interceptor, no se certifica la ventana entre invocar Axios y ejecutar ese interceptor. Los fallos transitorios de refresh estaban pendientes al cerrar este bloque y se abordan en el bloque 7. Siguen pendientes otros callbacks asíncronos de cierre y el cambio de cuenta entre pestañas. La prueba de hidratación verifica preservación del almacenamiento, no un flujo completo de login B desde navegador. Continúan las 74 omisiones por falta de MongoDB y las limitaciones de despliegue/proveedores registradas anteriormente. Ninguna propuesta visual recibió aprobación ni fue implementada.


### Continuación — bloque 7: indisponibilidad de renovación (V04, 2026-09-24)

**Alcance anunciado:** `client/src/services/apiClient.js`, hidratación en `client/src/App.jsx` y sus pruebas. Objetivo: distinguir indisponibilidad del transporte de revocación real. Riesgo alto por interceptores compartidos; sin cambios de rutas, JSX, CSS, controles ni despliegue. Dependencias existentes: Axios/authStorage; no se añadieron paquetes. `npm ci` restauró herramientas ausentes respetando el lock (el primer intento no ejecutó Vitest).

**Error → causa → corrección:**
- Un 401 de operación seguido de red caída, timeout o 503 al renovar terminaba borrando la sesión: `refreshSession` devolvía `null` para todos los errores y el interceptor lo interpretaba como rechazo definitivo.
- Con token expirado, el interceptor previo al envío continuaba la operación pese a no haber renovado. Ahora el fallo rechaza la operación antes de invocar el adaptador.
- `App.hydrate` interpretaba el mismo `null` como expiración y borraba credenciales al arrancar sin servicio. Ahora captura el rechazo de renovación y termina la hidratación sin borrar credenciales ni ejecutar `/auth/me` como si la renovación hubiera funcionado.
- `refreshSession` conserva `null` para ausencia/cambio de sesión, rechazo 401 autoritativo y fallo de persistencia ya invalidado. Propaga fallos de transporte/servidor y respuesta sin token. El 401 real sigue limpiando y notificando una sola vez.
- `refreshForRequest` crea un error Axios por solicitud con su propio config, sin mutar el error compartido entre operaciones concurrentes. Mantiene la comprobación de revisión para no atribuir un fallo viejo a la cuenta nueva.
- No hay reenvío automático tras estos fallos ni éxito simulado; otra solicitud posterior puede intentar renovar de nuevo. Se comprobó que el único consumidor productivo de `renewSession` es `App` y se adaptó a su contrato de rechazo.

**Pruebas:** ocho nuevas reproducciones fallaron antes del cambio (red/timeout/503 en preflight y después de 401, siguiente intento e hidratación). Pasaron después. Se añadieron además comprobaciones de refresh realmente revocado, respuesta sin token y fallo concurrente con config independiente. Las pruebas usan adaptadores/dobles explícitos; no representan una caída inducida en producción ni validación del proveedor remoto.

**Regresión final:** `npm test` salida 0: servidor 197 aprobadas y 74 omitidas; cliente Node 29 aprobadas; Vitest 238 aprobadas en 43 archivos. **Total 464 aprobadas, 0 fallidas, 74 omitidas**. `npm run lint`, `npm run build`, `npm ls --all`, `git diff --check`: salida 0. CSS compilado conserva `index-BSPtnK3U.css`; persisten avisos de Zod/PURE y chunks grandes, sin ocultarlos. Logs: `/home/user/kronos-transient-{red,green,full,lint,build,tree}.log` (el log focal verde precede las tres pruebas finales, incluidas en la regresión completa).

**Límites:** preservar credenciales no acredita autorización ni conexión: backend sigue decidiendo el acceso y las operaciones fallan realmente. No se incorporó un nuevo estado visual de desconexión ni temporizador de reintento de hidratación; requeriría tratarlo como propuesta separada si altera interfaz. Un timeout puede ocurrir después de que backend haya rotado el refresh; no se certifica recuperación de una rotación cuyo resultado se perdió. V04 continúa en curso por aislamiento entre pestañas, ventanas/callbacks restantes, autorización integrada, navegador real y MongoDB. Las 74 omisiones no se contabilizan como aprobadas y no se declara producción lista.

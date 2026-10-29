# Pendientes para dar por terminado kronos-space.com

Cómo se lee: `[x]` es algo terminado y verificado, con su evidencia en la misma
línea. `[ ]` es algo que falta. Nada se marca por "debería funcionar".

Marcador de hoy: **50 terminadas y 37 pendientes**: las que faltan se dividen
entre lo que depende de una decisión o una credencial tuya y lo que es del acta de
cierre (se marca el día del congelado final). Actualizado el 29 de octubre de 2026.

## Terminado y verificado (29 de octubre de 2026)

- [x] Verificación de producción del bloque C que se puede verificar, y auditoría de
  filtración de secretos. Leído del servicio real (`/health`): `environment:
  production` con `environmentDeclared: true`, `autoIndex: false`, `database:
  connected`, `build.commit = 03bccc0` en `main` y `traceable: true` — los dos puntos
  que pedían «real de producción leído y registrado» quedan cerrados con su marca
  de tiempo. Leído de la API de Vercel: el proyecto del frontend tiene 3 variables,
  `VITE_API_URL` apunta a `https://api.kronos-space.com/api` y el despliegue de
  producción salió del mismo commit que el backend (ninguna de las dos mitades del
  despliegue corre versión distinta). Comprobado el cruce de Google: el Client ID
  que Vercel compila y el que lee el servidor son idénticos, y la prueba diferencial
  contra el endpoint de autorización (400 `redirect_uri_mismatch` con el ID del
  sitio, 401 `invalid_client` con uno inventado) demuestra que el cliente existe y
  está activo. Para lo que no se puede leer desde fuera se añadió una sonda de
  lectura sin costo —`npm run probar:proveedores`, en `scripts/lib/probeaProveedores.js`
  con 12 casos en `server/test/probar-proveedores.contract.test.js`— que consulta a
  Resend, OpenRouter y Gemini sus endpoints de metadatos y **no aprueba lo que no
  puede comprobar**: clave de crédito gratuito no dice «facturación OK», dominio sin
  verificar es `FALLA`, `VIDEO_API_URL` en `http` es `FALLA`, Client IDs desparejados
  son `FALLA`, sin clave no se toca la red y ningún valor se imprime. El `health`
  publica ahora `trustProxy` con el contrato de claves fijado, para que el punto de
  `TRUST_PROXY` sea medible sin disparar 429 contra la gente. Auditoría de secretos:
  400 revisiones del historial (el clon era de un solo commit y hubo que traerlas),
  árbol de trabajo con lo sin registrar, bundle compilado con valores canario en las
  once variables del servidor y el índice de código del repo público — **cero**
  coincidencias de forma de secreto; las 10 apariciones de cadenas de conexión son
  marcadores de pruebas. Único hallazgo del panel: `MONGODB_URI` vive en el proyecto
  de frontend y Vercel la marca `readable-secret`; no llega al navegador (probado con
  el canario), pero es un secreto en el proyecto equivocado y queda pendiente
  quitarla. Registro completo en `docs/PRODUCCION-VERIFICACION-2026-10-29.md`, y en
  `docs/production-access.md` la sección 4bis con el `TRUST_PROXY`.
  **Lo que esta pasada no cierra, y por qué:** los cinco puntos de proveedor con
  «probado» (correo recibido, generación facturada, chat real, trabajo de video)
  cuestan dinero o escriben; el usuario de solo lectura en Atlas; el inicio de
  sesión real con una cuenta de Google; y el panel de Render (no hay conector y el
  sandbox solo tiene salida a github.com, npmjs y pypi). Los `smoke-test.sh` no se
  corrieron contra producción ni siquiera teniendo forma: crean un usuario temporal
  en la base que toca.

- [x] Centro de ayuda público (`/ayuda`) — una pantalla de texto que se puede leer
  sin cuenta, fuera del árbol protegido junto a los tres documentos legales y al
  estado del servicio. No es un folleto: la lista de pantallas se **genera**
  recorriendo `NAV_GROUPS` (ningún destino puede quedarse sin explicación sin romper
  un test), la tabla de atajos se importa de `ShortcutsModal` en vez de copiarse, y
  las secciones de cuenta, sesiones, privacidad, moderación y límites dicen lo que
  el código hace — incluidos los que no hace (apoyos ★ sin pasarela, video sin
  proveedor, catálogos vacíos, tiempo real en una instancia, un solo idioma). Sus
  enlaces van solo a rutas públicas, porque un enlace que rechaza al visitante no es
  ayuda. Enlazada desde el pie del acceso, desde el panel de atajos (`?`) y desde el
  404. Evidencia: `client/test-ui/ayuda-publica.spec.jsx` (7 casos sobre el router
  real, sin sesión), `client/test-ui/block-c-responsive-ergonomics.spec.jsx` (el
  panel enlaza la ayuda) y `client/test-browser/paginas-publicas.spec.js` (ahora
  cinco rutas: montaje sin sesión, 320 px sin desbordar e ida y vuelta
  acceso↔ayuda; adaptados y con `node --check`, la verificación en navegador
  corresponde al job `browser`, que necesita Chromium).
  De paso, un agujero del `ci` descubierto al sellar esta fase:
  `scripts/ci/barrido-utilidades.mjs` tomaba su corpus de `git ls-files`, así que
  **no barría ningún archivo nuevo todavía sin registrar** —la pantalla que justo
  podía traer una clase sin regla— y reventaba con `ENOENT` si el índice aún listaba
  un archivo ya borrado en el árbol. Ahora recorre `client/src` en disco (180
  archivos revisados en vez de los que estuvieran indexados). Sigue en verde y
  conserva su lista informativa de `k-*` sin regla propia (6 usos preexistentes en
  Capsules, ModerationCenter, Settings y PostCard), que no es un fallo y no se borra.
- [x] Proyectos por pieza, verificado de la pantalla a la base — el tablero guarda
  las cuatro piezas juntas: guion y escenas (`script` por escena), tomas
  (`mediaUrl`/`mediaType` por escena, con su previsualización), música de la pieza
  (`musicTitle`/`musicUrl`) y versiones congeladas con etiqueta y comparación
  A/B escena por escena. Estaba implementado y no estaba probado en la parte de
  tomas y música: un campo que dejara de viajar en el payload no lo avisaba nada.
  Evidencia: `client/test-ui/projects.spec.jsx` (13 casos, 1 nuevo que exige que
  la toma de la escena 1, la pista y su título lleguen juntos a `updateProject`),
  y en el servidor `server/test/projects.contract.test.js` (4 casos sobre el
  schema: `enumValues` del formato con `panoramica`, instantánea con los seis
  campos, topes `MAX_SCENES`/`MAX_VERSIONS` e índices).
- [x] Correo verificado como requisito de publicación, encendible por despliegue —
  `REQUIRE_VERIFIED_EMAIL_TO_POST=true` hace que `POST /api/posts` y
  `POST /api/posts/:id/repost` respondan `403` con `code=correo_no_verificado` y
  el compositor ofrezca el enlace a Verificación de correo sin borrar lo escrito.
  Default apagado y por escrito por qué: verificar exige enviar, enviar exige
  `RESEND_API_KEY`, y una guarda imposible de cumplir no filtra spam, cierra el
  producto. No aplica a comentarios, reacciones ni mensajes directos: corta el
  brote en el feed, no la conversación uno a uno. Las cuentas de Google nacen
  verificadas (lo hace el registro, no esta política). Evidencia:
  `server/src/config/postingPolicy.js`, 7 casos puros en
  `server/test/posting-policy.contract.test.js`, 3 casos e2e en
  `posting-policy.e2e.test.js` (se saltan sin Mongo, corren en CI), 5 casos del
  compositor en `client/test-ui/posting-policy.spec.jsx`, la variable declarada en
  `server/.env.example` con el barrido `env-examples.contract.test.js` en verde.
- [x] Criterio de «cuenta nueva» aplicado en la cola de moderación —
  `server/src/modules/moderation/newAccountPolicy.js` decide con campos que existen
  (`createdAt`, `avatar`, `bio`, `followers`) y una ventana de 7 días; la cola los
  anota (`cuentaNueva`) y ordena la página con los casos nuevos primero. **No
  filtra**: retirar reportes de la cola por la edad del dueño escondería reportes,
  y sin `createdAt` el panel dice «antigüedad sin dato» en vez de fingir una cuenta
  vieja. El panel muestra la edad y las señales, con la ventana leída del servidor.
  Evidencia: 8 casos puros en `server/test/moderation-new-account.contract.test.js`,
  aserciones sobre la anotación real añadidas a `server/test/block-007-016.e2e.test.js`
  y el caso `038b` en `client/test-ui/block-009-015.spec.jsx`.
- [x] Plantillas de formato: cuatro, y el cuarto no se cae al guardar — se sumó
  **Panorámica 21:9** a `PLANTILLAS` (con sus tres rótulos), a `NOMBRE_FORMATO`
  (de donde sale el `<select>` de Proyectos) y al enum `FORMATOS` de `Project.js`;
  sin ese último paso `parseFormat()` habría convertido el formato en `libre` en
  silencio. La hoja trae su `aspect-ratio` y un contrato nuevo cruze las tres
  piezas: `client/test/formatos-plantillas.test.mjs` (6 casos: orden y proporción,
  ids sin repetir, formato de cada plantilla en el enum del servidor, etiqueta para
  cada formato del enum, escenas numeradas desde cero con rótulo aprovechable y
  proporción del previsualizado coincidente).
- [x] Onboarding sin datos inventados y con salidas honestas — el paso 2 pedía
  `searchUsers("a")` y lo llamaba «Personas destacadas»: una lista que no existía.
  Ahora el paso busca lo que la persona escribe (mínimo dos letras, por eso),
  distingue «aún no has buscado» de «sin coincidencias», y el pie dice «Continuar
  sin seguir a nadie →» cuando no hay resultados. El saludo dejó de prestar el nombre
  «explorador» y el encabezado dejó de asumir género («BIENVENIDA»). Corregido de
  paso un `height: 100dvh` que hacía que el pie pegajoso del onboarding quedara
  debajo de la barra inferior fija en móvil. El umbral de 3 temas para «Continuar»
  se queda: tiene prueba propia y «Saltar» sigue siendo una salida completa.
  Evidencia: `client/test-ui/block-d-onboarding.spec.jsx` (9 casos, 3 nuevos).
- [x] Monetización revisada en pantalla y alcance declarado — la página de apoyos y
  el diálogo ya decían «no se procesa ningún pago real»; el aviso del perfil decía
  «¡Apoyo estelar enviado con éxito!», sin decir lo que no era: ahora dice
  «Apoyo simbólico (★) enviado. No se procesó ningún pago». La declaración de
  alcance quedó escrita en `docs/LIMITES-Y-DEUDA.md` §4 (la pasarela está fuera de
  la v1 y qué hay que reescribir si eso cambia) y está viglada por
  `client/test/monetizacion-simbolica.test.mjs` (5 casos: aviso en el JSX visible de
  las dos superficies, sin vocabulario de cobro en ninguna pantalla, tres tramos en
  créditos y sin símbolo de moneda). Cerradas por declaración, en el mismo
  documento, las otras dos líneas abiertas del bloque: un solo idioma (§11, con el
  selector de Ajustes aclarado en la propia fila) y el chat como herramienta sin
  orquestación (§12, incluido que `aiComposer` no tiene consumidor).
- [x] El shell de navegación deja de duplicarse — una sola barra inferior fija los
  cinco destinos de uso diario (Inicio 🏠, Explorar 🔎, Crear ➕, Centro de IA ✨,
  Perfil 👤) **a cualquier ancho**: su `display` vive en la base de la hoja, no en
  una media query. El menú de secciones pinta los doce destinos restantes y hereda
  las ocho herramientas de Kairos, y **nunca repite** un destino fijado: de él solo
  toma sus `children`. La barra superior lleva marca, etiqueta de sección, búsqueda
  global (icono que abre `GlobalSearchModal`; ⌘K intacto), Notificaciones,
  Mensajes y `?`. No hay barra lateral en el DOM (`FanNav.jsx` fuera) y
  `useShellMetrics` mide `.k-app-tabbar` para publicar `--k-shell-bottom`. Sin
  contador de no-leídos a propósito: el conteo viaja dentro de las listas y
  pintarlo exigiría un endpoint ligero que no existe. `TAB_ITEM_IDS` en
  `navigation/model.jsx` es la única lista que decide qué se fija abajo.
  Evidencia: cliente **481/481** Vitest en 62 archivos, contratos de hoja
  **73/73** (`node --test client/test/*.test.mjs`), `npm run lint` 0 avisos,
  `npm run build` y `node scripts/ci/barrido-utilidades.mjs --estricto` en verde,
  `git diff --check` limpio. Los tres specs de navegador tocados (`navigation`,
  `layout-regression`, `completion-regression`) se adaptaron y pasan
  `node --check`; su verificación geométrica corresponde al job `browser`, que
  necesita Chromium y no corre en este entorno. La deuda que deja el cambio está
  en `docs/LIMITES-Y-DEUDA.md` §10.
- [x] Borrado de cuenta al alcance del usuario — el endpoint `DELETE /api/users/me`
  estaba probado pero era inalcanzable desde la interfaz. Ahora vive en
  Ajustes > Privacidad y datos (`client/src/features/settings/DeleteAccount.jsx`),
  con casilla de entendimiento, credencial y diálogo de confirmación. Cuentas con
  contraseña: bcrypt, contrato intacto. Cuentas de Google sin contraseña fijada:
  confirmación escrita del nombre de usuario, y nunca sustituye a la contraseña
  de quien la tiene (`server/src/modules/users/accountDeletionPolicy.js`,
  10 casos de contrato puro + 3 casos nuevos en `account-deletion.e2e.test.js`).
- [x] `GET /api/users/me` y `GET /api/auth/me` publican `hasPassword` — es lo que
  permite a la interfaz elegir el camino de verificación. El hash se lee para
  responder ese booleano y se retira del payload.
- [x] Términos, Privacidad y Cookies publicados como rutas públicas
  (`/terminos`, `/privacidad`, `/cookies`) — escritas desde el código del
  despliegue, no desde una plantilla: nombran la cookie real
  (`kronos_media_token`), las claves de almacenamiento real, la media pública
  por diseño, los apoyos simbólicos sin pasarela y la federación de solo lectura.
  Antes el comodín `*` mandaba absolutamente todo a `/login`.
- [x] Página de estado del servicio (`/estado`) — lee `GET /api/health` con
  `fetch` propio (fuera del ciclo de refresco de tokens y del presupuesto de las
  rutas autenticadas) y distingue funcionando / degradado / sin respuesta.
- [x] Pruebas de las cuatro páginas y del borrado —
  `client/test-ui/legal-and-status.spec.jsx` (12 casos, router real, sin sesión),
  `client/test-ui/account-deletion.spec.jsx` (11 casos sobre el diálogo, la
  credencial y el cuerpo de la petición), tres casos más en
  `client/test-ui/block-f-export-trust.spec.jsx` (el bloque aparece en Ajustes) y
  `client/test-browser/paginas-publicas.spec.js` (8 casos en navegador: montaje
  sin sesión, 320 px sin desbordar, ida y vuelta desde el acceso, estado
  simulado y API caída). Evidencia del commit: cliente **479/479** Vitest en 62
  archivos, servidor **592 pasan / 0 fallan / 189 saltadas**, `lint` 0 avisos,
  build y barrido estricto en verde, `git diff --check` limpio.

## Terminado y verificado (13 de octubre de 2026)

- [x] E2E completo contra base real — 92/92 en el entorno de trabajo (77 s, MongoDB 7.0.14) y job `mongo-real` 25/25 pasos en CI (corrida 38443841764).
- [x] Certificación dinámica V03 — crear, leer, editar y borrar; audiencias, comentarios, follows, feed, historial y notificaciones contra backend real.
- [x] V05 con dos clientes reales — DM, grupo, typing, entrega y lectura verificados en `block-019-024` (14 pruebas). Fuera quedó solo la reconexión, que sigue abajo.
- [x] Feed sin N+1 — medido: 16 consultas con página de 3 y 16 con página de 12; crecimiento 0.
- [x] Límites de subida — archivo sobredimensionado 413, tipo no permitido 400, contenido que no coincide 400 por firma.
- [x] Regresión de seguridad de subidas — el nombre `../../etc/...` no decide dónde se guarda: el nombre lo genera el servidor.
- [x] Rate limiting real — al pasarse responde 429 con su mensaje y el encabezado `"3-in-15min"; r=0; t=900`.
- [x] Idempotencia del apoyo — era un defecto real (un doble clic registraba dos apoyos). Corregido en servidor y cliente, con índice único parcial y 5 casos de prueba.
- [x] Exportación de datos con cuenta real — solicitar, consultar y descargar; el paquete trae lo propio y nada ajeno; la ventana semanal responde 429.
- [x] Revocación de sesión con datos reales — el logout revoca el token en todas las rutas protegidas y cierra la familia del refresh.
- [x] Huérfanos de media en la cadena de CI — el job adjunta sus informes (artefacto `kronos-db-reports-38443841764`), incluido el de detección.
- [x] Aviso de corridas apiladas — el E2E solo se dispara en PR o a mano; en los pushes del cierre no se apiló ninguna corrida.
- [x] Job Atlas — verde (261 s) junto con el E2E de entrada.
- [x] Disparo manual de workflows — por API responde 204; así se lanzó el E2E sobre el commit final.
- [x] Despliegue del commit final — producción sirvió el commit con base conectada; se repite el día del congelado.
- [x] Cancelar las 4 corridas obsoletas — ya no existen.
- [x] Afirmación insostenible corregida — el informe del 23 de septiembre queda como acta histórica, no como estado vigente.
- [x] Matriz del plan maestro actualizada — V02 desbloqueado (base real disponible), V03 y V05 verificados, H11 sellado por prueba, H16 medido.
- [x] Deuda y límites documentados — `docs/LIMITES-Y-DEUDA.md`.
- [x] Las 35 pruebas de navegador entran al CI — job `browser` propio (Chromium, con los dos servidores que la propia suite levanta); antes ningún workflow las corría. 35/35 en verde.
- [x] Defecto de la capa 3D que esas pruebas destaparon — la escena se montaba a medias en una máquina lenta y lanzaba `R3F: Hooks can only be used within the Canvas component` como error de página. Corregido: la escena se monta solo con el chunk en memoria y el contenedor con tamaño real.
- [x] Coherencia pública de federación — el inbox que responde 501 queda declarado y sellado por prueba; el texto público visible espera tu aprobación visual.

## Falta, y lo puedo hacer yo

- [x] Motor de Tailwind — conectado (`@tailwindcss/vite`), utilidades compilando (191 kB → 197 kB de CSS), 314 pruebas del cliente en verde y 35 de navegador en CI.
- [x] Motor de Tailwind, seguimiento del mismo día — el candado `package-lock.json` quedó en sincronía (`npm ci` fallaba por `@tailwindcss/vite` ausente), el centrado del diálogo no se hace dos veces (el motor compila `translate` y la regla a mano usaba `transform`: el recortador de portada se salía del viewport a 390 px) y la capa 3D sube a `@react-three/fiber` 9.8.1, que trae el arreglo de la carrera del `Canvas` bajo doble montaje. Evidencia: CI `47b69f1` con `validate` y `browser` en verde, 35/35 de navegador.
- [x] Barrido de utilidades del kit — `scripts/ci/barrido-utilidades.mjs` cruza las 2 363 clases declaradas en el código contra el CSS construido: cero utilidades del motor sin regla. Paso propio en el CI (falla si aparece una).
- [x] Dos defectos de cascada que el barrido destapó y quedaron corregidos — (1) el tema viejo define `.grid` con hueco de 0.8rem y le ganaba a la utilidad del motor: todo `grid gap-N` del kit rendía 12.8px en vez del hueco pedido; (2) el reseteo global `*{margin:0;padding:0}` no estaba en capa y anulaba en silencio todo margen y relleno declarado con utilidad (`mt-1` del pie de diálogo medía 0px). Arreglados con `:not([class*="gap-"])` y con el reseteo en `@layer base`; medido: `gap-3` 12px, `gap-4` 16px, `mt-1` 4px.
- [x] Consumidores del kit medidos uno por uno en navegador real — nueva spec `client/test-browser/kit-consumidores.spec.js` (7 casos): estado de carga de ruta diferida, panel de atajos, diálogo de reporte, de seguidores, de apoyo, recortador y cajón de secciones. Cada uno comprueba el valor efectivo que pide el código (ancho, hueco, centrado, tamaño, animación). 8/8 en verde, y la sonda de trabajo midió 52 valores con 0 fallos.
- [x] Las medidas base del kit dejan de pisar a las pantallas — la regla del diálogo pedía 520px y se imponía al diálogo de seguidores, que pide 620px. Ahora la base solo manda donde la pantalla no pide tamaño, con `:where(:not([class*="w-"]))` y sus dos hermanas (hueco y alto máximo). Medido: seguidores 620px, apoyo 440px, reporte 520px.
- [x] La barra de navegación móvil no desaparecía — la consolidación de CSS movía la regla base de `.k-mobile-navigation` (`display:none`) por detrás de su media query (`display:grid` a ≤700 px) al fundir selectores duplicados y al mandar el bloque de identidad al final. La barra inferior se quedaba oculta en 320/390 px y la suite de navegador se colgaba un minuto por cada prueba afectada (el job `browser` pasaba de 13 a 24 min y moría en el límite). Arreglado en el generador: la regla fusionada conserva su **primera** posición y el bloque de identidad se queda donde estaba. El orden de import es parte del contrato. Se añadió un test que falla si una regla de nivel superior anula el `display` de una media query posterior.
- [x] El CI vuelve a estar verde — el workflow `ci.yml` traía una clave YAML duplicada (`timeout-minutes`) y GitHub no ejecutaba ningún job: la corrida moría en 0 s. Como el cambio llegó sólo a `.github/**` (patrón que estaba en `paths-ignore`), nadie lo notó. Arreglado el workflow y cerrado el circuito: `.github/**` sale de `paths-ignore`, `npm run validate:workflows` rechaza claves duplicadas en los 7 workflows, `npm run test:workflows` vigila presupuestos y concurrencia, y el job `validate` descarga el artefacto que necesita el barrido de CSS. En paralelo, `npm audit` bajó de 5 vulnerabilidades a **0** (multer 2.5, openai 6.49 con su contrato de cable verificado por test, zod 4.6.7, body-parser 2.4, fast-uri 3.1.9).
- [x] Una sola identidad de estilos — las 30 hojas de producto (más `kronos-system/`) se fusionaron en `client/src/styles/kronos.css`: negro profundo, cromo líquido y reloj 3D en movimiento constante. Sin estilos por pantalla, sin capa de prioridades, sin CSS muerto (277 reglas eliminadas al fusionar) y sin capas que se tapen. Verificado: cascada original contra la nueva, **0 diferencias de valor y 0 propiedades perdidas**; ninguna clase usada en el JSX se quedó sin estilo. El motor (`tailwind.css`) y el vocabulario del color (`design-tokens.css`) se conservan aparte. `scripts/styles/consolidate-identity.js` regenera la hoja y es reproducible.
- [ ] Secciones de monetización a la vista — ver cómo quedan armadas antes de dejarlas.
- [x] Clase muerta `k-visually-hidden` en tres lugares — el barrido la señaló como uso sin regla y resultó ser eso: el nombre no existía en el CSS (`k-sr-only` sí). Alineados el visor de media y los dos textos ocultos del perfil; cero usos de `k-visually-hidden` en el cliente.
- [x] Accesibilidad del kit en los 7 consumidores: foco atrapado, Escape, bloqueo de scroll y restauración de foco, uno por uno en navegador real — nueva spec `client/test-browser/kit-accesibilidad.spec.js` (7 casos, los cuatro comportamientos cada uno) sobre los mismos consumidores que mide la spec de geometría. Destapó un defecto real: `useDialogFocusRestore` decidía el destino al montar el contenido, antes de que el navegador asentara el clic, así que el foco del disparador no llegaba a tiempo y al cerrar caía al cuerpo o al contenedor. Ahora decide al cerrar, con el rastro de `focusin` más el respaldo del montaje, y una red de seguridad recoge el foco si el nodo enfocado desaparece un fotograma después. 7/7 en verde (antes 3 de 7 en rojo) y la spec de geometría sigue 8/8.
- [x] Regresión de los 2 defectos de geometría — aserción permanente en `scripts/ci/barrido-utilidades.mjs`, que ya corre en CI sin navegador: el reseteo universal debe vivir dentro de `@layer base`, `.grid` del tema no puede declarar hueco sin su guarda `:not([class*="gap-"])`, y las bases del diálogo no pueden pisar tamaño ni hueco. Probado en rojo a propósito (con las tres guardas rotas denuncia 3 defectos y el portón sale 1) y en verde; el portón estricto ahora también falla por defectos de cascada.
- [ ] Refresco de token en navegador real — extender la prueba de 401 a una sesión con token caducado en navegador.
- [ ] Estados vacíos, paginación y error de red en UI — contra backend real.
- [ ] Reconexión de socket con dos clientes reales.
- [ ] Doble camino REST + evento — confirmar que el mensaje guardado por REST coincide con el evento recibido por socket.
- [ ] Locución con proveedor de voz elegido — hoy la voz es la genérica de OpenRouter y el catálogo propio está vacío.
- [ ] Proyectos por pieza — guion, tomas, música y versiones en un solo lugar.
- [ ] Plantillas de formato — 9:16, cuadrado, panorámica y portada.

## Falta, y es tuyo (decisión)

- [x] Decisión sobre Tailwind — motor, por orden del propietario (13 de octubre).
- [ ] Aprobación visual (UI01/UI02).
- [ ] Media privada o pública.
- [ ] Coste y créditos — libro de consumo por usuario, o basta el control de presupuesto.
- [ ] Herramientas y orquestación del chat — alcance, o "no ofrecido".
- [ ] Monetización — alcance real (los 4 paquetes que te armé en privado), o fuera de v1.
- [x] Borrado de cuenta — IMPLEMENTADO el 29 de octubre: endpoint + interfaz en Ajustes > Privacidad y datos, con verificación por contraseña y, en cuentas de Google sin contraseña, confirmación escrita del usuario. Ver la sección de arriba.
- [ ] Federación bidireccional — implementar (firmas, colas, interoperabilidad), o declarar "solo lectura".
- [ ] Aprobación visual y de alcance (T15).
- [ ] Proveedor de video — elegir cuál (decisión) para cargar sus dos llaves.
- [ ] Publicación en GitHub — release solo código, repo privado, o dejarlo (en pausa por orden tuya).
- [ ] Catálogo de música — de dónde sale: subir pistas tú (funciona hoy), o conectar una biblioteca externa con credencial.

## Falta, y es tuyo (credencial o acceso)

- [ ] Google OAuth real — prueba de extremo a extremo (las llaves ya están puestas).
- [ ] Correos transaccionales — `RESEND_API_KEY` + `RESEND_FROM_EMAIL`.
- [ ] OpenRouter real — correr la generación facturada (`SMOKE_IMAGE=1`); la fase sin costo ya corre verde en CI.
- [ ] Video real — `VIDEO_API_KEY` + `VIDEO_API_URL`.
- [ ] Índices y salud en producción — URI de producción.
- [ ] Restore real de producción — ventana y respaldo acordados.
- [ ] Acceso a producción para verificación.
- [ ] Prueba posterior a cada credencial que se cargue.
- [ ] Capacidades: video y chat en "Listo" (depende de las llaves de arriba).

## Acta de cierre (se marca el día del congelado final)

Estado hoy entre paréntesis; no se marca hasta congelar el commit final.

- [ ] CI principal en verde sobre el commit final congelado (hoy: verde en cada push).
- [ ] Job E2E mongo-real completo (hoy: 25/25 pasos, verde).
- [ ] Job atlas en verde, u omitido por escrito (hoy: verde, 261 s).
- [ ] Playwright 35/35 sobre el commit congelado (hoy: **ya corre en el CI**, job `browser`, 43/43 en verde; se re-verifica el día del congelado).
- [ ] Producción verificada: frontend, API, salud, CORS y `VITE_API_URL` del bundle.
- [ ] Cadena de base de datos y ensayos (TTL, rollback, restore) en verde (hoy: verde dentro del job E2E).
- [ ] Pendientes externos enumerados con variable exacta y prueba posterior (hecho en este documento).
- [ ] Barrido NO-MOCK sin coincidencias.
- [ ] `git diff --check` limpio y sin artefactos experimentales.
- [ ] Aprobaciones del propietario registradas o aceptadas en riesgo.

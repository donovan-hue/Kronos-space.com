# Límites y deuda declarada

Este documento existe para que nada de lo que sigue se descubra por sorpresa:
son límites conscientes y deuda conocida del estado actual. Cada punto dice qué
es, por qué está así y qué haría falta para cambiarlo.

## 1. La capa de federación es de solo lectura

El perfil público publica un actor con su `inbox`, como manda ActivityPub, pero
ese buzón **responde 501**: la plataforma no procesa actividades entrantes. Es
un límite declarado, no un éxito simulado: la respuesta lo dice y una prueba lo
sella (`server/test/federation-live-support.contract.test.js`, caso 045b, y la
comprobación con almacenamiento sano en la línea del 501).

Cambiarlo exige firmas HTTP (RFC 9421), protección contra repetición, colas de
procesamiento y pruebas de interoperabilidad con otra instancia. Hasta que se
apruebe, la coherencia pública es esta: descubrimiento y lectura, sin entrada.

## 2. Los archivos subidos son públicos por diseño

`/uploads` se sirve sin control de acceso: cualquier persona con la URL ve el
archivo. Es una decisión de producto (el feed es público), y por eso **no debe
describirse como almacenamiento privado**. Si el producto necesita media
privada, harían falta permisos por documento, URLs firmadas y purga de caché.

## 3. Tailwind ya tiene motor (resuelto el 2026-10-13)

`client/src/styles/tailwind.css` escribía clases de Tailwind sin motor que las
compilara: los assets contenían 0 utilidades y componentes enteros del kit
dependían de parches escritos a mano. Resuelto: `@tailwindcss/vite` está
conectado en `vite.config.js`, el CSS construido ya incluye las utilidades
(191 kB → 228 kB) y el preflight sigue desactivado a propósito.

Lo que queda en pie de este punto: las reglas a mano del kit siguen donde
estaban y no se retiran, porque el CSS sin capas gana la cascada sobre la capa
`utilities`: son la última palabra de esa geometría. Retirarlas sería un
cambio de aspecto y no hace falta para nada.

## 4. La monetización es simbólica

No hay pasarela de pago. El apoyo entre cuentas son créditos Kronos (★) y la
interfaz lo dice: no se procesa ningún pago real. La decisión de fondo (si se
integra un cobro real y con qué proveedor) sigue abierta, y por eso nada en el
producto promete un cobro que no existe.

La declaración de alcance, escrita para que no quede solo en el código: **la
pasarela de pago está fuera de la v1**. No hay checkout, ni método de pago
guardado, ni retiro de fondos, y ningún texto del producto menciona esos
vocablos: `client/test/monetizacion-simbolica.test.mjs` falla si aparece
lenguaje de cobro en la interfaz sin nada detrás y exige que la página de
apoyos, el diálogo y el aviso del perfil sigan diciendo que no se procesa ningún
pago real. Si algún día se integra un cobro, ese contrato se abre a propósito:
hay que reescribir a la vez los tres textos legales, la política de cookies (un
proveedor de pago escribe las suyas) y este párrafo.

## 5. Capacidades de IA sin proveedor puesto

La imagen, el guion y la voz funcionan con la llave de OpenRouter ya cargada.
El **video** no: OpenRouter no genera video, así que la capacidad queda
declarada como no configurada hasta que exista `VIDEO_API_KEY` +
`VIDEO_API_URL`. El **chat** espera `GEMINI_API_KEY`. Y no hay libro de coste
por usuario: el control actual es el presupuesto por reintentos, no un saldo.

## 6. Los catálogos no traen relleno

El catálogo de música y el de voces empiezan vacíos: las pistas y las voces las
publica quien administra. Se prefirió vacío con un aviso claro antes que
inventar contenido que nadie subió.

## 7. Una sola instancia

El tiempo real (Socket.IO) funciona con una instancia. Hay un límite
documentado para la topología remota y multi-instancia; hoy no está probado.

## 8. El borrado de cuenta se verifica de dos maneras, no de una

`DELETE /api/users/me` exige credencial. Quien tiene contraseña la entrega y se
compara con bcrypt. Quien entró con Google y nunca fijó una **no tiene contraseña
que comparar**: para esa cuenta el control es escribir su propio nombre de usuario
en el formulario. Es fricción deliberada contra un token robado, no un segundo
factor, y está acotado a un solo caso: si la cuenta tiene hash, la confirmación
por nombre de usuario nunca autoriza el borrado (`accountDeletionPolicy.js`).

El límite real sigue siendo otro: sin proveedor de correo no hay forma de que una
cuenta de Google se fije una contraseña, así que su titular no puede cambiar de
camino de verificación. Con `RESEND_API_KEY` cargada, el flujo de
restablecimiento cierra ese hueco.

## 9. Los documentos legales describen el sistema, no un ideal

Términos, Privacidad y Cookies se escribieron leyendo el código: nombran la cookie
que existe (`kronos_media_token`), las claves de almacenamiento que escribe
`authStorage.js`, la media pública por diseño, los apoyos sin pasarela y la
federación que responde 501. Por eso declaran también lo que **no** hay: sin
verificación obligatoria de correo, sin doble factor, sin filtrado automático
antes de publicar.

Son texto de producto, no un dictamen jurídico: faltan la revisión y la aprobación
del propietario antes de darlos por definitivos. Cambiar el tratamiento de datos
sin cambiar el documento en el mismo commit convierte esta sección en deuda.

## 10. La hoja conserva reglas de una barra lateral que ya no se monta

El shell quedó sin barra lateral: en el DOM solo viven la barra inferior
(`.k-app-tabbar`, cinco destinos a cualquier ancho) y el cajón «Secciones».
Trece de las treinta y dos reglas que mencionan `.k-navigation` en
`client/src/styles/kronos.css` ya no tienen a nadie a quien vestir —
`.k-navigation`, `.k-navigation-brand`, `-brand strong`, `-brand-mark` (aislada),
`.k-navigation-scroll`, `.k-navigation-group`, `-group h2`, `.k-navigation-list`,
las tres de `.k-navigation-subitem` y las dos media queries de 900/700 px—,
mientras que `.k-navigation-item`, `.k-navigation-icon` y `.k-navigation-copy`
siguen en uso porque la barra inferior reutiliza ese cromo. El build lo refleja:
188,2 kB y 1 755 reglas en `client/dist/assets/index-*.css`.

No se borran aquí por tres motivos medibles: la hoja única es **generada** por
`scripts/styles/consolidate-identity.js` a partir del historial de las 26 hojas
originales y ese generador no puede volver a correr en este checkout (pide
commits que no existen), así que cada selector que se quita es irreversible y sin
red; sus comentarios de procedencia (`/* ---------- ./fan-nav.css ---------- */`)
son el mapa que sobrevive a una regeneración y seguirían apuntando a archivos que
no están en el árbol; y `css-cascade` y `css-layout` vigilan el orden de las
capas, los `!important` y que toda clase `k-*` del JSX tenga regla, contratos que
se rompen por recortar la cascada más que por añadirla. La ganancia de limpiarlas
es de peso; el riesgo, un cambio de comportamiento invisible en 60 pantallas.

Si se retoma: clonar el repo con historial completo, regenerar la hoja y
recortar con `--check` y `--detalle`, no a mano.

## 11. Un solo idioma, declarado

La interfaz existe en español y no hay catálogo de traducción. Lo que sí se
puede elegir es el idioma de **respuesta** de Kairos y del chat
(`preferences.language`, `es-MX` o `en`): Ajustes lo aclara en la propia fila,
porque el selector existe desde antes de que hubiera traducciones y prometer una
interfaz en inglés sería falso. Añadir i18n de verdad no es poner otro `<option>`:
son los ~40 textos de estado del shell, los tres documentos legales en su segunda
versión y las plantillas de formato con sus rótulos.

## 12. El chat es una herramienta, no un orquestador

`POST /api/chat` recibe un mensaje con historial y personalidad, y devuelve un
texto. No llama a otras capacidades, no arma tareas de varios pasos, no escribe
publicaciones ni genera imágenes por su cuenta, y no hay cola de trabajos detrás:
lo que el chat puede hacer termina en la respuesta. La orquestación —pedirle que
produzca un guion, lo convierta en escenas y los mande a generar— no está
decidida, y el flag `aiComposer` que parecía reservársela no tiene consumidor:
está declarado en los defaults del servidor y del cliente y no lo lee ninguna
ruta. Cuando se decida el alcance, ese flag es el sitio donde aterriza.

## 13. Lo que este documento no cubre

Las credenciales y aprobaciones que dependen del propietario (correo, video,
Google de extremo a extremo, accesos de producción) viven en
`docs/PENDIENTES.md`, con su variable exacta. Aquí solo está lo que es límite
de diseño o deuda técnica.

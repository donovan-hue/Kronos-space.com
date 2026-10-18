# Estudio de medios y Kairos: lo que se construyó y lo que sigue

Este documento describe el estudio de medios de Kronos Space (foto y video), la estructura de
Kairos como agente generador de multimedia, y la lista exacta de lo que falta —sobre todo en el
servidor— para que funcione completo.

Todo lo que aquí se marca como hecho está en el código y con pruebas verdes.

---

## 1. Estudio de la foto

Cuando alguien sube una foto, ya no aparece un cuadro apretado con un recorte: se abre una
pantalla completa con la foto al centro y los mandos en un panel ordenado por pestañas.

- La medida de salida se elige entre original, cuadrada 1:1, retrato 4:5, vertical 9:16 y
  panorámica 16:9. El recorte se calcula centrado sobre los píxeles reales de la imagen, no sobre
  lo que se ve en pantalla.
- La calidad de salida es alta, media o ligera; el archivo se genera en el navegador con el filtro,
  el tono y el texto ya aplicados, así que lo que se publica es lo que se vio.
- Nada tapa la foto: los controles viven en el panel, no encima de la imagen.

## 2. Estudio del video y de los reels

El mismo estudio sirve para video, con la sección Corte incluida. El video ya no se edita con dos
casillas de números sueltos.

- Corte con dos controles deslizantes (inicio y fin), silencio del audio original y elección de
  fotograma como portada, que sube como portada real de la publicación.
- La receta de edición —corte, filtro, tono, texto, música, medida y las tomas de la línea de
  tiempo— viaja con la publicación y el servidor la guarda con los mismos topes que el motor del
  estudio (punto 6). El corte y la portada se ven al publicar; el filtro, la música y el texto ya
  viajan guardados y todavía no se ven en el reproductor del feed: eso es del lado del reproductor,
  no del guardado.
- La medida por defecto del video es 9:16, que es la medida del feed vertical.
- Sección Clips: la pieza se arma con varias tomas en orden, hasta 12. Cada toma se recorta por
  separado (entra en, termina en), se sube o se baja de lugar y se puede quitar; la pantalla muestra
  la duración total, que cuenta el video y no las imágenes. El primer clip es el archivo que se abrió
  y los demás se suben al publicar, así que la receta nunca guarda una dirección temporal del
  navegador. Con una sola toma la publicación se guarda como siempre, sin línea de tiempo.
- Velocidad por toma de 0.25x a 4x, con cámara lenta en 0.5x y 0.25x: el tramo elegido se alarga o se
  acorta, y la duración total de la pieza lo refleja.
- Dividir una toma en dos por un segundo del archivo, sin subir el mismo archivo dos veces: las dos
  mitades salen de la misma fuente y el empalme entre ellas es un corte seco.
- Transición entre tomas (sin transición, fundido, a negro, a blanco, barrido y acercar), con
  duración. Nunca pasa de la mitad de la toma más corta de las dos que une, para no comerse tomas; la
  primera toma no lleva transición porque no tiene nada antes con lo que mezclarse.

## 3. Filtros y tono

- 16 filtros con nombres en español, agrupados en color, clima y tono, con intensidad de 0 a 100
  por ciento. A media intensidad el filtro se mezcla con el original en lugar de aplicarse de golpe.
- Ocho ajustes: brillo, contraste, saturación, calidez, exposición, suavizado, viñeta y grano.
- La calidez no existe como función CSS, así que se resuelve con sepia más un giro de tono, con el
  sepia limitado a 0.35 para no volver la foto plana.
- La vista previa y el archivo exportado salen del mismo cálculo: el mismo texto de filtros se
  aplica al elemento en pantalla y al lienzo que genera el archivo.

## 4. Texto y música

- Texto sobre la foto o el video, hasta 140 caracteres, con posición arriba, centro o abajo, tamaño
  del 60 al 200 por ciento, color y fondo para leerlo. En la pantalla se ve como se va a publicar;
  en la foto se quema al exportar.
- Música: elección de pista desde el catálogo del servidor, con el tramo (entra en, termina en),
  volumen y fundido de entrada y de salida, cada uno limitado a la mitad del tramo.
- El catálogo se lee de `/api/music`, que **ya existe** (13 de octubre de 2026): devuelve las pistas
  publicadas y nada más. Mientras no haya ninguna publicada, la sección Música lo dice tal cual en
  lugar de mostrar pistas inventadas. La lectura va sin relleno de ejemplo: no se promete lo que no
  hay. Si la petición falla, el motivo en pantalla es "No se pudo leer el catálogo de música del
  servidor. Vuelve a intentarlo en un momento."

## 4b. Voz en off y voces

- La sección Voz del estudio (video) graba la voz en off con el micrófono, la deja oír antes de
  publicar y le ajusta nombre, entrada en la pieza, volumen y fundidos de entrada y de salida. Los
  fundidos tienen el mismo tope que la música: nunca más de la mitad de la toma. La duración de la
  grabación se lee del archivo, no se cuenta a ojo.
- Si el navegador no da el micrófono, el estudio lo dice: "No se pudo abrir el micrófono. Revisa el
  permiso del navegador."
- La toma grabada se sube al publicar (`POST /api/uploads/audio` con destino `voz`) y queda en
  `/uploads/voices/`. La receta nunca guarda una dirección temporal del navegador.
- El catálogo de voces se lee de `GET /api/voices`, que **ya existe**: voces del catálogo más las
  grabaciones propias de quien pregunta. Una voz de catálogo sin modelo asignado, o con el servicio
  de voz del servidor sin configurar, llega marcada como no disponible con su motivo y la pantalla
  la muestra en gris: no se promete una voz que todavía no se puede generar.
- Lo que falta de este lado: generar la voz desde el guion con un modelo (locución). Eso necesita
  elegir el servicio de voz y su credencial, que es decisión del dueño; mientras no esté, el estudio
  graba con el micrófono y lista el catálogo, y nada más.

## 5. Kairos como estudio

Kairos dejó de ser una lista de cuatro enlaces y ahora es un tablero con cuatro áreas separadas,
para que nada quede revuelto:

| Área | Qué contiene |
|---|---|
| Crear | Imagen, Video, Guion y Audio (locución y voz en off, en el estudio) |
| Armar | Proyectos (pendiente), Trabajos y Biblioteca |
| Ajustar | Voces y música (pendiente como pantalla), Filtros y tono, Historial |
| Regla del estudio | Cada pieza guarda su receta para poder repetirla y compararla |

- Las tarjetas sin pantalla todavía se muestran marcadas **Próximamente** y no enlazan a rutas
  inexistentes: no se agregan enlaces muertos.
- Cada tarjeta lee su estado de `GET /api/kairos/capacidades` (**ya existe**, 13 de octubre de 2026).
  Cuando está en falta, la etiqueta dice qué variable falta, con su nombre. Si el servidor no
  responde, no se muestra ningún estado en lugar de un estado falso.
- Audio y Filtros y tono ya no son promesas: la locución y la voz en off viven en la pestaña Voz del
  estudio, y los 16 filtros con sus 8 ajustes en la sección de filtros. Las dos tarjetas llevan su
  estado real aunque no tengan pantalla propia.
- Lo que queda marcado **Próximamente** es Proyectos y Voces y música como pantallas de gestión.

### Estructura propuesta del agente (lo que lo hace más completo que CapCut)

CapCut edita piezas; el punto donde Kronos puede quedar por arriba es que la pieza se produzca y
se repita, no solo se edite. Las cinco piezas del agente:

1. **Proyecto por pieza**: guion, tomas, música, textos, versiones y estado en un solo lugar.
2. **Guion con escenas**: cada escena con duración, texto, imagen de referencia, voz y música
   sugerida. De ahí salen el video y las tomas, no al revés.
3. **Biblioteca de recursos**: imágenes, videos, voces y pistas generadas, con búsqueda por
   etiqueta y reutilización entre proyectos.
4. **Versiones y comparación**: cada corrida deja una versión con su receta y su costo; se comparan
   lado a lado y se elige una, sin perder las anteriores.
5. **Plantillas de formato**: reels 9:16, cuadrado, panorámica y portada 3:1, con textos y ritmos
   ya armados, para publicar en un paso.

---

## 6. Lo que falta del lado del servidor (con nombre y apellido)

Sin esto, la parte de música y parte de la receta del video no llegan a la base de datos.

| Cambio | Archivo | Detalle | Estado |
|---|---|---|---|
| Aceptar audio en subidas | `server/src/middleware/upload.js` | Tipos mp3, m4a, aac, wav, ogg y webm; tope de 15 MB; firma del archivo (ID3, trama MPEG, ftyp, ADTS, RIFF/WAVE, OggS, EBML) como ya se hace con imágenes y video | **Hecho** (13 oct) |
| Ruta de audio | `server/src/modules/music/audio.routes.js` | `POST /api/uploads/audio`: guarda la pista propia en `/uploads/music/` y devuelve su URL | **Hecho** (13 oct) |
| Guardar la receta | `server/src/modules/posts/Post.js` y `posts.routes.js` | `parseMedia` reconstruía el objeto desde una lista blanca y tiraba `music` y `edit` sin error; ahora los dos se declaran en el esquema y se validan con los mismos topes que el motor del estudio | **Hecho** (13 oct) |
| Catálogo de música | `server/src/modules/music/` (modelo y rutas) | `GET /api/music` (pistas publicadas, con búsqueda y etiqueta) y `POST /api/music` (solo administración: sube el audio y publica la pista con autor, duración, etiquetas y licencia) | **Hecho** (13 oct) |
| Línea de tiempo | `server/src/modules/posts/Post.js` y `posts.routes.js` | `edit.clips` (dirección, tipo, duración, inicio y fin por toma, velocidad de 0.25x a 4x y transición con la toma anterior) y `edit.duracionTotal`; `parseClips` exige dirección propia, acota cada tramo a la duración real, rechaza el tramo invertido, acota la velocidad y la transición al hueco real y corta en 12 tomas. La duración total cuenta el tramo repartido entre la velocidad. Las dos claves solo se guardan cuando hay más de una toma | **Hecho** (13 oct) |
| Catálogo de voces | `server/src/modules/voices/` (modelo y rutas) | `GET /api/voices` (voces listadas más las grabaciones propias) y `POST /api/voices` (solo administración): nombre, idioma, género, tipo propia o catálogo, modelo, licencia y el interruptor de lista. Una voz sin modelo o sin el servicio configurado se devuelve con `disponible: false` y su motivo | **Hecho** (13 oct) |
| Voz en off en la receta | `server/src/modules/posts/Post.js` y `posts.routes.js` | `edit.voz` (voz, nombre, url, tipo, entrada, fin, volumen y fundidos topeados a la mitad de la toma) con `parseVoz`; la toma de audio se guarda en `/uploads/voices/` desde `POST /api/uploads/audio` con destino `voz` | **Hecho** (13 oct) |
| Capacidades | `server/src/modules/ai-core/routes/kairos.routes.js` | `GET /api/kairos/capacidades`: imagen, video, texto, chat y voz, cada una con `listo` y la variable exacta que falta; más música (con el número real de pistas publicadas), filtros (declarados del estudio, sin proveedor) y trabajos, biblioteca e historial (viven en el servidor) | **Hecho** (13 oct) |
| Voces y pistas del estudio | `server/src/modules/voices/` y `music/` | `GET /api/voices` (catálogo de voces con disponibilidad real) y `GET /api/music` (pistas publicadas). Sustituyen al `GET /api/kairos/estudio` que estaba apuntado: cada catálogo tiene su ruta, y la locución su `POST /api/voices/locucion` | **Hecho** (13 oct) |
| Locución | `server/src/modules/voices/tts.service.js` | Genera la voz desde el texto con el punto único de conexión de OpenRouter (`POST /audio/speech`) usando la misma llave de la imagen y el guion; el modelo y la voz se eligen con `OPENROUTER_TTS_MODEL` y `OPENROUTER_TTS_VOICE`, y el MP3 se guarda en `/uploads/voices/` | **Hecho** (13 oct) |
| Proyectos del estudio | módulo nuevo | `GET /api/kairos/proyectos`: un tablero por pieza con guion, tomas, música y versiones | Pendiente |

Y del lado del dueño: las credenciales (OpenRouter, video, correo, Google) y la decisión de qué
voces y qué música se ofrecen. La credencial de voz es la que hace que las voces del catálogo pasen
de gris a disponibles: el servidor la declara en `GET /api/voices` como `servicio.variable`.

## 7. Lo que se construyó en este cambio

| Archivo | Qué aporta |
|---|---|
| `client/src/lib/mediaStudio.js` | Motor: 16 filtros, 8 ajustes, medidas y calidades, recorte centrado, música con fundidos, línea de tiempo (normalizar, agregar, mover, quitar y dividir tomas, velocidad con cámara lenta, transiciones con tope, duración ya montada), receta de video y validación, texto normalizado |
| `client/src/components/media/MediaStudio.jsx` | Pantalla completa del estudio, con secciones Clips, Corte, Filtros, Ajustes, Texto, Música y Salida; vista previa al centro y panel de mandos. La línea de tiempo lee la duración real de cada archivo agregado, ofrece velocidad por toma, partirla en dos y la transición con la toma anterior |
| `client/src/styles/media-studio.css` | Estilos del estudio, de la tarjeta de video del compositor y del tablero de Kairos |
| `client/src/services/musicService.js` | Catálogo de música contra `/api/music`, con su motivo cuando no existe |
| `client/src/services/voiceService.js` | Catálogo de voces contra `/api/voices` (con el estado del servicio de voz) y la subida de la toma grabada |
| `server/src/modules/voices/Voice.js` | Esquema de la voz: nombre, idioma, género, tipo, archivo, modelo, licencia y el interruptor de lista |
| `server/src/modules/voices/voices.routes.js` | Catálogo de voces con su disponibilidad real y la verdad del servicio de voz |
| `server/test/voices.contract.test.js` | 7 pruebas del catálogo de voces, la carpeta propia, la voz en off y el montaje |
| `client/src/features/ai/AICenter.jsx` | Tablero del estudio en cuatro áreas. Cada tarjeta lee su estado real de `/api/kairos/capacidades` y, cuando falta algo, dice qué variable falta |
| `server/src/modules/ai-core/routes/kairos.routes.js` | `GET /api/kairos/capacidades`: el estado honesto de cada herramienta del estudio |
| `server/test/kairos.contract.test.js` | 5 pruebas de las capacidades: sin variables, con variables, con la música contada y con el catálogo caído |
| `client/src/features/social/CreatePost.jsx` | La foto y el video abren el estudio; la receta viaja con la publicación. Los clips agregados se suben al publicar y la línea de tiempo se guarda con las direcciones ya subidas |
| `client/test-ui/media-studio.spec.jsx` | 27 pruebas del motor y de la pantalla, con la línea de tiempo, la velocidad y las transiciones incluidas |

## 8. Orden para completarlo

Lo hecho: música de verdad (subida de audio, catálogo y guardado de la receta), la línea de tiempo
de varias tomas, dividir, velocidad con cámara lenta y transiciones, y la voz en off con su catálogo
de voces.

1. Locución: generar la voz desde el guion con un modelo. Necesita que el dueño elija el servicio
   de voz y su credencial; el catálogo de voces ya está listo y declara la variable que falta.
2. Capacidades del estudio en el servidor (`/api/kairos/capacidades`) y sus dos endpoints.
3. Proyectos del estudio: tablero por pieza con guion, tomas, música y versiones.
4. Plantillas de formato, para publicar un reel con textos y ritmo en un paso.

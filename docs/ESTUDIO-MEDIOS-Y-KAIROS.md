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

## 5. Kairos como estudio

Kairos dejó de ser una lista de cuatro enlaces y ahora es un tablero con cuatro áreas separadas,
para que nada quede revuelto:

| Área | Qué contiene |
|---|---|
| Crear | Imagen, Video, Guion (ya existentes) y Audio (pendiente) |
| Armar | Proyectos, Trabajos y Biblioteca |
| Ajustar | Voces y música, Historial |
| Regla del estudio | Cada pieza guarda su receta para poder repetirla y compararla |

- Las tarjetas sin pantalla todavía se muestran marcadas **Próximamente** y no enlazan a rutas
  inexistentes: no se agregan enlaces muertos.
- Las tarjetas de capacidades leen `/api/kairos/capacidades`; si el servidor no lo expone, no se
  muestra ningún estado en lugar de un estado falso.

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
| Línea de tiempo | `server/src/modules/posts/Post.js` y `posts.routes.js` | `edit.clips` (dirección, tipo, duración, inicio y fin por toma) y `edit.duracionTotal`; `parseClips` exige dirección propia, acota cada tramo a la duración real, rechaza el tramo invertido y corta en 12 tomas. Las dos claves solo se guardan cuando hay más de una toma | **Hecho** (13 oct) |
| Capacidades | módulo `ai-core` | `GET /api/kairos/capacidades`: imagen, video, audio, texto y proyectos, cada uno con listo o falta variable | Pendiente |
| Endpoints del estudio | módulos `image-ai`, `video-ai` | `GET /api/kairos/estudio` (voces y pistas) y `GET /api/kairos/proyectos` | Pendiente |

Y del lado del dueño: las credenciales (OpenRouter, video, correo, Google) y la decisión de qué
voces y qué música se ofrecen.

## 7. Lo que se construyó en este cambio

| Archivo | Qué aporta |
|---|---|
| `client/src/lib/mediaStudio.js` | Motor: 16 filtros, 8 ajustes, medidas y calidades, recorte centrado, música con fundidos, línea de tiempo (normalizar, agregar, mover y quitar clips, duración total), receta de video y validación, texto normalizado |
| `client/src/components/media/MediaStudio.jsx` | Pantalla completa del estudio, con secciones Clips, Corte, Filtros, Ajustes, Texto, Música y Salida; vista previa al centro y panel de mandos. La línea de tiempo lee la duración real de cada archivo agregado |
| `client/src/styles/media-studio.css` | Estilos del estudio, de la tarjeta de video del compositor y del tablero de Kairos |
| `client/src/services/musicService.js` | Catálogo de música contra `/api/music`, con su motivo cuando no existe |
| `client/src/features/ai/AICenter.jsx` | Tablero del estudio en cuatro áreas, con estados reales y tarjetas Próximamente |
| `client/src/features/social/CreatePost.jsx` | La foto y el video abren el estudio; la receta viaja con la publicación. Los clips agregados se suben al publicar y la línea de tiempo se guarda con las direcciones ya subidas |
| `client/test-ui/media-studio.spec.jsx` | 23 pruebas del motor y de la pantalla, con la línea de tiempo incluida |

## 8. Orden para completarlo

Lo hecho: música de verdad (subida de audio, catálogo y guardado de la receta) y la línea de
tiempo de varias tomas apuntadas arriba.

1. Dividir una toma, cambiar su velocidad y hacer cámara lenta; transiciones entre tomas.
2. Voz en off de la pieza y las voces de Kairos.
3. Capacidades del estudio en el servidor (`/api/kairos/capacidades`) y sus dos endpoints.
4. Proyectos del estudio: tablero por pieza con guion, tomas, música y versiones.
5. Plantillas de formato, para publicar un reel con textos y ritmo en un paso.

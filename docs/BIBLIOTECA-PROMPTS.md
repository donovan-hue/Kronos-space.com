# Biblioteca de prompts y estilos propios

Módulo `server/src/modules/prompts/` + `client/src/features/image-ai/`.
Resuelve el ítem «sin estilos propios ni prompts guardados» del checklist de
imagen: el generador tenía cuatro estilos fijos y ninguna forma de guardar lo
que funcionaba.

## Qué hay

### Catálogo de instrumentos (`promptLibrary.js`)

54 categorías en 6 grupos, cada una con:

| Campo | Para qué |
| --- | --- |
| `codigo` | Clave estable (`img_lighting`). Es lo que guardan los presets y las generaciones: renombrar la etiqueta no rompe nada. |
| `numero` | 1…54, el orden del catálogo. |
| `grupo` | `core`, `creatividad`, `imagen`, `video`, `audio`, `motor`. |
| `nombre` | Etiqueta visible. |
| `campos` | Claves de `CAMPOS` que el instrumento acepta. Nada fuera de esta lista se guarda. |
| `template` | Texto con huecos `{{campo}}`. |

`renderPrompt(codigo, valores)` arma el texto final:

- solo usa los campos declarados por el instrumento, recortados a 3000
  caracteres cada uno;
- una cláusula (separada por `.` `;` `,`) cuyos huecos estén todos vacíos se
  cae entera, junto con su etiqueta si era un rótulo suelto (`Iluminación:`);
- una coma antes de mayúscula se convierte en punto (una frase que perdió su
  mitad no puede quedar como «… en español, Si algo no lo sabes»);
- un final en `,` `;` `:` se cierra con punto;
- si el total supera 4000 caracteres (el límite del proveedor) se recorta por
  palabras y se marca `recortado: true`;
- sin ningún campo relleno devuelve `PROMPT_EMPTY`, no un prompt vacío.

`listarInstrumentos({grupo, q})` filtra por grupo y busca sin acentos
(`iluminacion` encuentra `Iluminación`) en el nombre, el código y las etiquetas
de sus campos.

### Estilos del catálogo

`ESTILOS` trae los cuatro de siempre (`cinematic`, `editorial`, `concept-art`,
`photorealistic`) más ocho: `chrome-liquid`, `noir`, `analog`, `brutalist`,
`neon`, `minimal`, `watercolor`, `isometric`. Cada uno lleva el texto que se
inyecta en el prompt:

```
Estilo visual: noir (blanco y negro de alto contraste, sombras duras, humo tenue).
<tu prompt>
Evita: <negative prompt>.
```

Antes el prompt decía solo `Estilo visual: noir.`, que no le dice al modelo qué
hacer con la luz.

### Estilos propios

`estiloDesdePreset(preset)` valida nombre y descripción (≤1000 caracteres),
aplana los saltos de línea a espacios (un salto rompería la línea del estilo y
permitiría colar instrucciones sueltas) y devuelve un código `user:<id>`.

El cliente **nunca** manda el texto del estilo: manda `estiloId` en
`POST /api/ai/images/generate` y el servidor busca el preset del usuario y
resuelve la descripción. Un `style` desconocido sin `styleText` que lo
justifique sigue siendo `400 INVALID_IMAGE_STYLE`.

## API

Todas las rutas exigen sesión (`auth` + `requireUser`) y solo tocan lo del
usuario autenticado; `user` nunca se acepta en el cuerpo.

| Ruta | Respuesta |
| --- | --- |
| `GET /api/prompts/catalog?grupo&q` | `{grupos, instrumentos, estilos, total}`. Instrumentos con sus campos ya resueltos (etiqueta + ejemplo). |
| `GET /api/prompts/presets?tipo&grupo&q` | `{presets, total}` ordenado por favorito, último uso y fecha. Cada preset incluye `prompt` armado al vuelo y `renderError` si el catálogo cambió. |
| `POST /api/prompts/presets` | `201 {preset}`. `400` con `NAME_REQUIRED / NAME_TOO_LONG / INVALID_TYPE / INSTRUMENT_NOT_FOUND / INVALID_VALUES / PROMPT_EMPTY / STYLE_*`; `409 PRESET_LIMIT` (200) o `NAME_TAKEN`. |
| `PATCH /api/prompts/presets/:id` | `{preset}`. Con solo `{favorito}` cambia el favorito; si no, revalida el contenido entero. |
| `DELETE /api/prompts/presets/:id` | `{success, id}`; `404 PRESET_NOT_FOUND`. |
| `POST /api/prompts/presets/:id/aplicar` | `{preset, prompt, estilo}`; `$inc` de `usos` y sella `ultimoUso`. `409 PRESET_NOT_RENDERABLE` si el instrumento desapareció. |

## Modelo `PromptPreset`

`user`, `nombre` (≤80, único por usuario), `tipo` (`preset` | `estilo`),
`instrumento` (código), `valores` (solo campos declarados), `estiloVisual`,
`favorito`, `usos`, `ultimoUso`. Índices: `(user, tipo, ultimoUso)` y
`(user, nombre)` único. Se borra con la cuenta
(`users.routes.js: PromptPreset.deleteMany`) y está declarado en
`server/src/db/registry.js`. Sin índice suelto en `user`: el compuesto ya lo
cubre como prefijo.

## Cliente

- `client/src/services/promptService.js`: envoltorio de las rutas.
- `client/src/features/image-ai/PromptLibrary.jsx`: dos pestañas
  (Instrumentos / Mis presets), filtro por grupo y búsqueda, campos del
  instrumento elegido, vista previa, guardar preset, guardar estilo propio
  (desde el instrumento 18), usar, favorito y borrar.
- `client/src/features/image-ai/renderPrompt.js`: **copia deliberada** de la
  regla del servidor para pintar la vista previa sin un viaje por pulsación de
  tecla. `client/test-ui/prompt-parity.spec.jsx` compara las dos versiones con
  los 54 instrumentos y seis juegos de valores; si una cambia sin la otra, la
  prueba falla.
- `ImageGenerator.jsx`: el selector de estilo se llena del catálogo (con los
  cuatro de fábrica como respaldo si la petición falla) y el estilo propio se
  suma sin borrar el prompt del formulario.

## Límites conocidos

- Los presets no se comparten entre usuarios: no hay presets públicos ni
  enlace para copiar uno de otra persona.
- El contador `usos` sube al aplicar el preset, no al generar la imagen: sirve
  para ordenar la lista, no como facturación.
- La vista previa del cliente duplica la regla del servidor; la red de
  seguridad es la prueba de paridad, no una llamada.

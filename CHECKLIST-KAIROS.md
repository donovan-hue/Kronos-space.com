# KAIROS — checklist de alcance de producción

> **Qué es esto.** Kairos no es una sección de la red social: es un **producto
> aparte** con suscripción propia. Este documento audita **solo Kairos**, con el
> criterio de «esto tiene que poder venderse a un creador profesional».
>
> **Cómo se verificó.** Leyendo el código real, no el checklist anterior. Cada
> afirmación sale de un archivo concreto; lo que no encontré, lo digo.
>
> **Fecha:** 2026-11-05 · **Rama:** `arena/b87f97a6-kronos-space-com`
> **Estado del producto:** uso interno / beta. **No** listo para cobrar.

---

## 0. Veredicto en una línea

Kairos **genera de verdad** imagen, video, guion, voz y chat, y tiene un editor
de video serio. Pero le faltan **cinco piezas de producto** que ningún usuario
paga: control real del video, música propia, personajes, consistencia visual y
una biblioteca de estudio. Y una **sexta** que es de negocio: la suscripción.

**Cobertura honesta: ~55 % de un producto de pago.** La base técnica está; el
producto creativo no.

---

## 1. Lo que YA está y funciona

Verificado archivo por archivo. Esto no hay que volver a pedirlo.

### 1.1 Generación (motores conectados)

| Capacidad | Ruta | Modelo/proveedor | Estado |
|---|---|---|---|
| Chat | `POST /api/ai/chat` + hilos persistentes | OpenRouter | ✅ real |
| Imagen | `POST /api/ai/images/generate` | `google/gemini-2.5-flash-image` | ✅ real |
| Video | `POST /api/ai/videos/generate` + sondeo | `VIDEO_API_*` | ✅ real, asíncrono |
| Guion | `POST /api/ai/scripts/generate` | OpenRouter | ✅ real, JSON estructurado |
| Voz (locución) | `POST /api/voices/locucion` | `x-ai/grok-voice-tts-1.0` | ✅ real, MP3 guardado |
| Música | — | **ninguno** | ⚠️ solo catálogo que sube un admin |

Sin `OPENROUTER_API_KEY` / `VIDEO_API_KEY` las rutas responden **503 con el
motivo**, no resultados simulados. `GET /api/kairos/capacidades` dice en vivo
qué está listo y qué variable falta.

### 1.2 Librerías creativas

| Librería | Dónde | Qué trae |
|---|---|---|
| **Filtros** | `client/src/lib/mediaStudio.js` | **16**: vivo, suave, frío, cálido, crepúsculo, niebla, claridad, sombra, retro, noir, plata, cromo, bruma, vintage, chispa, original |
| **Ajustes de tono** | idem | **8**: brillo, contraste, saturación, calidez, exposición, desenfoque, viñeta, grano (con límites en `LIMITES_AJUSTE`) |
| **Transiciones** | `client/src/lib/videoTransitions.js` | **5**: corte, fundido, negro, blanco, barrido |
| **Plantillas** | `client/src/features/projects/templates.js` | **4**: reel 9:16, cuadrado 1:1, panorámica, portada — con escenas y rótulos escritos |
| **Estilos de imagen** | `image.routes.js:82` | Lista **cerrada de 4**: cinematic, editorial, concept-art, photorealistic (otro valor → 400) |
| **Personalidades de chat** | `ai-core/services/personality.service.js` | 4: Normal, Directo, Sarcástico, Mal humor |
| **Recorte de video** | `lib/videoTrim.js` + `media/VideoTrim.jsx` | aplicado en el feed (recién hecho) |

### 1.3 El estudio de edición (lo más maduro del producto)

Sobre una foto o un video se puede: filtro + tono, texto superpuesto, música
con recortes y fundidos, locución, secuencia de tomas con transiciones, y
**exportación** (`videoExport.js`, `videoExportFrame.js`). Todo se guarda como
**receta** (`media.edit`) y el feed la reproduce.

### 1.4 Operación y control

- Hilos de chat persistentes, con búsqueda y adjuntos (imagen + texto).
- Historia y trabajos de video con sondeo, progreso y errores.
- **Libro de consumo** (`AiUsage`) por capacidad + **cuota que corta** con 402.
- Feature flags que apagan de verdad en el servidor.
- Admin de catálogos (`/admin/catalogos`): alta, edición y baja de voces y pistas.

---

## 2. Lo que FALTA para producción

Ordenado por lo que impide vender. Cada punto dice **qué es**, **dónde vive hoy
el hueco** y **qué cuenta como terminado**.

### 2.1 🔴 Control real de video — *bloqueante*

Hoy `controlsFromBody` solo acepta `prompt`, `negativePrompt` y `style`.

- [ ] **Duración** de la pieza (el creador elige 4 s, 8 s, 12 s…).
- [ ] **Encuadre/relación de aspecto** (9:16, 1:1, 16:9) coherente con el destino.
- [ ] **Semilla / reproducibilidad**: poder repetir un resultado que gustó.
- [ ] **Modelo elegible** por el creador (hoy `provider.model` se fija en el servidor; el usuario no elige).
- [ ] **Presupuesto previo**: decir cuánto consumirá antes de lanzar.
- *Nota:* `providerRequestBody` ya reenvía `model`, así que la tubería existe; falta exponerlo.
- *Terminado cuando:* el formulario pide esos cinco y la generación los respeta.

### 2.2 🔴 Música propia y generación musical — *bloqueante*

- [ ] **Subir música propia desde Kairos**: `POST /api/music` exige `requireAdmin`; el creador solo puede leer el catálogo (`GET /api/music`, `GET /api/music/:trackId`).
- [ ] **Generar melodía/canción por IA** (no existe: no hay proveedor ni ruta).
- [ ] **Biblioteca personal** de pistas, separada del catálogo global.
- [ ] Marcar licencia y uso comercial por pista.
- *Terminado cuando:* un creador usa **su** música sin pedirle permiso a un admin.

### 2.3 🔴 Personajes y consistencia visual — *bloqueante*

Hoy «personaje» solo aparece como campo de texto en el JSON del guion.

- [ ] **Entidad Personaje** (nombre, descripción, rasgos, imagen de referencia).
- [ ] **Consistencia entre generaciones**: el mismo personaje se parece a sí mismo.
- [ ] **Consistencia de estilo**: paleta/look guardados como preselección reusable.
- [ ] **Estilos visuales ampliables**: hoy son **4 fijos en el servidor** y rechaza cualquier otro con 400; no hay estilo propio del creador ni importación de referencia.
- [ ] Personajes reutilizables en guion, imagen y video.
- *Terminado cuando:* puedo hacer 10 escenas del mismo personaje y se reconocen.

### 2.4 🔴 Interfaz de navegación de Kairos — *bloqueante*

Hoy Kairos vive **dentro del shell de la red social** (`AppLayout`), con la
misma barra inferior de cinco destinos.

- [ ] **Shell propio**: navegación lateral de estudio, no la barra social.
- [ ] **Área de trabajo por proyecto**, no pantallas sueltas por capacidad.
- [ ] **Barra de estado del estudio**: proveedor activo, cuota restante, trabajos en curso.
- [ ] **Acceso separado** (`/studio` o subdominio) con su propio registro/login.
- *Terminado cuando:* entrar a Kairos se siente otro producto, no otra pestaña.

### 2.5 🟠 Biblioteca y proyectos de estudio

- [ ] **Biblioteca de estudio propia**: `/library` (`MediaLibrary.jsx`) existe pero vive en el shell social y lista cada variación suelta, sin agrupar ni coleccionar.
- [ ] **Colecciones/carpetas** propias del creador.
- [ ] **Proyecto como contenedor real**: guion + tomas + música + versiones en un sitio.
- [ ] **Versionado**: comparar y volver a una versión anterior.
- [ ] Reutilizar la receta de una pieza como punto de partida.

### 2.6 🟠 Edición y postproducción

- [ ] **Recorte posterior al render** (recortar un video ya generado).
- [ ] **Edición de imagen existente** (inpainting / outpainting / variaciones dirigidas).
- [ ] **Subtítulos**: el servidor **sí** tiene modelo, `parseSubtitles` y `PATCH /api/posts/:postId/subtitles`, y `MediaViewer` pinta `<track>`; falta **generarlos automáticamente** y la UI que los envía (hoy `CreatePost` manda `subtitles: []`).
- [ ] **Transcodificación / variantes**: `variants` existe en el modelo pero se guarda **siempre vacío** (`posts.routes.js:455`). No hay 720p/480p ni póster de video subido.

### 2.7 🟠 Chat de creador

- [ ] **Contexto del estudio**: que el chat vea el guion, el proyecto y las tomas.
- [ ] **Streaming de respuesta** (hoy llega de golpe) y **cancelar**.
- [ ] **Prompts guardados** y estilos de instrucción propios.

### 2.8 🟡 Consistencia y calidad

- [ ] **Cola real con reintentos** para video (hoy el sondeo vive en el cliente; sin semilla no hay repetición fiable).
- [ ] **Límite de trabajos simultáneos** por cuenta.
- [ ] **Reintento con otra semilla** desde la propia pieza.
- [ ] **Aviso de trabajos largos** (notificación al terminar).

---

## 3. Suscripciones — **NO ahora**

Esto se hace **después** de §2.1–2.4, como tú pediste. Se documenta aquí para
que no se pierda, no para desarrollarlo todavía.

- [ ] Plan en la cuenta (`free` / `creador` / `estudio`) — hoy **no existe** campo.
- [ ] Pasarela de cobro recurrente (Stripe u otra) con webhooks.
- [ ] **Guarda de acceso**: hoy **cualquier usuario registrado usa Kairos gratis**.
- [ ] **Cuota por plan** (hoy la cuota es global por entorno, no por nivel).
- [ ] Pantalla de plan, facturas y cancelación.
- [ ] Qué desbloquea cada nivel (tabla de entitlements).

> **Verificado:** no hay `plan` ni `tier` en `User`, no hay tabla de
> suscripciones, no hay middleware de entitlement y `/kairos` está tras
> `ProtectedRoute` como cualquier pantalla social.

---

## 4. Orden de ataque propuesto

1. **§2.4 shell propio** — sin esto no hay «producto Kairos», solo una pestaña.
2. **§2.1 control de video** — es lo que un creador nota primero.
3. **§2.3 personajes + consistencia** — lo que diferencia a un estudio de un juguete.
4. **§2.2 música propia** — quitar al admin del camino del creador.
5. **§2.5 biblioteca/proyectos** — que el trabajo no se pierda.
6. **§2.6–2.8** pulido.
7. **§3 suscripciones** — cuando 1–4 estén cerrados.

---

## 5. Lo que NO voy a fingir

- **No hay generación de música.** Ninguna ruta, ningún proveedor. Si la quieres, es integración nueva.
- **No hay personajes** más allá de un campo de texto en el guion.
- **No hay consistencia visual** entre generaciones.
- **No hay suscripción** ni control de acceso a Kairos.
- **No hay streaming** en el chat.
- **No hay semilla ni elección de modelo de video**; `providerRequestBody` los soporta, la UI no los pide.
- **`variants` siempre vacío** y los subtítulos existen pero nadie los genera: no los cuento como hechos.
- Los 203 tests E2E se omiten en local por falta de `KRONOS_E2E_MONGODB_URI`; en CI sí corren.

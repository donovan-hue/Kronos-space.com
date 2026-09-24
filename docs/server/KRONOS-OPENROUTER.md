# KRONOS · OpenRouter (conexión real y prueba de humo)

Documento operativo de la integración con OpenRouter: qué usa Kronos, cómo se
conecta, cómo se comprueba **de verdad** y qué se ha podido verificar y qué no.

## 1. Alcance real

| Capacidad | Proveedor | Modelo por defecto | Ruta |
| --- | --- | --- | --- |
| Guion (`/api/ai/scripts/generate`) | **OpenRouter** | `openrouter/free` | `POST /api/v1/chat/completions` |
| Imagen (`/api/ai/images/generate`) | **OpenRouter** | `google/gemini-2.5-flash-image` | `POST /api/v1/images/generations` |
| Chat de Kairos (`/api/ai/chat`) | Gemini (`@google/genai`) | `gemini-2.5-flash` | SDK de Google |
| Video (`/api/ai/videos/generate`) | `VIDEO_API_URL` propio | `video-generation` | HTTP propio |

Solo las dos primeras filas son OpenRouter. La prueba de humo cubre esas dos;
el chat y el video tienen sus propias variables y no se fingen aquí.

## 2. Un único punto de conexión

`server/src/config/openrouter.js` es el único sitio donde vive la conexión:

- base URL oficial `https://openrouter.ai/api/v1`;
- cabeceras de aplicación `HTTP-Referer` (primer origen de `CLIENT_URL`) y
  `X-Title: Kronos Space`;
- fábrica `createOpenRouterClient()`, que usan **guion e imagen**.

Antes cada servicio copiaba su propio cliente y su propia base URL: un cambio
en una capacidad podía no llegar a la otra. `server/test/openrouter.contract.test.js`
falla si alguien vuelve a duplicar esa conexión.

`OPENROUTER_BASE_URL` permite apuntar a un gateway compatible. Si se define
algo distinto del oficial, la prueba de humo **falla a propósito**: una corrida
contra otro host no verifica `openrouter.ai`.

## 3. Variables

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | — (obligatoria) | Credencial real. Sin ella las rutas de IA devuelven 503. |
| `OPENROUTER_MODEL` | `openrouter/free` | Modelo del guion. `openrouter/free` es el router de modelos gratuitos. |
| `OPENROUTER_IMAGE_MODEL` | `google/gemini-2.5-flash-image` | Modelo de imagen. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Solo para gateways compatibles. |
| `OPENROUTER_IMAGE_SIZE` | `1024x1024` | Tamaño pedido **si el modelo lo declara**. |
| `OPENROUTER_IMAGE_ASPECT_RATIO` | `1:1` | Encuadre usado cuando el modelo declara `aspect_ratio` pero no `size`. |

La prueba de humo se configura además con:

| Variable | Para qué |
| --- | --- |
| `BASE` | Backend desplegado (sin `/api`) para el recorrido completo. |
| `SMOKE_IMAGE=1` | Genera y factura una imagen real. Sin ella, la fase de imagen se omite. |
| `SMOKE_TIMEOUT_MS` | Timeout por petición (por defecto 60000). |

## 4. Prueba de humo

```bash
# 1) Cableado y catálogo real, sin credenciales y sin coste
npm run smoke:openrouter:wire

# 2) Verificación real: credencial + guion real (+ imagen con SMOKE_IMAGE=1)
SMOKE_IMAGE=1 npm run smoke:openrouter

# 3) Recorrido completo contra el backend desplegado (crea un usuario temporal)
BASE=https://api.kronos-space.com SMOKE_IMAGE=1 npm run smoke:openrouter:deployed

# Salida legible por máquina
node scripts/openrouter-smoke.js --json
```

### Fases

| Fase | Necesita | Comprueba |
| --- | --- | --- |
| 1. Configuración | nada | Qué proveedor y qué modelo usa cada capacidad, si la clave está presente y si el host es el oficial. |
| 2. Catálogo | red | `GET /models`, `GET /models/{id}/endpoints` y `GET /images/models/{id}/endpoints`: los modelos configurados existen y el cuerpo que enviamos solo usa parámetros declarados. |
| 3. Credencial | clave | `GET /key`: la clave autentica, crédito restante y cuota diaria de modelos gratuitos. |
| 4. Guion | clave | `POST /chat/completions` con la **misma** petición que producción, y el JSON devuelto pasa por `normalizeScriptStructure` y `formatScriptResult`. |
| 5. Imagen | clave + `SMOKE_IMAGE=1` | `POST /images/generations` con el cuerpo que construye el servicio y validación de los bytes con `detectImageMime`. |
| 6. Extremo a extremo | `BASE` | Usuario temporal, `POST /api/ai/scripts/generate`, `POST /api/ai/images/generate`, descarga del medio generado y cierre de sesión. |

### Códigos de salida

| Código | Significado |
| --- | --- |
| `0` | Todo lo ejecutado pasó. |
| `1` | Alguna comprobación falló. |
| `2` | Configuración incompleta (`--deployed` sin `BASE`). |
| `3` | **No ejecutado**: sin clave ni `BASE` no se verificó nada real. No es un aprobado. |

## 5. Workflow

`.github/workflows/smoke-openrouter.yml` (`Kronos OpenRouter Smoke`):

```bash
gh workflow run "Kronos OpenRouter Smoke" \
  -f base_url=https://api.kronos-space.com \
  -f generate_image=true
```

- `provider`: fases 1-5 contra el proveedor. Exige el secreto
  `OPENROUTER_API_KEY`; si falta, el job **falla** con un mensaje explícito en
  lugar de dar verde.
- `deployed`: fase 6 contra `base_url`, con el medio generado descargado del
  backend real.
- `schedule`: lunes 07:00 UTC **sin** imágenes (detecta modelos retirados o
  parámetros que el proveedor deje de aceptar sin gastar crédito). Si el
  secreto no existe, el job avisa y no finge haber verificado.

Coste de una corrida completa: el guion con `openrouter/free` es 0; la imagen
de `google/gemini-2.5-flash-image` ronda 0.03-0.04 USD según el proveedor que
atienda la petición (el coste real se imprime en el informe).

## 6. Hallazgo corregido: `size` en modelos que no lo declaran

El servicio de imagen enviaba `size: "1024x1024"` de forma fija. El catálogo
real de OpenRouter declara, para `google/gemini-2.5-flash-image`,
`aspect_ratio`, `n` e `input_references` — **no** `size`. OpenRouter rechaza los
parámetros que el endpoint no declara, así que esa petición no era la que el
modelo acepta.

Ahora el cuerpo se construye con lo que el modelo declara
(`server/src/modules/image-ai/image.capabilities.js`):

1. si declara `size`, se envía el tamaño pedido;
2. si no, y declara `aspect_ratio`, se envía `1:1` (o `OPENROUTER_IMAGE_ASPECT_RATIO`);
3. si no se puede consultar el catálogo (red caída, router sin endpoints), se
   envía el cuerpo mínimo `{model, prompt}`, que cualquier modelo acepta.

La consulta de capacidades está cacheada 10 minutos y nunca lanza: un fallo de
descubrimiento no impide generar. La prueba de humo informa qué se pidió, qué
declara el modelo y qué se envía realmente (`catalog.imageFrame`).

## 7. Estado de esta verificación

- Ejecutado y en verde en el entorno de trabajo:
  - `server/test/openrouter.contract.test.js` (16 pruebas de cableado, forma de
    petición, parseo, capacidades y errores traducidos);
  - `server/test/openrouter-smoke.contract.test.js` (5 pruebas de la propia
    prueba de humo: lee bien las respuestas, detecta claves rechazadas y JSON
    con markdown, y **nunca aprueba** contra un host que no sea `openrouter.ai`);
  - `npm run smoke:openrouter:wire`: confirma que la configuración apunta al
    proveedor oficial, pero el entorno de trabajo no tiene salida de red a
    `openrouter.ai` (ECONNRESET), así que el catálogo se informa como **fallo**,
    no como aprobado.
- **No ejecutado aquí**: las fases 3-6 (credencial, guion, imagen y recorrido
  desplegado). Requieren una `OPENROUTER_API_KEY` real y salida a Internet; por
  eso el workflow existe y por eso el script devuelve 3 en lugar de 0 cuando no
  puede verificar. No se ha simulado ninguna respuesta del proveedor para
  declarar esta integración como verificada.

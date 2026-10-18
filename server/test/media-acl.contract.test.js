const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");

/* ============================================================
   Pruebas de contrato del control de acceso de /uploads.

   Cubren seis defectos que sobrevivieron porque nada ejercitaba este
   middleware (no existía ni una prueba que lo mencionara):

     C-02  SAFE_NAME rechazaba music/voices y todo el audio: en producción
           `rememberUpload` respondía 503 y `saveBuffer` borraba el archivo.
     C-03  mediaAcl devolvía 404 a /uploads/music y /uploads/voices.
     C-04  `require("../modules/image/ImageGeneration")` — ruta inexistente,
           silenciada por un `catch {}`.
     A-01  express.static no aplicaba la política de caché de mediaAcl.
     A-02  decodeURIComponent sin guarda: `%zz` salía como 500.
     A-03  sin base de datos, cada petición se colgaba 10 s en el buffer de
           Mongoose.

   HTTP real contra la app real (`../src/server`), que es lo que
   health.test.js establece como criterio: una prueba que reconstruye el
   middleware dentro del propio archivo pasa siempre, incluso con el
   endpoint roto.

   Sin MongoDB. Lo que se comprueba sin base son invariantes puras
   (C-02, C-04) y justamente el comportamiento fail-closed cuando no se
   puede decidir (C-03, A-01, A-02, A-03).
   ============================================================ */

const previousSecret = process.env.JWT_SECRET;
const previousClientUrl = process.env.CLIENT_URL;
const previousEnv = process.env.NODE_ENV;
process.env.JWT_SECRET = "kronos-media-acl-test-secret";
process.env.CLIENT_URL = "https://kronos-space.com";
process.env.NODE_ENV = "test";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { app } = require("../src/server");
const { mediaPath } = require("../src/middleware/mediaAcl");
const { SAFE_NAME, filenameOf } = require("../src/config/durableUploads");
const storage = require("../src/config/storage");

const UPLOADS_ROOT = path.join(__dirname, "../uploads");
const creados = [];
let baseUrl;
let servidor;

function archivoDePrueba(subdir, nombre) {
  const dir = path.join(UPLOADS_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const ruta = path.join(dir, nombre);
  fs.writeFileSync(ruta, "KRONOS-TEST");
  creados.push(ruta);
  return ruta;
}

test.before(async () => {
  // Sin base conectada: readyState 0. Es el estado real de una corrida de
  // pruebas unitarias y también el de un arranque con MongoDB caído.
  assert.notEqual(
    mongoose.connection.readyState,
    1,
    "esta suite asume que no hay base conectada"
  );

  await new Promise((resolve) => {
    servidor = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${servidor.address().port}`;
      resolve();
    });
  });
});

test.after(() => {
  if (servidor) servidor.close();
  for (const ruta of creados) {
    try { fs.unlinkSync(ruta); } catch { /* ya no estaba */ }
  }
  process.env.JWT_SECRET = previousSecret;
  process.env.CLIENT_URL = previousClientUrl;
  process.env.NODE_ENV = previousEnv;
});

/** Pide y devuelve estado + cuerpo, fallando si el servidor lanzó un 500. */
async function pedir(ruta, contexto) {
  const respuesta = await fetch(baseUrl + ruta);
  const texto = await respuesta.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { sinParsear: texto.slice(0, 120) }; }

  assert.notEqual(
    respuesta.status,
    500,
    `${contexto}: ${ruta} produjo 500 (${texto.slice(0, 200)}) — mediaAcl dejó escapar una excepción`
  );
  return { status: respuesta.status, cuerpo, headers: respuesta.headers };
}

/* ------------------------------------------------------------
   C-02 — SAFE_NAME acepta todo lo que storage.js sabe generar
   ------------------------------------------------------------ */

test("C-02: SAFE_NAME acepta todas las combinaciones reales de carpeta y mimetype", async () => {
  const mimetypes = [
    "image/jpeg", "image/png", "image/webp",
    "video/mp4", "video/webm", "video/quicktime",
    "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac",
    "audio/wav", "audio/x-wav", "audio/wave",
    "audio/ogg", "audio/opus", "audio/webm",
    "application/octet-stream"
  ];

  const combinaciones = [];

  for (const subdir of Object.keys(storage.SUBDIRS)) {
    for (const mimetype of mimetypes) {
      const { url } = await storage.saveBuffer({
        buffer: Buffer.from("x"),
        mimetype,
        originalname: "prueba.bin",
        subdir,
        ownerId: null
      });

      const nombre = filenameOf(url);
      creados.push(path.join(UPLOADS_ROOT, nombre));
      combinaciones.push(`${subdir} + ${mimetype}`);

      assert.equal(
        SAFE_NAME.test(nombre),
        true,
        `storage.js generó "${nombre}" (${subdir} + ${mimetype}) y durableUploads.SAFE_NAME lo rechaza: ` +
        "en producción rememberUpload respondería 503 y saveBuffer borraría el archivo local"
      );
    }
  }

  // 5 carpetas x 17 mimetypes: si esto baja, el recorrido se quedó corto.
  assert.equal(
    combinaciones.length,
    Object.keys(storage.SUBDIRS).length * mimetypes.length,
    "no se recorrieron todas las carpetas declaradas en storage.SUBDIRS"
  );
});

test("C-02: SAFE_NAME sigue rechazando lo que no generó el almacenamiento", () => {
  for (const malo of [
    "../etc/passwd",
    "media/../../server.js",
    "media/not-our-name.jpg",
    "media/171000-abc123def456.html",
    "media/171000-abc123def456.exe",
    "secretos/171000-abc123def456.jpg",
    "music/171000-abc123def456.sh",
    "voices/../../../.env",
    "media/171000-ZZZZZZ.jpg"
  ]) {
    assert.equal(SAFE_NAME.test(malo), false, `debió rechazar "${malo}"`);
  }
});

/* ------------------------------------------------------------
   C-04 — el modelo de generaciones de IA se puede cargar
   ------------------------------------------------------------ */

test("C-04: el modelo ImageGeneration existe en la ruta que mediaAcl requiere", () => {
  // Era `../modules/image/ImageGeneration` (carpeta inexistente) dentro de un
  // `catch {}`, así que el MODULE_NOT_FOUND se tragaba en cada petición y las
  // imágenes generadas nunca se autorizaban a su dueño.
  const modelo = require("../src/modules/image-ai/ImageGeneration");
  assert.equal(modelo.modelName, "ImageGeneration");

  const fuente = fs.readFileSync(
    path.join(__dirname, "../src/middleware/mediaAcl.js"),
    "utf8"
  );
  assert.equal(
    fuente.includes("modules/image/ImageGeneration"),
    false,
    "mediaAcl vuelve a apuntar a la carpeta inexistente modules/image/"
  );
  assert.equal(
    /catch\s*\{\s*\}/.test(fuente),
    false,
    "mediaAcl tiene un catch vacío: volvería a silenciar un require roto"
  );
});

/* ------------------------------------------------------------
   C-03 — música y voces entran a la evaluación
   ------------------------------------------------------------ */

test("C-03: /uploads/music y /uploads/voices llegan a la política, no se descartan por prefijo", async () => {
  const nombre = "1710000000000-abcdef012345.mp3";
  archivoDePrueba("music", nombre);
  archivoDePrueba("voices", nombre);

  // La distinción que hace vinculante esta prueba:
  //   503 MEDIA_UNAVAILABLE -> la carpeta se aceptó y la decisión quedó
  //                            bloqueada solo por la falta de base.
  //   404 NOT_FOUND         -> la carpeta se descartó antes de evaluar nada,
  //                            que era exactamente el defecto C-03.
  for (const carpeta of ["music", "voices"]) {
    const { status, cuerpo } = await pedir(
      `/uploads/${carpeta}/${nombre}`,
      carpeta
    );
    assert.equal(
      status,
      503,
      `/uploads/${carpeta} respondió ${status} (${cuerpo.code}): un 404 significa que ` +
      "la carpeta se descarta por prefijo y la pista nunca llega a evaluarse"
    );
    assert.equal(cuerpo.code, "MEDIA_UNAVAILABLE");
  }

  // Una carpeta que storage.js NO declara sigue fuera, y con 404: no hay nada
  // que comprobar, no es una indisponibilidad.
  archivoDePrueba("secretos", nombre);
  const desconocida = await pedir(`/uploads/secretos/${nombre}`, "carpeta no declarada");
  assert.equal(desconocida.status, 404);
  assert.equal(desconocida.cuerpo.code, "NOT_FOUND");
});

/* ------------------------------------------------------------
   A-01 — la política de caché la fija mediaAcl, no express.static
   ------------------------------------------------------------ */

test("A-01: la media pública se sirve con la caché que decide mediaAcl", async () => {
  const nombre = "1710000000000-abcdef012345.png";
  archivoDePrueba("avatars", nombre);
  archivoDePrueba("covers", nombre);

  for (const carpeta of ["avatars", "covers"]) {
    const { status, headers } = await pedir(`/uploads/${carpeta}/${nombre}`, carpeta);
    assert.equal(status, 200, `${carpeta} debe servirse`);
    assert.equal(
      headers.get("cache-control"),
      "public, max-age=604800",
      `${carpeta}: express.static vuelve a imponer su "public, max-age=0" sobre la decisión de mediaAcl`
    );
  }
});

test("A-01: lo que no se puede autorizar no se sirve con caché compartida", async () => {
  const nombre = "1710000000000-abcdef012345.jpg";
  archivoDePrueba("media", nombre);

  // Sin base no se puede decidir si es privado: la respuesta debe llevar la
  // política privada, nunca `public`. Antes el `public, max-age=0` de
  // express.static autorizaba a cualquier caché intermedia a guardarlo.
  const { headers } = await pedir(`/uploads/media/${nombre}`, "media sin base");
  const cacheControl = headers.get("cache-control") || "";
  assert.equal(
    cacheControl.startsWith("public"),
    false,
    `media sin autorizar respondió Cache-Control: ${cacheControl}`
  );
});

/* ------------------------------------------------------------
   A-02 — escapes mal formados
   ------------------------------------------------------------ */

test("A-02: un escape mal formado responde 404, no 500", async () => {
  assert.equal(mediaPath({ baseUrl: "/uploads", path: "/media/%zz" }), null);
  assert.equal(mediaPath({ baseUrl: "/uploads", path: "/media/%E0%A4%A" }), null);
  assert.equal(mediaPath({ baseUrl: "/uploads", path: "/media/1710-a.jpg" }), "/uploads/media/1710-a.jpg");
  assert.equal(mediaPath({ baseUrl: "/uploads", path: "/media/caf%C3%A9.jpg" }), "/uploads/media/café.jpg");

  // Escape MAL FORMADO: `decodeURIComponent` lanza. Sin la guarda eso salía
  // como 500 (`URIError`) y ensuciaba el contador de 5xx de requestContext.
  // La respuesta correcta es 404: un nombre ilegible no es un recurso.
  for (const mala of ["%zz", "%E0%A4%A", "%ff", "%c0%af"]) {
    const { status } = await pedir(`/uploads/media/${mala}`, "escape mal formado");
    assert.equal(status, 404, `"${mala}" debe ser 404, no ${status}`);
  }
});

test("A-02: un escape válido con traversal no sirve el archivo ni revienta", async () => {
  // `%2e%2e%2f` SÍ decodifica (a `../`), así que no es un escape mal formado:
  // entra a la evaluación normal. Lo que se exige es que no sirva nada de
  // fuera de /uploads y que no termine en 500.
  for (const ruta of [
    "/uploads/media/%2e%2e%2f%2e%2e%2fserver.js",
    "/uploads/media/%2e%2e%2fsecretos%2fx.jpg",
    "/uploads/secretos/%2e%2e%2fmedia%2fx.jpg"
  ]) {
    const respuesta = await fetch(baseUrl + ruta);
    const texto = await respuesta.text();

    assert.notEqual(respuesta.status, 500, `${ruta} produjo 500: ${texto.slice(0, 200)}`);
    assert.notEqual(respuesta.status, 200, `${ruta} sirvió un archivo`);
    assert.equal(
      texto.includes("KRONOS-TEST"),
      false,
      `${ruta} devolvió contenido de un archivo de prueba`
    );
    assert.equal(
      texto.includes("const express"),
      false,
      `${ruta} devolvió código fuente`
    );
  }
});

/* ------------------------------------------------------------
   A-03 — sin base de datos se responde rápido
   ------------------------------------------------------------ */

test("A-03: sin MongoDB la petición de media se responde de inmediato", async () => {
  const nombre = "1710000000000-abcdef012345.jpg";
  archivoDePrueba("media", nombre);

  const inicio = Date.now();
  const { status, cuerpo } = await pedir(`/uploads/media/${nombre}`, "media sin base");
  const transcurrido = Date.now() - inicio;

  assert.equal(status, 503);
  assert.equal(cuerpo.code, "MEDIA_UNAVAILABLE");

  // Cuatro consultas encadenadas (post, story, message, draft) quedaban en el
  // buffer de Mongoose: 10 s cada una. El margen es generoso y aun así dos
  // órdenes de magnitud menor que el defecto.
  assert.ok(
    transcurrido < 2000,
    `tardó ${transcurrido} ms: las consultas siguen esperando a una base que no existe`
  );
});

/* ------------------------------------------------------------
   Regresión de recorrido
   ------------------------------------------------------------ */

test("los prefijos vacíos y las rutas fuera de /uploads no rompen el contrato", async () => {
  // Sin base, lo que exige evaluación responde 503 y lo que es
  // estructuralmente inválido responde 404. En ningún caso 500 ni 200.
  const esperados = {
    // carpeta no declarada: no hay nada que comprobar -> 404
    "/uploads/secretos/1710000000000-abcdef012345.jpg": 404,
    // fuera de /uploads: lo atiende el 404 genérico de server.js
    "/ruta-inexistente": 404,
    // /uploads/ a secas: no es ninguna de las cinco carpetas -> 404
    "/uploads/": 404,
    // prefijo de carpeta válida pero sin archivo: exige evaluación -> 503
    "/uploads/media/": 503,
    "/uploads/music/": 503,
    "/uploads/voices/": 503
  };

  for (const [ruta, esperado] of Object.entries(esperados)) {
    const { status, cuerpo } = await pedir(ruta, "recorrido");
    assert.equal(status, esperado, `${ruta} debía ser ${esperado} y fue ${status}`);
    assert.equal(
      cuerpo.code,
      esperado === 503 ? "MEDIA_UNAVAILABLE" : "NOT_FOUND",
      `${ruta} respondió el código de error equivocado`
    );
  }
});

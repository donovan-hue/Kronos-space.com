const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildImageRequestBody,
  MAX_INPUT_REFERENCES,
  MAX_IMAGE_VARIATIONS
} = require("../src/modules/image-ai/image.capabilities");
const { absoluteUploadUrl, MAX_INPUT_REFERENCES: DESDE_SERVICIO } = require("../src/modules/image-ai/image.service");
const { getAIErrorResponse } = require("../src/middleware/aiError");
const ImageGeneration = require("../src/modules/image-ai/ImageGeneration");

/* ============================================================
   EDITAR UNA IMAGEN EXISTENTE — contrato

   El proveedor declara `input_references` y no se usaba: `/ai/images/upload`
   guardaba la imagen y ahí se quedaba. Lo que se cuida aquí:

   - la referencia solo se envía si el modelo la declara (si no, es un 400 del
     proveedor y una edición que el usuario cree hecha);
   - solo se aceptan rutas del almacén propio y de la biblioteca del usuario;
   - la URL que viaja es absoluta (el proveedor no lee `/uploads`);
   - si el modelo no admite la edición, el resultado lo dice (`editApplied`),
     en vez de devolver una imagen nueva como si fuera la editada.

   Nada sale a red ni toca la base.
   ============================================================ */

function fuente(relativa) {
  return fs.readFileSync(path.join(process.cwd(), relativa), "utf8");
}

test("la referencia viaja solo cuando el modelo declara input_references", () => {
  const conSoporte = buildImageRequestBody({
    model: "m",
    prompt: "p",
    declared: new Set(["input_references", "aspect_ratio"]),
    inputReferences: ["https://api.test/uploads/media/a.png"]
  });
  assert.deepEqual(conSoporte.body.input_references, [
    { image_url: "https://api.test/uploads/media/a.png" }
  ]);
  assert.equal(conSoporte.dropped.some((d) => d.parameter === "input_references"), false);

  const sinSoporte = buildImageRequestBody({
    model: "m",
    prompt: "p",
    declared: new Set(["aspect_ratio"]),
    inputReferences: ["https://api.test/uploads/media/a.png"]
  });
  assert.equal(sinSoporte.body.input_references, undefined, "no se manda lo que el modelo no admite");
  const decision = sinSoporte.dropped.find((d) => d.parameter === "input_references");
  assert.ok(decision, "el descarte queda anotado con su motivo");
  assert.match(decision.reason, /no declarado/);

  // Sin capacidades declaradas, cuerpo mínimo: nada de referencias a ciegas.
  const sinCatalogo = buildImageRequestBody({
    model: "m",
    prompt: "p",
    declared: null,
    inputReferences: ["https://api.test/uploads/media/a.png"]
  });
  assert.equal(sinCatalogo.body.input_references, undefined);
});

test("como mucho tres referencias, y las vacías no cuentan", () => {
  assert.equal(MAX_INPUT_REFERENCES, 3);
  assert.equal(DESDE_SERVICIO, 3);

  const muchas = buildImageRequestBody({
    model: "m",
    prompt: "p",
    declared: new Set(["input_references"]),
    inputReferences: Array.from({ length: 8 }, (_, i) => `https://api.test/uploads/${i}.png`)
  });
  assert.equal(muchas.body.input_references.length, 3);

  const conVacias = buildImageRequestBody({
    model: "m",
    prompt: "p",
    declared: new Set(["input_references"]),
    inputReferences: ["  ", "", "https://api.test/uploads/a.png"]
  });
  assert.equal(conVacias.body.input_references.length, 1);
});

test("solo se edita sobre el almacén propio y con URL absoluta", () => {
  // Las rutas relativas del almacén se convierten en absolutas: el proveedor
  // descarga desde su lado y `/uploads/...` no le dice nada.
  const absoluta = absoluteUploadUrl("/uploads/media/a.png", {
    CLIENT_URL: "https://kronos-space.com",
    NODE_ENV: "production",
    CANONICAL_HOST: "kronos-space.com"
  });
  assert.equal(absoluta, "https://api.kronos-space.com/uploads/media/a.png");

  // Una URL externa no se toca ni se acepta: sería un proxy de descargas.
  assert.equal(absoluteUploadUrl("https://evil.test/x.png"), "");
  assert.equal(absoluteUploadUrl("/etc/passwd"), "");
  assert.equal(absoluteUploadUrl(""), "");
});

test("la ruta comprueba que la referencia es del usuario", () => {
  const codigo = fuente("src/modules/image-ai/image.routes.js");

  assert.match(codigo, /startsWith\("\/uploads\/"\)/, "filtra las rutas del almacén");
  assert.match(codigo, /INPUT_REFERENCE_NOT_OWNED/, "rechaza lo que no es del usuario");
  assert.match(codigo, /user: req\.user\.id/, "la consulta va atada al usuario");
  assert.match(codigo, /inputReferences: referenciasLimpias/);

  // Y el modelo guarda con qué se trabajó.
  assert.equal(ImageGeneration.schema.path("inputReferences").instance, "Array");
});

test("los errores de referencia no se disfrazan de fallo del proveedor", () => {
  const referencia = getAIErrorResponse(new Error("INVALID_INPUT_REFERENCE"));
  assert.equal(referencia.status, 400);
  assert.equal(referencia.code, "INVALID_INPUT_REFERENCE");

  const ajenas = getAIErrorResponse(new Error("INPUT_REFERENCE_NOT_OWNED"));
  assert.equal(ajenas.status, 403);
  assert.equal(ajenas.code, "INPUT_REFERENCE_NOT_OWNED");

  const muchas = getAIErrorResponse(new Error("TOO_MANY_INPUT_REFERENCES"));
  assert.equal(muchas.status, 400);
  assert.match(muchas.message, new RegExp(String(MAX_INPUT_REFERENCES)));
});

test("una edición que el modelo no admite se declara como tal", () => {
  const codigo = fuente("src/modules/image-ai/image.service.js");
  assert.match(codigo, /editApplied:/);
  assert.match(codigo, /IMAGE_EDIT_UNSUPPORTED/);
  // Sin referencias, `editApplied` no puede decir que se editó.
  assert.match(codigo, /cleanReferences\.length > 0/);
});

test("variaciones y referencias no se confunden", () => {
  const resultado = buildImageRequestBody({
    model: "m",
    prompt: "p",
    declared: new Set(["input_references", "n"]),
    variations: 2,
    inputReferences: ["https://api.test/uploads/a.png"]
  });
  assert.equal(resultado.body.n, 2);
  assert.equal(resultado.body.input_references.length, 1);
  assert.equal(MAX_IMAGE_VARIATIONS, 4);
});

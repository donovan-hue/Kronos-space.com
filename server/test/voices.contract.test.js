const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const voices = require("../src/modules/voices/voices.routes");
const Voice = require("../src/modules/voices/Voice");
const audio = require("../src/modules/music/audio.routes");
const posts = require("../src/modules/posts/posts.routes");
const Post = require("../src/modules/posts/Post");
const storage = require("../src/config/storage");

/* ============================================================
   VOCES DEL ESTUDIO Y VOZ EN OFF — contrato

   Lo que estas pruebas cuidan:
   - el catálogo de voces dice la verdad: una voz sin modelo o sin el
     servicio configurado se marca como no disponible, con su motivo;
   - una grabación propia se guarda en su propia carpeta;
   - la voz en off sobrevive al guardado con sus topes.
   ============================================================ */

function rutas(router) {
  return (router.stack || [])
    .filter((capa) => capa.route)
    .map((capa) => ({
      ruta: capa.route.path,
      metodos: Object.keys(capa.route.methods),
      nombres: capa.route.stack.map((paso) => paso.name)
    }));
}

const vozBase = {
  _id: "v1",
  nombre: "Ana del estudio",
  tipo: "catalogo",
  modelo: "",
  url: "",
  duracion: 0,
  configurables: ["velocidad", "tono", "volumen"],
  createdAt: new Date()
};

test("el catálogo de voces es una lectura con sesión y escribir es de administración", () => {
  const lista = rutas(voices);

  const catalogo = lista.find((r) => r.ruta === "/" && r.metodos.includes("get"));
  assert.ok(catalogo, "falta GET /api/voices");
  assert.ok(catalogo.nombres.includes("auth"), "el catálogo exige sesión");
  assert.ok(catalogo.nombres.includes("requireUser"), "el catálogo exige usuario");

  const registrar = lista.find((r) => r.ruta === "/" && r.metodos.includes("post"));
  assert.ok(registrar, "falta POST /api/voices");
  assert.ok(registrar.nombres.includes("auth"));
  assert.ok(registrar.nombres.includes("requireAdmin"), "registrar voces es solo de administración");
});

test("una voz sin modelo o sin servicio no se ofrece como disponible", () => {
  const sinModelo = voices.comoVoz(vozBase, { credencial: true });
  assert.equal(sinModelo.disponible, false);
  assert.equal(sinModelo.motivo, "Esta voz todavía no tiene modelo asignado.");

  const sinCredencial = voices.comoVoz({ ...vozBase, modelo: "proveedor/voz" }, { credencial: false });
  assert.equal(sinCredencial.disponible, false);
  assert.match(sinCredencial.motivo, /servicio de voz/);

  const lista = voices.comoVoz({ ...vozBase, modelo: "proveedor/voz" }, { credencial: true });
  assert.equal(lista.disponible, true);
  assert.equal(lista.motivo, "");
  assert.deepEqual(lista.ajustes, ["velocidad", "tono", "volumen"]);

  // Una grabación propia sin archivo tampoco se puede usar.
  const propiaVacia = voices.comoVoz({ _id: "v2", nombre: "Mi voz", tipo: "propia" }, { credencial: false });
  assert.equal(propiaVacia.disponible, false);
  assert.match(propiaVacia.motivo, /grabación/);

  assert.equal(voices.vocesUsables([vozBase, { ...vozBase, modelo: "proveedor/voz" }], true).length, 1);
});

test("las voces solo se sirven desde el almacén propio", () => {
  assert.equal(voices.esUrlLocalDeVoz("/uploads/voices/toma.m4a"), true);
  assert.equal(voices.esUrlLocalDeVoz("/uploads/music/pista.mp3"), false);
  assert.equal(voices.esUrlLocalDeVoz("https://otro-sitio.com/voz.mp3"), false);
  assert.equal(voices.esUrlLocalDeVoz(""), false);
});

test("el esquema de la voz y la carpeta propia están declarados", () => {
  assert.equal(Voice.schema.path("nombre").options.required, true);
  assert.deepEqual(Voice.schema.path("tipo").options.enum, ["propia", "catalogo"]);
  assert.deepEqual(Voice.schema.path("genero").options.enum, ["femenina", "masculina", "neutra", ""]);
  assert.equal(Voice.schema.path("lista").options.default, false);
  assert.ok(storage.VOICES_DIR.endsWith(path.join("uploads", "voices")), "la voz tiene su carpeta");
});

test("subir audio acepta el destino de voz y guarda en su carpeta", () => {
  const fuente = fs.readFileSync(path.join(process.cwd(), "src/modules/music/audio.routes.js"), "utf-8");
  assert.ok(fuente.includes('req.body?.destino === "voz"'), "la ruta distingue el destino");
  assert.ok(fuente.includes('subdir: destino === "voz" ? "voices" : "music"'), "cada destino tiene su carpeta");
  assert.ok(rutas(audio).some((r) => r.ruta === "/audio"), "sigue existiendo POST /api/uploads/audio");
});

test("la voz en off entra en la receta con topes", () => {
  const resultado = posts.parseEdit({
    voz: { url: "/uploads/voices/mi-voz.m4a", nombre: "Mi voz", inicio: 2, fin: 12, volumen: 1.6, fundidoEntrada: 40 }
  });
  assert.equal(resultado.error, undefined, resultado.error || "");
  assert.equal(resultado.edit.voz.url, "/uploads/voices/mi-voz.m4a");
  assert.equal(resultado.edit.voz.volumen, 1, "el volumen se acota");
  assert.equal(resultado.edit.voz.fundidoEntrada, 5, "el fundido no pasa de la mitad de la toma");
  assert.equal(resultado.edit.voz.tipo, "propia");

  const catalogo = posts.parseEdit({ voz: { voiceId: "v1", tipo: "catalogo" } });
  assert.equal(catalogo.edit.voz.voiceId, "v1");
  assert.equal(catalogo.edit.voz.url, "");

  const externa = posts.parseEdit({ voz: { url: "ftp://otro-sitio.com/voz.mp3" } });
  assert.match(externa.error, /voz/);

  const sin = posts.parseEdit({ medida: "1:1" });
  assert.equal(sin.edit.voz, undefined, "sin voz no se inventa el campo");
});

test("la voz vive en el esquema de la receta y el servidor monta su ruta", () => {
  const media = Post.schema.path("media");
  assert.ok(media.schema.path("edit.voz.url"), "el esquema guarda la voz");
  assert.equal(media.schema.path("edit.voz.volumen").options.max, 1);
  assert.deepEqual(media.schema.path("edit.voz.tipo").options.enum, ["propia", "catalogo", ""]);

  const servidor = fs.readFileSync(path.join(process.cwd(), "src/server.js"), "utf-8");
  assert.ok(servidor.includes('app.use("/api/voices", voiceRoutes)'), "falta montar /api/voices");
});

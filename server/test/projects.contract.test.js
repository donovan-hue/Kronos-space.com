const test = require("node:test");
const assert = require("node:assert/strict");

const Project = require("../src/modules/projects/Project");
const projectsRouter = require("../src/modules/projects/projects.routes");

function rutas() {
  return (projectsRouter.stack || []).map((layer) => layer.route).filter(Boolean);
}

test("proyectos guardan dueño, formato acotado y escenas con orden y guion", () => {
  assert.equal(Project.schema.path("owner").options.ref, "User");
  assert.equal(Project.schema.path("owner").options.required, true);
  assert.equal(Project.schema.path("title").options.maxlength, Project.MAX_TITLE);
  assert.equal(Project.schema.path("brief").options.maxlength, Project.MAX_BRIEF);
  // El orden es el del enum de `Project.js`. `parseFormat()` no rechaza lo
  // desconocido: lo convierte en `libre`, así que un formato añadido en la
  // interfaz sin añadirlo aquí se guarda sin formato y sin ruido.
  // `client/test/formatos-plantillas.test.mjs` cruza esta lista contra las
  // plantillas de la pantalla.
  assert.deepEqual(
    Project.schema.path("format").enumValues,
    ["reel", "cuadrado", "panoramica", "portada", "libre"]
  );
  assert.equal(Project.schema.path("scenes").instance, "Array");
  assert.equal(Project.schema.path("scenes").schema.path("order").instance, "Number");
  assert.equal(Project.schema.path("scenes").schema.path("script").options.maxlength, Project.MAX_SCRIPT);
  assert.deepEqual(
    Project.schema.path("scenes").schema.path("mediaType").enumValues,
    ["", "image", "video", "audio"]
  );
  assert.equal(Project.schema.path("archived").options.default, false);
  assert.ok(Project.schema.indexes().some(([fields]) => fields.owner === 1 && fields.updatedAt === -1));
});

test("las versiones congelan una copia completa y están topadas", () => {
  const version = Project.schema.path("versions").schema;
  assert.equal(version.path("snapshot").options.required, true);
  assert.equal(version.path("label").options.maxlength, 80);
  ["title", "brief", "format", "musicTitle", "musicUrl", "scenes"].forEach((campo) => {
    assert.ok(version.path(`snapshot.${campo}`), `la instantánea debe guardar ${campo}`);
  });
  assert.equal(Project.MAX_VERSIONS, 30);
  assert.equal(Project.MAX_SCENES, 60);
});

test("cada ruta de proyectos exige sesión y un identificador válido", () => {
  const esperadas = [
    ["get", "/"],
    ["post", "/"],
    ["get", "/:projectId"],
    ["patch", "/:projectId"],
    ["delete", "/:projectId"],
    ["post", "/:projectId/versions"],
    ["delete", "/:projectId/versions/:versionId"]
  ];
  const declaradas = rutas().map((route) => [route.methods.get ? "get" : route.methods.post ? "post" : route.methods.patch ? "patch" : "delete", route.path]);
  assert.deepEqual(
    declaradas.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])),
    esperadas.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
  );
  rutas().forEach((route) => {
    const capas = route.stack.length;
    assert.ok(capas >= 3, `${route.path} debe encadenar auth, requireUser y el manejador`);
  });
});

test("el proyecto ajeno responde 404 igual que el inexistente", () => {
  const fuente = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../src/modules/projects/projects.routes.js"),
    "utf8"
  );
  const bloque = fuente.slice(fuente.indexOf("function findOwned"), fuente.indexOf("router.get(\"/\""));
  assert.match(bloque, /_id:\s*projectId[\s\S]*owner:\s*ownerId/, "la consulta filtra por dueño");
  assert.match(fuente, /status\(404\)/, "un proyecto ajeno no se distingue del inexistente");
});

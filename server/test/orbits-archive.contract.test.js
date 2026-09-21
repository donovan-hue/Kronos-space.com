const test = require("node:test");
const assert = require("node:assert/strict");

const Orbit = require("../src/modules/orbits/Orbit");
const orbitsRouter = require("../src/modules/orbits/orbits.routes");

test("la órbita guarda un paquete de bienvenida acotado", () => {
  const welcome = Orbit.schema.path("welcomeMessage");
  assert.equal(welcome.instance, "String");
  assert.equal(welcome.options.maxlength, 1000);
  assert.equal(welcome.options.default, "");
});

test("GET /archived se registra antes que /:orbitId y exige sesión", () => {
  const routes = orbitsRouter.stack.filter((layer) => layer.route);
  const paths = routes.map((layer) => layer.route.path);
  const archivedIndex = paths.indexOf("/archived");
  const detailIndex = paths.indexOf("/:orbitId");
  assert.ok(archivedIndex >= 0, "falta GET /archived");
  assert.ok(detailIndex > archivedIndex, "/archived debe declararse antes que /:orbitId");

  const archived = routes[archivedIndex].route;
  assert.equal(archived.methods.get, true);
  const names = archived.stack.map((layer) => layer.name);
  assert.ok(names.includes("auth"));
  assert.ok(names.includes("requireUser"));
});

test("el detalle legible del archivo no abre la puerta a extraños", async () => {
  // Contrato documental: el flujo de archivo filtra por owner o miembro.
  // (La prueba E2E con MongoDB real cubre el comportamiento completo.)
  const source = require("fs").readFileSync(
    require("path").join(__dirname, "..", "src", "modules", "orbits", "orbits.routes.js"),
    "utf8"
  );
  const archiveBlock = source.slice(
    source.indexOf("Archivo: una órbita vencida"),
    source.indexOf("Archivo: una órbita vencida") + 600
  );
  assert.match(archiveBlock, /\$or: \[\{ owner: req\.user\.id \}, \{ "members\.user": req\.user\.id \}\]/);
});

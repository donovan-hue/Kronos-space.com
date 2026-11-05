const test = require("node:test");
const assert = require("node:assert");

const { router } = require("../src/modules/search/search.routes");

/**
 * Descubrimiento (bloque 1.2): temas en tendencia y a quién seguir.
 *
 * El pendiente era «sin tendencias ni sugerencias de a quién seguir más allá de
 * lo que ya hay en Explorar». Lo que estos contratos protegen es el criterio:
 * una tendencia cuenta personas distintas y respeta la audiencia; una
 * sugerencia nunca es alguien a quien ya sigues y siempre puede explicarse.
 */

const rutas = router.stack.filter((capa) => capa.route).map((capa) => capa.route.path);

test("el buscador expone tendencias y sugerencias, detrás de sesión", () => {
  assert.ok(rutas.includes("/trending"));
  assert.ok(rutas.includes("/suggestions"));

  for (const capa of router.stack.filter((item) => item.route)) {
    assert.ok(
      capa.route.stack.length >= 3,
      `la ruta ${capa.route.path} debe exigir auth y usuario`
    );
  }
});

test("las tendencias cuentan personas distintas y respetan lo que puedes ver", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const fuente = fs.readFileSync(
    path.join(__dirname, "..", "src", "modules", "search", "search.routes.js"),
    "utf8"
  );

  // Autores distintos, no publicaciones: 40 publicaciones de una persona no
  // son una tendencia.
  assert.match(fuente, /autores: \{ \$addToSet: "\$author" \}/);
  assert.match(fuente, /autores: \{ \$size: "\$autores" \}/);
  // El mismo filtro de audiencia y moderación que el feed.
  assert.match(fuente, /withAudienceFilter\([\s\S]{0,200}feedConstraints\(req\.user\.id\)/);
  // Se ordena por personas y la ruta del enlace va codificada.
  assert.match(fuente, /\{ \$sort: \{ autores: -1, publicaciones: -1, tag: 1 \} \}/);
  assert.match(fuente, /ruta: `\/hashtag\/\$\{encodeURIComponent\(fila\.tag\)\}`/);
});

test("a quién seguir: nunca tú, nunca a quien ya sigues, nunca bloqueados", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const fuente = fs.readFileSync(
    path.join(__dirname, "..", "src", "modules", "search", "search.routes.js"),
    "utf8"
  );

  assert.match(fuente, /getExcludedUserIds\(req\.user\.id\)/);
  assert.match(fuente, /new Set\(\[\.\.\.siguiendo, \.\.\.excluidos\.map\(\(id\) => String\(id\)\), String\(req\.user\.id\)\]\)/);
  assert.match(fuente, /"profilePrivacy\.discoverable": \{ \$ne: false \}/);
  // Amigos en común antes que seguidores: si no, siempre salen las mismas
  // cuentas enormes.
  assert.match(fuente, /\.sort\(\(a, b\) => b\.amigos - a\.amigos \|\|/);
  // Cada sugerencia puede explicarse.
  assert.match(fuente, /motivo: amigos > 0/);
});

test("la interfaz dice el criterio y quita de la lista a quien acabas de seguir", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const pantalla = fs.readFileSync(
    path.join(__dirname, "..", "..", "client", "src", "features", "users", "UserSearch.jsx"),
    "utf8"
  );

  assert.match(pantalla, /Temas en tendencia/);
  assert.match(pantalla, /A quién seguir/);
  // El motivo lo calcula el servidor y la pantalla lo pinta tal cual.
  assert.match(pantalla, /persona\.motivo/);
  assert.match(pantalla, /current\.sugerencias\.filter\(\(item\) => String\(item\._id\) !== String\(userId\)\)/);
});

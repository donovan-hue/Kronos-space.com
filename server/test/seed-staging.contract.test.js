const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

/**
 * KRONOS — contrato del generador de la base de ensayo.
 *
 * La siembra solo se ejecuta en CI, donde hay MongoDB. Si genera datos que
 * violan un índice `unique` del plan, la migración 004 no puede crear ese
 * índice y toda la cadena de evidencia se cae por culpa del generador, no
 * del código que se quiere demostrar.
 *
 * Estas pruebas verifican EN MEMORIA, sin base de datos, que el conjunto
 * generado cumple lo que la migración y las consultas críticas esperan:
 *
 *   - ningún índice único del plan queda duplicado;
 *   - las reglas de integridad no tienen nada que reprochar;
 *   - los identificadores fijos de las consultas críticas existen y
 *     devuelven filas, para que `explain()` mida algo real;
 *   - cada URL multimedia sembrada apunta a un archivo que existe.
 */

const ROOT = path.join(__dirname, "..", "..");

const mongoose = require("mongoose");
const seed = require(path.join(ROOT, "scripts", "db", "seed-staging.js"));
const { desiredIndexList } = require(path.join(ROOT, "server", "src", "db", "indexPlan.js"));
const { IDS } = seed;

/** Conjunto pequeño pero con la misma forma que el de CI. */
function generar() {
  const almacen = seed.buildMediaPool(16);
  const volume = Object.fromEntries(
    Object.entries(seed.BASE_VOLUME).map(([key, value]) => [key, Math.max(4, Math.round(value * 0.04))])
  );
  const { conjuntos, legacy } = seed.buildDataset(mongoose, volume, almacen);
  return { almacen, legacy, datos: new Map(conjuntos) };
}

let generado = null;

test.before(() => {
  generado = generar();
});

test.after(() => {
  seed.clearMediaPool();
});

/** Lee un campo con notación de puntos. */
function valorDe(documento, campo) {
  return campo.split(".").reduce((actual, parte) => (actual == null ? actual : actual[parte]), documento);
}

test("ningún índice único del plan se viola con los datos sembrados", () => {
  const unicos = desiredIndexList().filter((index) => index.options?.unique);
  assert.ok(unicos.length >= 10, "el plan debe declarar índices únicos que verificar");

  let comprobados = 0;

  for (const index of unicos) {
    const documentos = generado.datos.get(index.collection);
    if (!documentos || !documentos.length) continue;

    const campos = Object.keys(index.key);
    const vistos = new Map();

    for (const documento of documentos) {
      const partes = campos.map((campo) => valorDe(documento, campo));

      // `sparse` y `partialFilterExpression` excluyen documentos incompletos:
      // el índice no los indexa y por tanto no puede rechazarlos.
      if (index.options.sparse && partes.some((parte) => parte === undefined || parte === null)) continue;
      if (index.options.partialFilterExpression) {
        const cumple = Object.entries(index.options.partialFilterExpression).every(([campo, condicion]) => {
          const valor = valorDe(documento, campo);
          if (condicion?.$type === "objectId") return valor && typeof valor === "object" && valor._bsontype === "ObjectId";
          if (condicion?.$type === "string") return typeof valor === "string";
          return valor === condicion;
        });
        if (!cumple) continue;
      }

      const clave = partes.map((parte) => String(parte)).join("\u0000");
      const previo = vistos.get(clave);

      assert.ok(
        previo === undefined,
        `${index.collection}.${index.name}: clave duplicada ${clave} (documentos ${previo} y ${String(documento._id)})`
      );

      vistos.set(clave, String(documento._id));
    }

    comprobados += 1;
  }

  assert.ok(comprobados >= 8, `se esperaban al menos 8 índices únicos con datos, hubo ${comprobados}`);
});

test("ningún dato sembrado incumple una regla crítica de integridad", () => {
  const datos = generado.datos;
  const usuarios = new Set(datos.get("users").map((item) => String(item._id)));
  const problemas = [];

  // users.required-fields (crítica). Los defaults sin materializar son
  // deliberados y se comprueban aparte: son de severidad `warning`.
  for (const usuario of datos.get("users")) {
    if (!usuario.username || !usuario.email) problemas.push(`usuario sin username o email: ${usuario._id}`);
    if (!["user", "admin"].includes(usuario.role)) problemas.push(`rol inválido: ${usuario.role}`);
  }

  // users.username.unique-lower / users.email.unique-lower
  for (const campo of ["username", "email"]) {
    const vistos = new Set();
    for (const usuario of datos.get("users")) {
      const clave = String(usuario[campo]).toLowerCase();
      if (vistos.has(clave)) problemas.push(`${campo} duplicado ignorando mayúsculas: ${clave}`);
      vistos.add(clave);
    }
  }

  // posts.*
  for (const post of datos.get("posts")) {
    if (!post.author) problemas.push(`publicación sin autor: ${post._id}`);
    else if (!usuarios.has(String(post.author))) problemas.push(`publicación con autor inexistente: ${post._id}`);
    // Una publicación antigua NO tiene `audience`: la regla crítica solo
    // castiga una audiencia presente y mal formada.
    if (post.audience) {
      if (!["public", "followers", "private", "circle", "orbit"].includes(post.audience.type)) {
        problemas.push(`audiencia inválida: ${post.audience.type}`);
      }
      if (post.audience.type === "circle" && !post.audience.circleId) problemas.push(`círculo sin id: ${post._id}`);
      if (post.audience.type === "orbit" && !post.audience.orbitId) problemas.push(`órbita sin id: ${post._id}`);
    }
  }

  // messages.sender.exists / messages.destination
  for (const mensaje of datos.get("messages")) {
    if (!usuarios.has(String(mensaje.sender))) problemas.push(`mensaje con emisor inexistente: ${mensaje._id}`);
    if (!mensaje.receiver && !mensaje.conversation) problemas.push(`mensaje sin destino: ${mensaje._id}`);
  }

  // notifications (la ausencia de `read` es deliberada y de severidad aviso)
  for (const notificacion of datos.get("notifications")) {
    if (!usuarios.has(String(notificacion.recipient))) problemas.push(`notificación con destinatario inexistente: ${notificacion._id}`);
  }

  // conversations.members.range
  for (const conversacion of datos.get("conversations")) {
    const total = (conversacion.members || []).length;
    if (total < 2 || total > 10) problemas.push(`conversación con ${total} miembros: ${conversacion._id}`);
  }

  // capsules.opensAt.required / stories.expiresAt.required
  for (const capsula of datos.get("capsules")) {
    if (!capsula.opensAt) problemas.push(`cápsula sin opensAt: ${capsula._id}`);
  }
  for (const historia of datos.get("stories")) {
    if (!historia.expiresAt) problemas.push(`historia sin expiresAt: ${historia._id}`);
  }

  // imagegenerations.user.exists
  for (const generacion of datos.get("imagegenerations")) {
    if (!usuarios.has(String(generacion.user))) problemas.push(`generación con usuario inexistente: ${generacion._id}`);
  }

  assert.deepStrictEqual(problemas.slice(0, 10), [], `${problemas.length} incumplimientos críticos en los datos sembrados`);
});

test("la fracción de documentos antiguos existe y solo produce avisos", () => {
  const datos = generado.datos;
  const legacy = generado.legacy;

  // Sin documentos antiguos, las migraciones 002, 003 y 005 informarían
  // "0 afectados" y no demostrarían que transforman nada.
  for (const [coleccion, esperados] of Object.entries(legacy)) {
    assert.ok(esperados > 0, `${coleccion}: la siembra debe dejar documentos antiguos que migrar`);
  }

  const sinDefaults = datos.get("users").filter((item) => item.preferences === undefined);
  const sinAudiencia = datos.get("posts").filter((item) => item.audience === undefined);
  const sinRead = datos.get("notifications").filter((item) => item.read === undefined);

  assert.strictEqual(sinDefaults.length, legacy.users, "usuarios antiguos declarados y reales deben coincidir");
  assert.strictEqual(sinAudiencia.length, legacy.posts, "publicaciones antiguas declaradas y reales deben coincidir");
  assert.strictEqual(sinRead.length, legacy.notifications, "notificaciones antiguas declaradas y reales deben coincidir");

  // Un documento antiguo sigue siendo válido para las reglas críticas.
  for (const usuario of sinDefaults) {
    assert.ok(usuario.username && usuario.email, "un usuario antiguo conserva username y email");
    assert.ok(["user", "admin"].includes(usuario.role), "un usuario antiguo conserva un rol válido");
  }
  for (const post of sinAudiencia) {
    assert.ok(post.author, "una publicación antigua conserva autor");
  }

  const proporcion = sinAudiencia.length / datos.get("posts").length;
  assert.ok(
    proporcion > 0.02 && proporcion < 0.1,
    `la fracción antigua debe ser minoritaria y visible, fue ${(proporcion * 100).toFixed(1)} %`
  );
});

test("las consultas críticas encuentran documentos con los identificadores fijos", () => {
  const datos = generado.datos;

  const comprobaciones = [
    ["feed.perfil", datos.get("posts").filter((item) => String(item.author) === IDS.user).length],
    ["feed.tema", datos.get("posts").filter((item) => (item.hashtags || []).includes("kronos")).length],
    ["feed.vertical", datos.get("posts").filter((item) => item.media?.type === "video" && item.media?.orientation !== "horizontal").length],
    ["feed.orbita", datos.get("posts").filter((item) => String(item.audience?.orbitId) === IDS.orbit).length],
    ["notificaciones.lista", datos.get("notifications").filter((item) => String(item.recipient) === IDS.user).length],
    ["notificaciones.no-leidas", datos.get("notifications").filter((item) => String(item.recipient) === IDS.user && item.read === false).length],
    ["mensajes.conversacion-directa", datos.get("messages").filter((item) => String(item.sender) === IDS.user && String(item.receiver) === IDS.peer).length],
    ["mensajes.recibidos", datos.get("messages").filter((item) => String(item.receiver) === IDS.user).length],
    ["mensajes.grupo", datos.get("messages").filter((item) => String(item.conversation) === IDS.conversation).length],
    ["conversaciones.lista", datos.get("conversations").filter((item) => (item.members || []).some((miembro) => String(miembro) === IDS.user)).length],
    ["capsulas.pendientes", datos.get("capsules").filter((item) => item.state === "sealed").length],
    ["canales.mensajes", datos.get("channelmessages").filter((item) => String(item.channel) === IDS.channel).length],
    ["sesiones.refresh", datos.get("refreshtokens").filter((item) => item.familyId === "familia-ejemplo").length],
    ["moderacion.ocultas", datos.get("hiddenposts").filter((item) => String(item.user) === IDS.user).length],
    ["moderacion.bloqueos", datos.get("blocks").filter((item) => String(item.blocker) === IDS.user).length],
    ["kairos.historial-imagenes", datos.get("imagegenerations").filter((item) => String(item.user) === IDS.user).length],
    ["borradores.lista", datos.get("drafts").filter((item) => String(item.author) === IDS.user).length],
    ["colecciones.lista", datos.get("savedcollections").filter((item) => String(item.owner) === IDS.user).length],
    ["circulos.lista", datos.get("circles").filter((item) => String(item.owner) === IDS.user).length],
    ["apoyos.recibidos", datos.get("supporttransactions").filter((item) => String(item.creator) === IDS.user).length],
    ["moderacion.bloqueado-por", datos.get("blocks").filter((item) => String(item.blocked) === IDS.user).length],
    ["historias.activas", datos.get("stories").filter((item) => String(item.author) === IDS.user).length],
    ["kairos.historial-video", datos.get("videogenerations").filter((item) => String(item.user) === IDS.user).length],
    ["kairos.historial-guiones", datos.get("scripts").filter((item) => String(item.user) === IDS.user).length],
    ["feed.principal", datos.get("posts").filter((item) => item.moderation?.hidden !== true).length]
  ];

  // El catálogo tiene 25 consultas críticas; esta prueba cubre las 25 menos
  // `mensajes.conversacion-directa` invertida, que comparte datos con la
  // directa ya comprobada.
  assert.ok(comprobaciones.length >= 25, `solo se comprueban ${comprobaciones.length} consultas críticas`);

  const vacias = comprobaciones.filter(([, total]) => total === 0).map(([id]) => id);

  assert.deepStrictEqual(
    vacias,
    [],
    `estas consultas críticas no tendrían filas que devolver: ${vacias.join(", ")} — explain() sobre cero documentos no es evidencia`
  );
});

test("toda URL multimedia sembrada apunta a un archivo que existe", () => {
  const base = path.join(ROOT, "server", "uploads");
  const referencias = new Set();

  const recolectar = (valor, profundidad = 0) => {
    if (profundidad > 8 || valor == null) return;
    if (typeof valor === "string") {
      if (valor.startsWith("/uploads/")) referencias.add(valor);
      return;
    }
    if (Array.isArray(valor)) {
      valor.forEach((item) => recolectar(item, profundidad + 1));
      return;
    }
    if (typeof valor === "object" && !(valor instanceof Date) && typeof valor._bsontype !== "string") {
      Object.values(valor).forEach((item) => recolectar(item, profundidad + 1));
    }
  };

  for (const documentos of generado.datos.values()) {
    documentos.forEach((documento) => recolectar(documento));
  }

  assert.ok(referencias.size > 0, "la siembra debe producir referencias multimedia");

  const rotas = [...referencias].filter((url) => !fs.existsSync(path.join(base, url.replace("/uploads/", ""))));

  assert.deepStrictEqual(
    rotas.slice(0, 5),
    [],
    `${rotas.length} referencias multimedia apuntan a archivos inexistentes: la base de ensayo nacería rota`
  );
});

test("el almacén de ensayo deja duplicados y huérfanos reales que detectar", () => {
  const mediaDir = path.join(ROOT, "server", "uploads", "media");
  const archivos = fs.readdirSync(mediaDir).filter((name) => name.startsWith("ensayo-"));

  const porContenido = new Map();
  for (const name of archivos) {
    const clave = require("node:crypto")
      .createHash("sha256")
      .update(fs.readFileSync(path.join(mediaDir, name)))
      .digest("hex");
    porContenido.set(clave, (porContenido.get(clave) || 0) + 1);
  }

  const duplicados = [...porContenido.values()].filter((total) => total > 1).length;

  assert.ok(duplicados >= 1, "el almacén debe contener archivos idénticos para que el cruce tenga duplicados que contar");
  assert.ok(
    archivos.some((name) => name.includes("huerfano")),
    "el almacén debe dejar archivos sin referenciar para que existan huérfanos reales"
  );
});

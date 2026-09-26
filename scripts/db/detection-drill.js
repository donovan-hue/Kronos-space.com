#!/usr/bin/env node
/**
 * FASES 12-13 — ensayo de DETECCIÓN.
 *
 *   node scripts/db/detection-drill.js
 *
 * Un verificador que siempre devuelve cero es indistinguible de uno roto.
 * Este ensayo construye una base desechable con anomalías CONOCIDAS —una por
 * regla de integridad, más referencias multimedia rotas y archivos
 * huérfanos— y exige que las herramientas las encuentren todas.
 *
 * Si una regla no detecta su anomalía sembrada, el ensayo falla (código 1):
 * significa que la regla está muerta y que un cero en producción no
 * significaría "todo bien" sino "no estoy mirando".
 *
 * La base se llama `<base>_deteccion` y se recrea en cada ejecución. Nunca
 * toca la base configurada ni ninguna que parezca de producción.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  ROOT,
  EXIT,
  connect,
  requireUri,
  redactUri,
  databaseNameFromUri,
  writeReport
} = require("./_bootstrap");

const { runIntegrityChecks } = require("../../server/src/db/integrity");

const PRODUCTION_HINTS = [/prod/i, /produccion/i, /live/i];
const SUFIJO = "_deteccion";

/** Reemplaza el nombre de base dentro de la URI conservando el resto. */
function fixtureUri(uri, name) {
  const [head, query] = String(uri).split("?");
  const withoutDb = head.replace(/\/[^/]*$/, "");
  return `${withoutDb}/${name}${query ? `?${query}` : ""}`;
}

function oid(mongoose, hex) {
  return new mongoose.Types.ObjectId(hex);
}

/**
 * Anomalías sembradas: cada entrada declara la regla que DEBE dispararse.
 * El identificador coincide con `RULES[].id` de server/src/db/integrity.js.
 */
function anomalias(mongoose) {
  const desconocido = () => new mongoose.Types.ObjectId();
  const ahora = new Date();

  const usuarioValido = {
    _id: desconocido(),
    username: "referencia",
    email: "referencia@ensayo.kronos",
    role: "user",
    emailVerified: true,
    preferences: { feed: { mode: "latest" } },
    profilePrivacy: { discoverable: true },
    createdAt: ahora
  };

  return {
    usuarioValido,
    documentos: {
      users: [
        usuarioValido,
        // users.username.unique-lower + users.email.unique-lower
        { _id: desconocido(), username: "Ana", email: "Ana@ensayo.kronos", role: "user", preferences: { feed: { mode: "latest" } }, profilePrivacy: { discoverable: true }, emailVerified: true, createdAt: ahora },
        { _id: desconocido(), username: "ana", email: "ana@ensayo.kronos", role: "user", preferences: { feed: { mode: "latest" } }, profilePrivacy: { discoverable: true }, emailVerified: true, createdAt: ahora },
        // users.required-fields
        { _id: desconocido(), username: "", email: "sinnombre@ensayo.kronos", role: "user", preferences: { feed: { mode: "latest" } }, profilePrivacy: { discoverable: true }, emailVerified: true, createdAt: ahora },
        // users.defaults-materialized
        { _id: desconocido(), username: "sindefaults", email: "sindefaults@ensayo.kronos", role: "user", createdAt: ahora }
      ],
      posts: [
        // posts.author.required
        { _id: desconocido(), author: null, content: "sin autor", audience: { type: "public" }, moderation: { hidden: false }, createdAt: ahora },
        // posts.author.exists
        { _id: desconocido(), author: desconocido(), content: "autor inexistente", audience: { type: "public" }, moderation: { hidden: false }, createdAt: ahora },
        // posts.audience.valid
        { _id: desconocido(), author: usuarioValido._id, content: "audiencia inválida", audience: { type: "galaxia" }, moderation: { hidden: false }, createdAt: ahora },
        // posts.audience.materialized
        { _id: desconocido(), author: usuarioValido._id, content: "sin audiencia", createdAt: ahora },
        // posts.circle-audience.has-id
        { _id: desconocido(), author: usuarioValido._id, content: "circulo sin id", audience: { type: "circle" }, moderation: { hidden: false }, createdAt: ahora },
        // posts.orbit-audience.has-id
        { _id: desconocido(), author: usuarioValido._id, content: "orbita sin id", audience: { type: "orbit" }, moderation: { hidden: false }, createdAt: ahora },
        // referencia multimedia rota (la comprueba media-orphans.js)
        {
          _id: desconocido(),
          author: usuarioValido._id,
          content: "imagen que ya no existe",
          audience: { type: "public" },
          moderation: { hidden: false },
          media: { url: "/uploads/media/1700000000-inexistente-ensayo.jpg", type: "image", mimeType: "image/jpeg" },
          createdAt: ahora
        },
        // metadatos incoherentes: extensión de vídeo declarada como imagen y
        // orientación que contradice las dimensiones reales
        {
          _id: desconocido(),
          author: usuarioValido._id,
          content: "metadatos que no cuadran",
          audience: { type: "public" },
          moderation: { hidden: false },
          media: {
            // Tres incoherencias deliberadas en un solo documento:
            //   1. la extensión es .jpg pero el tipo declarado es vídeo
            //   2. el mimeType dice vídeo y la extensión dice imagen
            //   3. 100x400 es vertical, no horizontal
            url: "/uploads/media/1700000001-huerfano-ensayo.jpg",
            type: "video",
            mimeType: "video/mp4",
            width: 100,
            height: 400,
            orientation: "horizontal"
          },
          createdAt: ahora
        }
      ],
      messages: [
        // messages.sender.exists
        { _id: desconocido(), sender: desconocido(), receiver: usuarioValido._id, content: "emisor inexistente", createdAt: ahora },
        // messages.destination
        { _id: desconocido(), sender: usuarioValido._id, receiver: null, conversation: null, content: "sin destino", createdAt: ahora }
      ],
      notifications: [
        // notifications.recipient.exists
        { _id: desconocido(), recipient: desconocido(), type: "like", read: false, createdAt: ahora },
        // notifications.read.materialized
        { _id: desconocido(), recipient: usuarioValido._id, type: "follow", createdAt: ahora }
      ],
      conversations: [
        // conversations.members.range
        { _id: desconocido(), members: [usuarioValido._id], createdBy: usuarioValido._id, createdAt: ahora }
      ],
      blocks: [
        // blocks.unique-pair
        { _id: desconocido(), blocker: usuarioValido._id, blocked: oid(mongoose, "0000000000000000000000ff"), createdAt: ahora },
        { _id: desconocido(), blocker: usuarioValido._id, blocked: oid(mongoose, "0000000000000000000000ff"), createdAt: ahora }
      ],
      seenposts: [
        // seenposts.unique-pair
        { _id: desconocido(), user: usuarioValido._id, post: oid(mongoose, "0000000000000000000000ee"), createdAt: ahora },
        { _id: desconocido(), user: usuarioValido._id, post: oid(mongoose, "0000000000000000000000ee"), createdAt: ahora }
      ],
      capsules: [
        // capsules.opensAt.required
        { _id: desconocido(), owner: usuarioValido._id, title: "sin fecha", state: "sealed", opensAt: null, createdAt: ahora }
      ],
      stories: [
        // stories.expiresAt.required
        { _id: desconocido(), author: usuarioValido._id, media: { url: "", type: "image" }, expiresAt: null, createdAt: ahora }
      ],
      imagegenerations: [
        // imagegenerations.user.exists
        { _id: desconocido(), user: desconocido(), prompt: "usuario inexistente", status: "completed", createdAt: ahora }
      ]
    },
    esperadas: [
      "users.username.unique-lower",
      "users.email.unique-lower",
      "users.required-fields",
      "users.defaults-materialized",
      "posts.author.required",
      "posts.author.exists",
      "posts.audience.valid",
      "posts.audience.materialized",
      "posts.circle-audience.has-id",
      "posts.orbit-audience.has-id",
      "messages.sender.exists",
      "messages.destination",
      "notifications.recipient.exists",
      "notifications.read.materialized",
      "conversations.members.range",
      "blocks.unique-pair",
      "seenposts.unique-pair",
      "capsules.opensAt.required",
      "stories.expiresAt.required",
      "imagegenerations.user.exists"
    ]
  };
}

function table(rows, headers) {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => String(row[column] ?? "").length))
  );
  const line = (cells) => `| ${cells.map((cell, column) => String(cell ?? "").padEnd(widths[column])).join(" | ")} |`;

  return [
    line(headers),
    `|${widths.map((width) => "-".repeat(width + 2)).join("|")}|`,
    ...rows.map((row) => line(row))
  ].join("\n");
}

async function main() {
  const log = (message) => process.stdout.write(`${message}\n`);
  const uri = requireUri();
  const base = databaseNameFromUri(uri);

  if (!base) throw new Error("La URI no incluye nombre de base; no se puede derivar la base de ensayo.");

  for (const hint of PRODUCTION_HINTS) {
    if (hint.test(base)) {
      throw new Error(`La base configurada "${base}" parece de producción. El ensayo de detección no se ejecuta aquí.`);
    }
  }

  const nombre = `${base}${SUFIJO}`;
  const uriFixture = fixtureUri(uri, nombre);
  const context = await connect({ uri: uriFixture });
  const { db, mongoose } = context;

  const huerfano = path.join(ROOT, "server", "uploads", "media", "1700000001-huerfano-ensayo.jpg");
  const failures = [];

  try {
    log(`Base de detección: ${nombre} (${redactUri(uriFixture)})`);

    // Base desechable: se recrea en cada ejecución.
    await db.dropDatabase();

    const { documentos, esperadas } = anomalias(mongoose);
    let sembrados = 0;

    for (const [collection, docs] of Object.entries(documentos)) {
      await db.collection(collection).insertMany(docs, { ordered: false });
      sembrados += docs.length;
    }

    log(`Anomalías sembradas: ${sembrados} documentos en ${Object.keys(documentos).length} colecciones\n`);

    // --- 1. Integridad ---
    const { results: resultados } = await runIntegrityChecks(db);
    const porId = new Map(resultados.map((item) => [item.id, item]));
    const filas = [];

    for (const id of esperadas) {
      const resultado = porId.get(id);
      const detectada = Boolean(resultado && !resultado.skipped && !resultado.ok && (resultado.count ?? 0) > 0);

      filas.push([
        id,
        resultado?.severity || "—",
        resultado?.skipped ? "omitida" : (resultado?.count ?? 0),
        detectada ? "DETECTADA" : "NO DETECTADA"
      ]);

      if (!detectada) {
        failures.push(`La regla "${id}" no detectó su anomalía sembrada (regla muerta o filtro incorrecto).`);
      }
    }

    log("### Reglas de integridad frente a anomalías conocidas\n");
    log(table(filas, ["regla", "severidad", "incumplimientos", "resultado"]));

    const otras = resultados.filter(
      (item) => !item.skipped && !item.ok && !esperadas.includes(item.id)
    );

    if (otras.length) {
      log(`\nOtras reglas que también se dispararon (efecto colateral esperado): ${otras.map((item) => item.id).join(", ")}`);
    }

    // --- 2. Multimedia: referencia rota + archivo huérfano ---
    fs.mkdirSync(path.dirname(huerfano), { recursive: true });
    fs.writeFileSync(huerfano, Buffer.alloc(2048, 7));

    const media = spawnSync(
      process.execPath,
      [path.join(ROOT, "scripts", "db", "media-orphans.js"), "--json"],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, MONGODB_URI: uriFixture },
        maxBuffer: 32 * 1024 * 1024
      }
    );

    // `--json` imprime el informe y DESPUÉS la línea "Informe: <ruta>", así
    // que recortar desde la primera llave deja basura al final y JSON.parse
    // falla. Se lee el archivo que la propia herramienta declara.
    const salida = `${media.stdout || ""}`;
    let informeMedia = null;

    const declarado = /^Informe:\s*(.+)$/m.exec(salida);
    if (declarado) {
      try {
        informeMedia = JSON.parse(fs.readFileSync(path.join(ROOT, declarado[1].trim()), "utf8"));
      } catch {
        informeMedia = null;
      }
    }

    if (!informeMedia) {
      // Reserva: recorte equilibrando llaves desde la primera apertura.
      const desde = salida.indexOf("{");
      if (desde >= 0) {
        let nivel = 0;
        let hasta = -1;
        for (let index = desde; index < salida.length; index += 1) {
          if (salida[index] === "{") nivel += 1;
          else if (salida[index] === "}") {
            nivel -= 1;
            if (nivel === 0) { hasta = index + 1; break; }
          }
        }
        if (hasta > desde) {
          try {
            informeMedia = JSON.parse(salida.slice(desde, hasta));
          } catch {
            informeMedia = null;
          }
        }
      }
    }

    const rotas = informeMedia ? (informeMedia.brokenReferences?.length ?? 0) : null;
    const huerfanos = informeMedia
      ? (informeMedia.orphans?.disk?.length ?? 0) + (informeMedia.orphans?.gridfs?.length ?? 0)
      : null;
    const incoherentes = informeMedia ? (informeMedia.inconsistencies?.total ?? 0) : null;

    if (!informeMedia) {
      failures.push("No se pudo leer el informe JSON de media-orphans.js: sin evidencia multimedia.");
    }

    log("\n### Multimedia frente a anomalías conocidas\n");
    log(table(
      [
        ["referencia rota sembrada", 1, rotas ?? "sin dato", rotas >= 1 ? "DETECTADA" : "NO DETECTADA"],
        ["archivo huérfano sembrado", 1, huerfanos ?? "sin dato", huerfanos >= 1 ? "DETECTADA" : "NO DETECTADA"],
        ["metadatos incoherentes sembrados", "≥ 3", incoherentes ?? "sin dato", incoherentes >= 3 ? "DETECTADOS" : "NO DETECTADOS"],
        ["código de salida de media-orphans.js", "1 (esperado)", media.status, media.status === 1 ? "COHERENTE" : "REVISAR"]
      ],
      ["anomalía", "sembradas", "detectadas", "resultado"]
    ));

    if (!(rotas >= 1)) {
      failures.push("media-orphans.js no detectó la referencia multimedia rota sembrada.");
    }
    if (!(huerfanos >= 1)) {
      failures.push("media-orphans.js no detectó el archivo huérfano sembrado.");
    }
    if (!(incoherentes >= 3)) {
      failures.push(
        `media-orphans.js detectó ${incoherentes} metadatos incoherentes; se sembraron 3 (type vs extensión, mimeType vs extensión, orientation vs dimensiones).`
      );
    }
    if (media.status === 0) {
      failures.push("media-orphans.js devolvió 0 pese a existir referencias rotas: no falla cerrado.");
    }

    const informe = {
      generatedAt: new Date().toISOString(),
      database: nombre,
      sembrados,
      reglasEsperadas: esperadas.length,
      reglasDetectadas: filas.filter((row) => row[3] === "DETECTADA").length,
      otrasDetecciones: otras.map((item) => item.id),
      multimedia: {
        referenciasRotas: rotas,
        archivosHuerfanos: huerfanos,
        metadatosIncoherentes: incoherentes,
        exitCode: media.status
      },
      detalle: filas.map(([id, severity, count, resultado]) => ({ id, severity, count, resultado })),
      failures
    };

    const file = writeReport("detection-drill.json", informe);

    log(`\nReglas con detección confirmada: ${informe.reglasDetectadas}/${esperadas.length}`);
    log(`Informe: ${file}`);

    if (failures.length) {
      process.stderr.write(`\nFALLOS (${failures.length}):\n${failures.map((item) => `  - ${item}`).join("\n")}\n`);
      return EXIT.FAILURE;
    }

    log("\nEnsayo de detección superado: todas las comprobaciones encuentran lo que deben encontrar.");
    return EXIT.OK;
  } finally {
    // Limpieza de lo que creó este mismo ensayo: base desechable y archivo temporal.
    await db.dropDatabase().catch(() => {});
    await context.close().catch(() => {});
    fs.rmSync(huerfano, { force: true });
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`ERROR: ${redactUri(error?.message || String(error))}\n`);
    process.exit(EXIT.FAILURE);
  });

#!/usr/bin/env node
/**
 * FASE 9 — base de ENSAYO con volumen representativo.
 *
 *   node scripts/db/seed-staging.js --confirm kronos_ensayo
 *   node scripts/db/seed-staging.js --confirm kronos_ensayo --scale 2 --reset
 *
 * Genera datos coherentes con las reglas de integridad del proyecto para que
 * `explain()`, las mediciones de percentiles y la migración se ejecuten sobre
 * algo parecido a la realidad. Sin datos, un plan de consulta no demuestra
 * nada: una colección vacía acepta cualquier índice.
 *
 * PROTECCIÓN DE PRODUCCIÓN (falla cerrado)
 *   - El nombre de la base debe repetirse en `--confirm`.
 *   - El nombre debe empezar por un prefijo de ensayo reconocido
 *     (kronos_ensayo, kronos_staging, kronos_migration_test, kronos_ci,
 *     kronos_seed, kronos_e2e). Cualquier otro nombre exige además
 *     `--force-db-name`, pensado para copias restauradas con nombre propio.
 *   - Se niega a escribir si la base ya tiene documentos, salvo `--reset`,
 *     que solo borra lo que este mismo script crea y nunca en un nombre
 *     ajeno a los prefijos de ensayo.
 *
 * Escribe con el driver, NO con los modelos: así no se crean índices por
 * `autoIndex` y la migración 004 puede demostrar que los crea ella.
 */

const fs = require("node:fs");
const path = require("node:path");

const { ROOT, EXIT, parseArgs, run, writeReport } = require("./_bootstrap");

const STAGING_PREFIXES = [
  "kronos_ensayo",
  "kronos_staging",
  "kronos_migration_test",
  "kronos_ci",
  "kronos_seed",
  "kronos_e2e",
  "kronos_restore"
];

const PRODUCTION_HINTS = [/prod/i, /produccion/i, /live/i, /^kronos_social_ai$/i];

// Identificadores fijos que usan las consultas críticas: el catálogo los
// referencia y sin ellos las mediciones devolverían cero documentos.
const IDS = {
  user: "000000000000000000000001",
  peer: "000000000000000000000002",
  orbit: "000000000000000000000003",
  channel: "000000000000000000000004",
  conversation: "000000000000000000000005"
};

const BASE_VOLUME = {
  users: 2000,
  posts: 25000,
  notifications: 40000,
  messages: 30000,
  conversations: 1500,
  stories: 3000,
  capsules: 1200,
  imagegenerations: 2500,
  videogenerations: 1500,
  scripts: 1500,
  channelmessages: 6000,
  drafts: 1200,
  savedcollections: 900,
  circles: 900,
  orbits: 600,
  channels: 400,
  blocks: 1500,
  mutes: 1200,
  hiddenposts: 2000,
  seenposts: 8000,
  supporttransactions: 1800,
  refreshtokens: 2500,
  reports: 600
};

const HASHTAGS = ["kronos", "orbita", "kairos", "capsula", "pulso", "diseno", "video", "musica"];
const AUDIENCES = ["public", "public", "public", "followers", "private", "circle", "orbit"];

/** Generador determinista: dos ejecuciones producen la misma base. */
function createRandom(seed = 20260926) {
  let state = seed >>> 0;
  return function random() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function objectId(mongoose, hex) {
  return new mongoose.Types.ObjectId(hex);
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000);
}

function assertTarget(dbName, flags) {
  if (flags.confirm !== dbName) {
    throw new Error(
      `Confirmación obligatoria: repite el nombre de la base con --confirm ${dbName}. ` +
      "Este script escribe decenas de miles de documentos."
    );
  }

  for (const hint of PRODUCTION_HINTS) {
    if (hint.test(dbName) && !flags.forceDbName) {
      throw new Error(
        `"${dbName}" parece una base de producción. Sembrar datos ahí está prohibido. ` +
        "Usa una copia de ensayo (kronos_ensayo, kronos_migration_test…)."
      );
    }
  }

  const isStaging = STAGING_PREFIXES.some((prefix) => dbName.startsWith(prefix));

  if (!isStaging && !flags.forceDbName) {
    throw new Error(
      `"${dbName}" no usa un prefijo de ensayo (${STAGING_PREFIXES.join(", ")}). ` +
      "Si es una copia restaurada con nombre propio, añade --force-db-name."
    );
  }

  return { isStaging };
}

async function insertBatched(db, name, documents, log) {
  if (!documents.length) return 0;
  const collection = db.collection(name);
  const size = 2000;

  for (let index = 0; index < documents.length; index += size) {
    await collection.insertMany(documents.slice(index, index + size), { ordered: false });
  }

  log(`  ${name.padEnd(20)} ${documents.length}`);
  return documents.length;
}

/**
 * Almacén de ensayo: archivos REALES en server/uploads para que el cruce
 * multimedia compare base ↔ disco con algo que existe. Sin esto, cada URL
 * sembrada sería una referencia rota y el informe mediría el generador de
 * datos, no la aplicación.
 *
 * El contenido es determinista y algunos archivos se repiten byte a byte:
 * así el cruce tiene duplicados verdaderos que encontrar. Dos archivos más
 * quedan sin referenciar para que existan huérfanos reales.
 */
function buildMediaPool(count) {
  const mediaDir = path.join(ROOT, "server", "uploads", "media");
  const avatarDir = path.join(ROOT, "server", "uploads", "avatars");
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.mkdirSync(avatarDir, { recursive: true });

  const ORIENTATIONS = ["vertical", "horizontal", "square"];
  const DIMENSIONS = { vertical: [1080, 1920], horizontal: [1920, 1080], square: [1200, 1200] };

  const media = [];

  for (let index = 0; index < count; index += 1) {
    const isVideo = index % 4 === 3;
    const name = `ensayo-${String(index).padStart(4, "0")}.${isVideo ? "mp4" : "jpg"}`;
    // Cada décimo archivo repite el contenido del anterior: duplicado real.
    const twin = index % 10 === 9 ? index - 1 : index;
    fs.writeFileSync(path.join(mediaDir, name), Buffer.alloc(1024 + twin, twin % 256));

    const orientation = ORIENTATIONS[index % ORIENTATIONS.length];
    const [width, height] = DIMENSIONS[orientation];

    media.push({
      url: `/uploads/media/${name}`,
      type: isVideo ? "video" : "image",
      mimeType: isVideo ? "video/mp4" : "image/jpeg",
      size: 1024 + twin,
      alt: "",
      posterUrl: "",
      width,
      height,
      orientation,
      focalPoint: { x: 0.5, y: 0.5 }
    });
  }

  const avatars = [];
  for (let index = 0; index < 8; index += 1) {
    const name = `ensayo-avatar-${index}.jpg`;
    fs.writeFileSync(path.join(avatarDir, name), Buffer.alloc(512 + index, 64 + index));
    avatars.push(`/uploads/avatars/${name}`);
  }

  // Huérfanos deliberados: archivos que ningún documento referencia.
  const orphans = ["ensayo-huerfano-1.jpg", "ensayo-huerfano-2.mp4"];
  for (const name of orphans) {
    fs.writeFileSync(path.join(mediaDir, name), Buffer.alloc(4096, 33));
  }

  return { media, avatars, orphans: orphans.length };
}

/** Borra solo los archivos que creó este script (prefijo `ensayo-`). */
function clearMediaPool() {
  let removed = 0;

  for (const directory of ["media", "avatars", "covers"]) {
    const full = path.join(ROOT, "server", "uploads", directory);
    if (!fs.existsSync(full)) continue;

    for (const entry of fs.readdirSync(full)) {
      if (!entry.startsWith("ensayo-")) continue;
      fs.rmSync(path.join(full, entry), { force: true });
      removed += 1;
    }
  }

  return removed;
}

/** Pares únicos: varios índices del plan son `unique` sobre dos campos. */
function uniquePairs(random, users, total, [leftKey, rightKey], referencia, mongoose, rightPool = null) {
  const seen = new Set();
  const documents = [];

  for (let index = 0; documents.length < total && index < total * 6; index += 1) {
    const left = index % 9 === 0 ? referencia : users[Math.floor(random() * users.length)]._id;
    const right = rightPool
      ? rightPool[Math.floor(random() * rightPool.length)]._id
      : users[Math.floor(random() * users.length)]._id;

    if (!rightPool && String(left) === String(right)) continue;

    const key = `${left}:${right}`;
    if (seen.has(key)) continue;
    seen.add(key);

    documents.push({
      _id: new mongoose.Types.ObjectId(),
      [leftKey]: left,
      [rightKey]: right,
      createdAt: new Date(Date.now() - Math.floor(random() * 200) * 86400000)
    });
  }

  return documents;
}

function buildUsers(mongoose, random, total, avatars) {
  const users = [];
  const ids = [objectId(mongoose, IDS.user), objectId(mongoose, IDS.peer)];

  for (let index = 0; index < total; index += 1) {
    const _id = index < 2 ? ids[index] : new mongoose.Types.ObjectId();
    users.push({
      _id,
      username: `kronauta${index}`,
      email: `kronauta${index}@ensayo.kronos`,
      passwordHash: `$2b$12$semilla-de-ensayo-no-es-una-credencial-${index}`,
      displayName: `Kronauta ${index}`,
      bio: index % 3 === 0 ? "Explorando el tiempo y el espacio." : "",
      avatar: index % 4 === 0 ? avatars[index % avatars.length] : "",
      cover: "",
      role: index === 0 ? "admin" : "user",
      emailVerified: index % 5 !== 0,
      followers: [],
      following: [],
      preferences: { feed: { mode: pick(random, ["latest", "following", "interests"]), interests: [] } },
      profilePrivacy: { discoverable: true, showFollowers: true },
      createdAt: daysAgo(400 - (index % 400)),
      updatedAt: daysAgo(random() * 30)
    });
  }

  // Grafo de seguidores: el usuario de referencia sigue a 300 cuentas.
  const referencia = users[0];
  for (let index = 2; index < Math.min(302, users.length); index += 1) {
    referencia.following.push(users[index]._id);
    users[index].followers.push(referencia._id);
  }

  return users;
}

function buildPosts(mongoose, random, users, orbits, circles, total, pool) {
  const posts = [];
  const referencia = users[0]._id;

  for (let index = 0; index < total; index += 1) {
    // El usuario de referencia concentra ~2 % de las publicaciones: es la
    // selectividad típica de un perfil activo y hace medible el índice.
    const author = index % 50 === 0 ? referencia : users[Math.floor(random() * users.length)]._id;
    const audienceType = pick(random, AUDIENCES);
    const audience = { type: audienceType };

    if (audienceType === "circle") audience.circleId = circles[Math.floor(random() * circles.length)]._id;
    if (audienceType === "orbit") {
      audience.orbitId = index % 40 === 0
        ? objectId(mongoose, IDS.orbit)
        : orbits[Math.floor(random() * orbits.length)]._id;
    }

    // La mitad de las publicaciones llevan un archivo del almacén de ensayo.
    // Reutilizar el almacén es intencionado: produce URLs referenciadas por
    // varios documentos, que es justo lo que el cruce debe saber contar.
    const hasMedia = index % 2 === 0;
    // El recorrido del almacén NO puede depender de la misma paridad que
    // decide si hay multimedia: si dependiera, solo se elegirían posiciones
    // pares del almacén y ninguna publicación tendría vídeo.
    const archivo = hasMedia ? pool[Math.floor(index / 2) % pool.length] : null;
    const created = daysAgo(random() * 365);

    posts.push({
      _id: index === 0 ? objectId(mongoose, "00000000000000000000000a") : new mongoose.Types.ObjectId(),
      author,
      content: `Publicación de ensayo ${index} #${pick(random, HASHTAGS)}`,
      hashtags: index % 7 === 0 ? ["kronos", pick(random, HASHTAGS)] : [pick(random, HASHTAGS)],
      media: archivo
        ? { ...archivo }
        : { url: "", type: "", mimeType: "", size: 0, alt: "", posterUrl: "", width: 0, height: 0, orientation: "", focalPoint: { x: 0.5, y: 0.5 } },
      mediaItems: [],
      audience,
      moderation: { hidden: random() < 0.02, reviewedAt: null },
      likes: [],
      reactions: [],
      comments: [],
      savedBy: [],
      repostOf: null,
      lineage: { derivedFrom: null, tool: "", aiGenerated: false },
      createdAt: created,
      updatedAt: created
    });
  }

  return posts;
}

/**
 * Construye el conjunto completo en memoria. Está separado de la escritura
 * para que una prueba pueda verificar sin MongoDB que los datos respetan
 * los índices únicos del plan y las reglas de integridad.
 */
function buildDataset(mongoose, volume, almacen, random = createRandom()) {
  const users = buildUsers(mongoose, random, volume.users, almacen.avatars);
  const referencia = users[0]._id;
  const par = users[1]._id;

  const orbits = Array.from({ length: volume.orbits }, (_, index) => ({
    _id: index === 0 ? objectId(mongoose, IDS.orbit) : new mongoose.Types.ObjectId(),
    name: `Órbita ${index}`,
    slug: `orbita-${index}`,
    owner: index % 3 === 0 ? referencia : users[Math.floor(random() * users.length)]._id,
    visibility: random() < 0.7 ? "public" : "private",
    members: [{ user: referencia, role: "member", joinedAt: daysAgo(30) }],
    expiresAt: null,
    createdAt: daysAgo(random() * 200),
    updatedAt: daysAgo(random() * 30)
  }));

  const circles = Array.from({ length: volume.circles }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    name: `Círculo ${index}`,
    owner: index % 4 === 0 ? referencia : users[Math.floor(random() * users.length)]._id,
    members: [users[Math.floor(random() * users.length)]._id],
    createdAt: daysAgo(random() * 200),
    updatedAt: daysAgo(random() * 20)
  }));

  const posts = buildPosts(mongoose, random, users, orbits, circles, volume.posts, almacen.media);

  const conversations = Array.from({ length: volume.conversations }, (_, index) => ({
    _id: index === 0 ? objectId(mongoose, IDS.conversation) : new mongoose.Types.ObjectId(),
    name: `Grupo ${index}`,
    members: index % 3 === 0
      ? [referencia, par, users[Math.floor(random() * users.length)]._id]
      : [users[Math.floor(random() * users.length)]._id, users[Math.floor(random() * users.length)]._id],
    createdBy: referencia,
    createdAt: daysAgo(random() * 120),
    updatedAt: daysAgo(random() * 10)
  }));

  const channels = Array.from({ length: volume.channels }, (_, index) => ({
    _id: index === 0 ? objectId(mongoose, IDS.channel) : new mongoose.Types.ObjectId(),
    name: `Canal ${index}`,
    orbit: orbits[Math.floor(random() * orbits.length)]._id,
    owner: users[Math.floor(random() * users.length)]._id,
    createdAt: daysAgo(random() * 150),
    updatedAt: daysAgo(random() * 15)
  }));

  const messages = Array.from({ length: volume.messages }, (_, index) => {
    const esGrupo = index % 3 === 0;
    const created = daysAgo(random() * 180);
    const base = {
      _id: new mongoose.Types.ObjectId(),
      sender: index % 25 === 0 ? referencia : users[Math.floor(random() * users.length)]._id,
      content: `Mensaje de ensayo ${index}`,
      read: random() < 0.6,
      createdAt: created,
      updatedAt: created
    };

    if (esGrupo) {
      base.conversation = index % 60 === 0
        ? objectId(mongoose, IDS.conversation)
        : conversations[Math.floor(random() * conversations.length)]._id;
      base.receiver = null;
    } else {
      base.conversation = null;
      base.receiver = index % 20 === 0 ? referencia : (index % 33 === 0 ? par : users[Math.floor(random() * users.length)]._id);
      if (index % 40 === 0) {
        base.sender = referencia;
        base.receiver = par;
      }
    }

    return base;
  });

  const notifications = Array.from({ length: volume.notifications }, (_, index) => {
    const created = daysAgo(random() * 120);
    return {
      _id: new mongoose.Types.ObjectId(),
      recipient: index % 20 === 0 ? referencia : users[Math.floor(random() * users.length)]._id,
      sender: users[Math.floor(random() * users.length)]._id,
      type: pick(random, ["like", "comment", "follow", "mention", "repost"]),
      post: posts[Math.floor(random() * posts.length)]._id,
      read: random() < 0.55,
      createdAt: created,
      updatedAt: created
    };
  });

  const stories = Array.from({ length: volume.stories }, (_, index) => {
    const created = daysAgo(random() * 3);
    return {
      _id: new mongoose.Types.ObjectId(),
      author: index % 15 === 0 ? referencia : users[Math.floor(random() * users.length)]._id,
      media: { ...almacen.media[index % almacen.media.length] },
      expiresAt: new Date(Date.now() + (24 - (index % 24)) * 3600000),
      createdAt: created,
      updatedAt: created
    };
  });

  const capsules = Array.from({ length: volume.capsules }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    owner: index % 10 === 0 ? referencia : users[Math.floor(random() * users.length)]._id,
    title: `Cápsula ${index}`,
    state: index % 4 === 0 ? "opened" : "sealed",
    opensAt: new Date(Date.now() + (index % 365) * 86400000),
    payload: { cipher: "ensayo", iv: "ensayo" },
    createdAt: daysAgo(random() * 300),
    updatedAt: daysAgo(random() * 10)
  }));

  const generacion = (index, tipo) => {
    const created = daysAgo(random() * 90);
    return {
      _id: new mongoose.Types.ObjectId(),
      user: index % 12 === 0 ? referencia : users[Math.floor(random() * users.length)]._id,
      prompt: `Idea de ensayo ${index}`,
      provider: "openrouter",
      model: tipo === "video" ? "video-model-ensayo" : "image-model-ensayo",
      status: pick(random, ["completed", "completed", "failed", "pending"]),
      createdAt: created,
      updatedAt: created
    };
  };

  const imagegenerations = Array.from({ length: volume.imagegenerations }, (_, index) => ({
    ...generacion(index, "image"),
    url: almacen.media[index % almacen.media.length].url
  }));

  const videogenerations = Array.from({ length: volume.videogenerations }, (_, index) => ({
    ...generacion(index, "video"),
    providerJobId: `job-ensayo-${index}`
  }));

  const scripts = Array.from({ length: volume.scripts }, (_, index) => ({
    ...generacion(index, "script"),
    title: `Guion ${index}`,
    status: pick(random, ["draft", "final"])
  }));

  const channelmessages = Array.from({ length: volume.channelmessages }, (_, index) => {
    const created = daysAgo(random() * 100);
    return {
      _id: new mongoose.Types.ObjectId(),
      channel: index % 15 === 0 ? objectId(mongoose, IDS.channel) : channels[Math.floor(random() * channels.length)]._id,
      author: users[Math.floor(random() * users.length)]._id,
      content: `Mensaje de canal ${index}`,
      createdAt: created,
      updatedAt: created
    };
  });

  const drafts = Array.from({ length: volume.drafts }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    author: index % 8 === 0 ? referencia : users[Math.floor(random() * users.length)]._id,
    content: `Borrador ${index}`,
    createdAt: daysAgo(random() * 60),
    updatedAt: daysAgo(random() * 20)
  }));

  const savedcollections = Array.from({ length: volume.savedcollections }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    owner: index % 6 === 0 ? referencia : users[Math.floor(random() * users.length)]._id,
    name: `Colección ${index}`,
    posts: [posts[Math.floor(random() * posts.length)]._id],
    createdAt: daysAgo(random() * 90),
    updatedAt: daysAgo(random() * 10)
  }));

  // Los cuatro pares que el plan de índices declara `unique`: si la siembra
  // los duplicara, la migración 004 no podría crear el índice y la cadena
  // entera fallaría por culpa del generador, no del código.
  const blocks = uniquePairs(random, users, volume.blocks, ["blocker", "blocked"], referencia, mongoose);
  const mutes = uniquePairs(random, users, volume.mutes, ["muter", "muted"], referencia, mongoose);
  const hiddenposts = uniquePairs(random, users, volume.hiddenposts, ["user", "post"], referencia, mongoose, posts);
  const seenposts = uniquePairs(random, users, volume.seenposts, ["user", "post"], referencia, mongoose, posts);

  const supporttransactions = Array.from({ length: volume.supporttransactions }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    sender: users[Math.floor(random() * users.length)]._id,
    creator: index % 9 === 0 ? referencia : users[Math.floor(random() * users.length)]._id,
    amount: 100 + (index % 900),
    currency: "MXN",
    status: "completed",
    createdAt: daysAgo(random() * 200)
  }));

  const refreshtokens = Array.from({ length: volume.refreshtokens }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    user: users[Math.floor(random() * users.length)]._id,
    tokenHash: `hash-de-ensayo-${index}`,
    familyId: index % 18 === 0 ? "familia-ejemplo" : `familia-${index}`,
    expiresAt: new Date(Date.now() + 86400000 * 7),
    createdAt: daysAgo(random() * 7)
  }));

  const reports = Array.from({ length: volume.reports }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    reporter: users[Math.floor(random() * users.length)]._id,
    post: posts[Math.floor(random() * posts.length)]._id,
    reason: pick(random, ["spam", "abuso", "desinformacion"]),
    status: pick(random, ["pending", "reviewed", "dismissed"]),
    createdAt: daysAgo(random() * 120)
  }));

  const conjuntos = [
    ["users", users],
    ["posts", posts],
    ["orbits", orbits],
    ["circles", circles],
    ["conversations", conversations],
    ["channels", channels],
    ["messages", messages],
    ["notifications", notifications],
    ["stories", stories],
    ["capsules", capsules],
    ["imagegenerations", imagegenerations],
    ["videogenerations", videogenerations],
    ["scripts", scripts],
    ["channelmessages", channelmessages],
    ["drafts", drafts],
    ["savedcollections", savedcollections],
    ["blocks", blocks],
    ["mutes", mutes],
    ["hiddenposts", hiddenposts],
    ["seenposts", seenposts],
    ["supporttransactions", supporttransactions],
    ["refreshtokens", refreshtokens],
    ["reports", reports]
  ];

  return { conjuntos, referencias: IDS };
}

async function main({ db, mongoose, redactedUri }) {
  const { flags } = parseArgs();
  const dbName = db.databaseName;
  const log = (message) => process.stdout.write(`${message}\n`);

  assertTarget(dbName, flags);

  const scale = Number(flags.scale || 1);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 10) {
    throw new Error("--scale debe estar entre 0 y 10.");
  }

  const volume = Object.fromEntries(
    Object.entries(BASE_VOLUME).map(([key, value]) => [key, Math.max(1, Math.round(value * scale))])
  );

  const existing = await db.collection("posts").estimatedDocumentCount().catch(() => 0);

  if (existing > 0 && !flags.reset) {
    throw new Error(
      `La base ${dbName} ya tiene ${existing} publicaciones. Usa --reset para regenerarla ` +
      "(solo permitido en bases de ensayo)."
    );
  }

  if (flags.reset) {
    if (!STAGING_PREFIXES.some((prefix) => dbName.startsWith(prefix))) {
      throw new Error(`--reset solo está permitido en bases con prefijo de ensayo, no en "${dbName}".`);
    }
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name);
    for (const name of names) {
      if (name.startsWith("system.")) continue;
      await db.collection(name).deleteMany({});
    }
    const archivos = clearMediaPool();
    log(`Base ${dbName} vaciada (${names.length} colecciones, ${archivos} archivos de ensayo).`);
  }

  const random = createRandom();
  log(`\nSembrando ${dbName} (${redactedUri}) — escala ${scale}\n`);

  const almacen = buildMediaPool(Math.max(8, Number(flags.mediaFiles || 40)));
  const { conjuntos } = buildDataset(mongoose, volume, almacen, random);

  let total = 0;
  const inicio = Date.now();

  for (const [name, documents] of conjuntos) {
    total += await insertBatched(db, name, documents, log);
  }

  const resumen = {
    generatedAt: new Date().toISOString(),
    database: dbName,
    scale,
    seed: 20260926,
    documents: total,
    collections: Object.fromEntries(conjuntos.map(([name, documents]) => [name, documents.length])),
    referencias: IDS,
    almacen: {
      archivosMultimedia: almacen.media.length,
      avatares: almacen.avatars.length,
      huerfanosDeliberados: almacen.orphans
    },
    duracionMs: Date.now() - inicio
  };

  const file = writeReport(`seed-staging-${dbName}.json`, resumen);

  log(`\nTotal: ${total} documentos en ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
  log(`Informe: ${file}`);

  return EXIT.OK;
}

module.exports = {
  BASE_VOLUME,
  IDS,
  STAGING_PREFIXES,
  PRODUCTION_HINTS,
  createRandom,
  buildMediaPool,
  clearMediaPool,
  buildDataset,
  assertTarget
};

if (require.main === module) run(main);

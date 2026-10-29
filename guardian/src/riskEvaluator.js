const { classifyFile } = require("./classify");

/**
 * Rutas donde un error es irreversible o abre una guarda en silencio.
 *
 * `index.js` falla el job cuando el riesgo general es CRITICAL, así que esta
 * lista es literalmente "qué bloquea un merge". Es corta a propósito: solo
 * entran archivos cuyo fallo no se puede deshacer después, o que sostienen
 * varias protecciones a la vez. Todo lo demás se informa sin bloquear.
 *
 * Antes esta lista no existía y ningún archivo podía alcanzar CRITICAL: la
 * rama de `index.js` era inalcanzable y el check pasaba siempre en verde,
 * diera igual lo que tocara el PR. Un portón que nunca se cierra no es un
 * portón.
 */
const RUTAS_CRITICAS = [
  // Cifrado AES-256-GCM de las cápsulas del tiempo, con la clave derivada por
  // scrypt. Romper la derivación o rotar el secreto deja el contenido ya
  // escrito ilegible para siempre: no hay migración que lo recupere.
  "server/src/modules/capsules/capsule.crypto.js",

  // Clasificador fail-closed de entorno. De él cuelgan cuatro guardas a la vez
  // (la confirmación de migraciones, el arranque sin CLIENT_URL, la copia
  // durable de subidas y la creación de índices). Si se afloja, las cuatro se
  // abren en silencio y ninguna falla por su cuenta.
  "server/src/config/environment.js",

  // La guarda que exige --confirm para tocar la base de producción.
  "server/src/migrations/runner.js",

  // Cookie de media: el atributo Secure y la revalidación de revocación. Es lo
  // único que impide leer media privada con una sesión ya cerrada.
  "server/src/middleware/mediaAuth.js",

  // La política de nombres de la copia durable en GridFS. Si deja de coincidir
  // con lo que genera storage.js, las subidas fallan con 503 en producción y
  // el archivo local se borra: se pierde el dato.
  "server/src/config/durableUploads.js"
];

/**
 * Rutas que el guardián tenía ciegas: no son irrecuperables como el cifrado de
 * una cápsula, pero de ellas cuelga el arranque de la app entera.
 *
 * Entran como VIGILADAS (suben a HIGH y se informan) y no como CRÍTICAS, y la
 * diferencia es deliberada. `index.js` falla el job solo con CRITICAL; meter
 * aquí `App.jsx` o el modelo de navegación —los dos archivos que más tocamos
 * cuando cambia cualquier pantalla— habría convertido el check en un portón que
 * bloquea todo PR de frontend, que es justo la forma en que un check deja de
 * leerse. HIGH avisa y pide revisión sin cerrar el paso.
 *
 * Lo que sostiene cada una:
 * - `client/src/App.jsx`: el árbol de rutas y el guardián de sesión. Un error
 *   aquí no es una pantalla rota, es la app entera sin arrancar.
 * - `client/src/navigation/model.jsx`: el modelo único de destinos, anillos y
 *   etiquetas. Del `to` de cada ítem salen la barra, el menú, la transición
 *   direccional y la sección activa; equivocarlo desincroniza los cuatro.
 * - `client/src/services/apiClient.js`: el interceptor que renueva el token,
 *   reintenta una vez y decide cuándo la sesión se considera muerta. Mal aquí,
 *   o se pierden sesiones o se reintenta sobre peticiones que no son idempotentes.
 * - `client/src/services/authStorage.js`: dónde y cómo vive la credencial
 *   (localStorage, revisiones, reasons de limpieza). Es lo que lee todo lo demás
 *   para saber si hay usuario.
 */
const RUTAS_VIGILADAS = [
  "client/src/App.jsx",
  "client/src/navigation/model.jsx",
  "client/src/services/apiClient.js",
  "client/src/services/authStorage.js"
];

/** Nivel por defecto de cada zona cuando no aplica ninguna regla concreta. */
const ZONAS = {
  server: "LOW",
  client: "LOW",
  guardian: "MEDIUM",
  scripts: "MEDIUM",
  config: "MEDIUM",
  other: "LOW"
};

function coincideSufijo(ruta, lista) {
  const limpio = String(ruta || "");

  return lista.some((entrada) => limpio === entrada || limpio.endsWith(`/${entrada}`));
}

function esRutaCritica(filename) {
  return coincideSufijo(filename, RUTAS_CRITICAS);
}

function esRutaVigilada(filename) {
  return coincideSufijo(filename, RUTAS_VIGILADAS);
}

// Calcula el nivel de riesgo por archivo y un nivel general
function evaluateRisk(files) {
  const items = [];

  for (const f of files) {
    const filename = String(f?.filename || "");
    const zone = classifyFile(filename);
    const reasons = [];
    let level = ZONAS[zone] || "LOW";

    // Se evalúa primero y gana: una ruta crítica lo es aunque además caiga en
    // una zona de riesgo menor. Las reglas de abajo solo suben el nivel si
    // todavía está por debajo, nunca lo bajan.
    if (esRutaCritica(filename)) {
      level = "CRITICAL";
      reasons.push(
        "Ruta crítica: un error aquí es irreversible o desactiva varias guardas a la vez"
      );
    }

    // Vigilancia: informa y exige revisión, sin bloquear el merge.
    if (esRutaVigilada(filename)) {
      if (level === "LOW" || level === "MEDIUM") level = "HIGH";
      reasons.push("Ruta vigilada: de ella cuelgan el arranque de la app o la sesión del cliente");
    }

    if (zone === "server") {
      if (filename.includes("auth") || filename.includes("middleware")) {
        if (level === "LOW") level = "HIGH";
        reasons.push("Cambio en autenticación/middleware del servidor");
      }
      if (
        filename.includes("db") ||
        filename.includes("database") ||
        filename.includes("migrations")
      ) {
        if (level === "LOW") level = "MEDIUM";
        reasons.push("Cambio en acceso o esquema de base de datos");
      }
    }

    if (zone === "config") {
      if (level === "LOW") level = "MEDIUM";
      reasons.push("Cambio en configuración/CI/environments");
    }

    // Las herramientas de operación y el propio guardián pueden escribir en la
    // base o publicar informes en el PR: no son código de producto, pero un
    // error aquí tiene efectos fuera del repositorio.
    if (zone === "scripts" || zone === "guardian") {
      if (level === "LOW") level = "MEDIUM";
      reasons.push(
        zone === "guardian"
          ? "Cambio en las reglas del propio guardián"
          : "Cambio en una herramienta de operación (puede escribir en la base)"
      );
    }

    if (zone === "client") {
      if (filename.includes("auth") || filename.includes("login")) {
        if (level === "LOW") level = "MEDIUM";
        reasons.push("Cambio en flujo de autenticación del cliente");
      }
    }

    // Solo guardamos archivos que tengan alguna razón de riesgo
    if (reasons.length > 0) {
      items.push({ file: filename, zone, level, reasons });
    }
  }

  const overall = aggregateOverallRisk(items);

  return { overall, items };
}

function aggregateOverallRisk(items) {
  let max = "LOW";
  const priority = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

  for (const it of items) {
    if (priority.indexOf(it.level) > priority.indexOf(max)) {
      max = it.level;
    }
  }

  return max;
}

module.exports = {
  evaluateRisk,
  aggregateOverallRisk,
  esRutaCritica,
  esRutaVigilada,
  RUTAS_CRITICAS,
  RUTAS_VIGILADAS
};

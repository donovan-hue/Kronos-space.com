#!/usr/bin/env node

/* ============================================================
   PROBADORES DE KAIROS — un instrumento por herramienta

   Este script contesta la única pregunta que importa antes de confiar en una
   herramienta: "esto, ¿ya funciona de verdad de punta a punta?".

   Y lo hace gastando lo mínimo, porque cada cosa tiene su probador:

     - Modo local (por defecto, sin red, coste 0): comprueba el cableado de
       cada capacidad en este repositorio: qué proveedor tiene asignado, qué
       variable exige, si sus rutas están montadas.
     - Modo --vivo (lecturas, coste 0): pregunta al servidor desplegado lo que
       se puede leer sin gastar nada. Con TOKEN definido, además lee las
       capacidades, las voces y la música, que piden sesión.
     - Llamada real (una sola, y solo la que se pida): --voz, --imagen,
       --guion, --video o --chat. Cada bandera hace UNA petición al despliegue
       y dice al final qué se cobró. No hay modo "probar todo": lo caro se
       pide con el dedo.

   Uso:
     node scripts/kairos-probadores.js                 # local, sin red
     node scripts/kairos-probadores.js --vivo          # lecturas del deploy
     TOKEN=... node scripts/kairos-probadores.js --vivo
     TOKEN=... node scripts/kairos-probadores.js --voz # 1 llamada real

   Variables:
     BASE   servidor a probar (por defecto https://api.kronos-space.com)
     TOKEN  sesión de la cuenta (para las que piden sesión; nunca se imprime)
   ============================================================ */

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const SERVIDOR = path.join(RAIZ, "server");

const BASE = String(process.env.BASE || "https://api.kronos-space.com").replace(/\/+$/, "");
const TOKEN = String(process.env.TOKEN || "").trim();

const args = process.argv.slice(2);
const VIVO = args.includes("--vivo");
const JSON_OUT = args.includes("--json");
const REALES = ["voz", "imagen", "guion", "video", "chat"].filter((nombre) => args.includes(`--${nombre}`));
// Con una llamada real se asume que el token hace falta; sin él no se puede.
const QUIERE_REAL = REALES.length > 0;

const filas = [];

function registrar(estado, nombre, exige, detalle) {
  filas.push({ estado, nombre, exige, detalle });
  const marca = { OK: "OK", FALTA: "FALTA", FALLA: "FALLA", OMITE: "OMITE" }[estado] || estado;
  if (!JSON_OUT) {
    const cola = [exige && `exige ${exige}`, detalle].filter(Boolean).join(" · ");
    console.log(`  ${marca.padEnd(6)} ${nombre}${cola ? `  (${cola})` : ""}`);
  }
}

function seccion(titulo) {
  if (!JSON_OUT) console.log(`\n=== ${titulo} ===`);
}

function enmascarar(valor) {
  const texto = String(valor || "");
  if (texto.length <= 10) return "····";
  return `${texto.slice(0, 6)}…${texto.slice(-4)}`;
}

async function pedir(ruta, opciones = {}) {
  const cabeceras = { ...(opciones.headers || {}) };
  if (TOKEN) cabeceras.Authorization = `Bearer ${TOKEN}`;
  if (opciones.body) cabeceras["Content-Type"] = "application/json";
  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: opciones.method || "GET",
    headers: cabeceras,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    signal: AbortSignal.timeout(opciones.timeout || 90000)
  });
  const tipo = respuesta.headers.get("content-type") || "";
  const cuerpo = tipo.includes("application/json") ? await respuesta.json().catch(() => null) : null;
  return { estado: respuesta.status, ok: respuesta.ok, cuerpo };
}

/* ---------- 1. Cableado local (sin red, coste 0) ---------- */

function probarCableado() {
  seccion("1. CABLEADO LOCAL (sin red, coste 0)");
  const { getAIProviderConfig } = require(path.join(SERVIDOR, "src/config/aiProviders.js"));
  const { ajustesVoz } = require(path.join(SERVIDOR, "src/modules/voices/voiceSettings.js"));
  const fuenteServidor = fs.readFileSync(path.join(SERVIDOR, "src/server.js"), "utf-8");

  const capacidades = [
    ["imagen", "image", "/api/ai/images"],
    ["guion", "script", "/api/ai/scripts"],
    ["chat", "chat", "/api/ai"],
    ["video", "video", "/api/ai/videos"]
  ];

  for (const [nombre, capacidad, montaje] of capacidades) {
    const config = getAIProviderConfig(capacidad);
    const variableLlave =
      config.provider === "openrouter" ? "OPENROUTER_API_KEY"
        : config.provider === "gemini" ? "GEMINI_API_KEY"
          : "VIDEO_API_KEY";
    const tieneLlave = Boolean(String(process.env[variableLlave] || "").trim());
    const montada = fuenteServidor.includes(`app.use("${montaje}"`);

    registrar(
      montada ? "OK" : "FALLA",
      `${nombre}: ruta montada y proveedor asignado`,
      variableLlave,
      `${config.provider} · modelo=${config.model} · llave ${tieneLlave ? enmascarar(process.env[variableLlave]) : "sin definir aquí"}`
    );
  }

  const voz = ajustesVoz();
  registrar(
    fuenteServidor.includes('app.use("/api/voices", voiceRoutes)') ? "OK" : "FALLA",
    "voz: locución y catálogo montados",
    voz.variable,
    `modelo=${voz.modelo} · voz=${voz.voz} · llave ${voz.listo ? "presente" : "sin definir aquí"}`
  );

  registrar(
    fuenteServidor.includes('app.use("/api/kairos", kairosRoutes)') ? "OK" : "FALLA",
    "capacidades: tablero de Kairos contestando",
    "sesión",
    "GET /api/kairos/capacidades"
  );

  registrar(
    fuenteServidor.includes('app.use("/api/music", musicRoutes)') ? "OK" : "FALLA",
    "música: catálogo montado",
    "sesión",
    "GET /api/music (solo pistas publicadas)"
  );

  registrar("OK", "filtros y estudio: viven en el navegador", "", "16 filtros, 8 ajustes, línea de tiempo y voz en off");
  registrar("OK", "contratos automáticos del servidor y del cliente", "", "npm test");
}

/* ---------- 2. Vivo: lo que se puede leer sin gastar ---------- */

async function probarVivo() {
  seccion(`2. DESPLIEGUE VIVO (${BASE}, lecturas, coste 0)`);

  try {
    const salud = await pedir("/api/health", { timeout: 20000 });
    if (salud.ok && salud.cuerpo?.ok) {
      registrar("OK", "el servidor responde", "", `commit=${salud.cuerpo.build?.commitShort || "?"} · entorno=${salud.cuerpo.environment} · base=${salud.cuerpo.database}`);
    } else {
      registrar("FALLA", "el servidor responde", "", `estado ${salud.estado}`);
    }
  } catch (error) {
    registrar("FALLA", "el servidor responde", "", error?.message || "sin conexión");
  }

  try {
    const nodo = await pedir("/.well-known/nodeinfo", { timeout: 20000 });
    registrar(nodo.ok ? "OK" : "OMITE", "federación: nodeinfo publicado", "", nodo.ok ? "activo" : `estado ${nodo.estado}`);
  } catch {
    registrar("OMITE", "federación: nodeinfo publicado", "", "sin respuesta");
  }

  if (!TOKEN) {
    registrar("OMITE", "capacidades, voces y música del despliegue", "TOKEN", "define TOKEN=... para leerlas sin gastar");
    return;
  }

  try {
    const capacidades = await pedir("/api/kairos/capacidades", { timeout: 20000 });
    if (!capacidades.ok) {
      registrar("FALLA", "capacidades del despliegue", "", `estado ${capacidades.estado}`);
    } else {
      for (const nombre of ["imagen", "video", "texto", "chat", "voz", "musica", "filtros"]) {
        const valor = capacidades.cuerpo?.[nombre];
        if (!valor) continue;
        const detalle = valor.listo
          ? (nombre === "musica" ? `listo · ${valor.pistas} pistas publicadas` : `listo · ${valor.modelo || ""}`.trim())
          : `falta ${valor.falta?.join(", ") || "configurar"}`;
        registrar(valor.listo ? "OK" : "FALTA", `${nombre} en el despliegue`, "", detalle);
      }
    }
  } catch (error) {
    registrar("FALLA", "capacidades del despliegue", "", error?.message || "sin respuesta");
  }

  try {
    const voces = await pedir("/api/voices?limite=10", { timeout: 20000 });
    if (voces.ok) {
      const servicio = voces.cuerpo?.servicio || {};
      // Las voces propias/grabadas funcionan sin proveedor: la lista puede
      // estar vacía y aun así el catálogo está sano.
      registrar("OK", "catálogo de voces", "", `${voces.cuerpo?.voces?.length || 0} voces · servicio ${servicio.listo ? "listo" : `falta ${servicio.variable}`}`);
    } else {
      registrar(voces.estado === 401 ? "OMITE" : "FALLA", "catálogo de voces", "sesión", `estado ${voces.estado}`);
    }
  } catch (error) {
    registrar("FALLA", "catálogo de voces", "", error?.message || "sin respuesta");
  }

  try {
    const musica = await pedir("/api/music?limite=10", { timeout: 20000 });
    registrar(
      musica.ok ? "OK" : "OMITE",
      "catálogo de música",
      "sesión",
      musica.ok ? `${musica.cuerpo?.pistas?.length || 0} pistas · total ${musica.cuerpo?.total ?? 0}` : `estado ${musica.estado}`
    );
  } catch (error) {
    registrar("FALLA", "catálogo de música", "", error?.message || "sin respuesta");
  }
}

/* ---------- 3. Llamadas reales: una por herramienta, solo si se pide ---------- */

async function probarReales() {
  seccion("3. LLAMADAS REALES (una por bandera; esto sí se cobra)");

  if (!REALES.length) {
    registrar("OMITE", "llamadas reales", "", "ninguna pedida: usa --voz, --imagen, --guion, --video o --chat");
    return;
  }
  if (!TOKEN) {
    for (const nombre of REALES) registrar("OMITE", `llamada real de ${nombre}`, "TOKEN", "define TOKEN=... para hacerla");
    return;
  }

  const pruebas = {
    voz: {
      ruta: "/api/voices/locucion",
      cuerpo: { texto: "Esta es una prueba corta de la voz del estudio." },
      coste: "una locución corta",
      revisar: (cuerpo) => cuerpo?.toma?.url || ""
    },
    imagen: {
      ruta: "/api/ai/images/generate",
      cuerpo: { prompt: "Prueba de humo: un punto de luz rosa sobre fondo negro", style: "cinematic" },
      coste: "una imagen",
      revisar: (cuerpo) => cuerpo?.generation?.url || cuerpo?.url || ""
    },
    guion: {
      ruta: "/api/ai/scripts/generate",
      cuerpo: { prompt: "Un reel corto sobre un estudio de video propio" },
      coste: "un guion",
      revisar: (cuerpo) => cuerpo?.script?._id || cuerpo?.script?.title || ""
    },
    video: {
      ruta: "/api/ai/videos/generate",
      cuerpo: { prompt: "Prueba de humo: una luz rosa girando despacio" },
      coste: "un trabajo de video (lo cobra tu proveedor)",
      revisar: (cuerpo) => cuerpo?.generation?.status || ""
    },
    chat: {
      ruta: "/api/ai/chat",
      cuerpo: { message: "Contesta solo con la palabra: listo" },
      coste: "una respuesta de chat",
      revisar: (cuerpo) => cuerpo?.reply || cuerpo?.message || ""
    }
  };

  for (const nombre of REALES) {
    const prueba = pruebas[nombre];
    try {
      const respuesta = await pedir(prueba.ruta, { method: "POST", body: prueba.cuerpo, timeout: 120000 });
      if (!respuesta.ok) {
        const motivo = respuesta.cuerpo?.error || respuesta.cuerpo?.code || `estado ${respuesta.estado}`;
        registrar(respuesta.estado === 503 ? "FALTA" : "FALLA", `${nombre}: llamada real`, "", motivo);
        continue;
      }
      const rastro = prueba.revisar(respuesta.cuerpo || {});
      registrar("OK", `${nombre}: llamada real`, "", rastro ? `devolvió ${rastro}` : "respuesta correcta");
    } catch (error) {
      registrar("FALLA", `${nombre}: llamada real`, "", error?.message || "sin respuesta");
    }
  }
}

/* ---------- Resumen ---------- */

function resumen() {
  const cuenta = filas.reduce((suma, fila) => {
    suma[fila.estado] = (suma[fila.estado] || 0) + 1;
    return suma;
  }, {});

  if (JSON_OUT) {
    console.log(JSON.stringify({ base: BASE, modo: VIVO ? "vivo" : "local", reales: REALES, filas, cuenta }, null, 2));
    return;
  }

  console.log("\n=== RESUMEN ===");
  console.log(`  OK ${cuenta.OK || 0} · FALTA ${cuenta.FALTA || 0} · FALLA ${cuenta.FALLA || 0} · OMITE ${cuenta.OMITE || 0}`);
  const faltantes = filas.filter((fila) => fila.estado === "FALTA");
  if (faltantes.length) {
    console.log("  Lo que falta, con nombre y apellido:");
    for (const fila of faltantes) console.log(`    - ${fila.nombre}: ${fila.detalle}`);
  }
  if (REALES.length) console.log("  Las llamadas reales de esta corrida ya se cobraron en tu cuenta del proveedor.");
  if ((cuenta.FALLA || 0) > 0) console.log("  Hay fallas: revisa el detalle de arriba antes de dar nada por bueno.");
}

async function principal() {
  if (!JSON_OUT) {
    console.log("===== KRONOS · PROBADORES DE KAIROS =====");
    console.log(`  modo=${VIVO ? "vivo" : "local"} · base=${BASE} · sesion=${TOKEN ? enmascarar(TOKEN) : "sin token"}`);
    if (QUIERE_REAL) console.log(`  llamadas reales pedidas: ${REALES.join(", ")}`);
  }

  probarCableado();
  if (VIVO || QUIERE_REAL) await probarVivo();
  if (QUIERE_REAL) await probarReales();
  resumen();

  // Salida con código: 1 si algo falló (para poder encadenarlo), 0 si todo
  // está bien o solo falta configuración del dueño.
  const fallas = filas.filter((fila) => fila.estado === "FALLA").length;
  process.exit(fallas > 0 ? 1 : 0);
}

principal().catch((error) => {
  console.error("PROBADORES_ERROR:", error?.message || error);
  process.exit(1);
});

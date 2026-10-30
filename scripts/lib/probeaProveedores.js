#!/usr/bin/env node
"use strict";

/**
 * Sondas de lectura de los proveedores de pago.
 *
 * Por qué existe: hasta ahora la única forma de saber que una clave de proveedor
 * funciona era disparar algo que cuesta (un correo, una generación facturada, un
 * trabajo de video). Hay una diferencia entre «la clave está en el panel» y «la clave
 * funciona», y esta sonda cierra la mitad que se puede cerrar gratis: cada
 * proveedor tiene un endpoint de metadatos que responde a un GET con la clave en
 * la cabecera. Eso demuestra que la clave es válida sin enviar un solo correo,
 * sin generar una imagen y sin cobrar nada.
 *
 * Lo que esta sonda NO prueba, y no finge probar:
 *   - que un buzón real recibió el correo (solo que Resend acepta la clave y el
 *     dominio está verificado);
 *   - que una generación facturada termina bien (solo que la clave tiene saldo
 *     o tope, y si es de crédito gratuito);
 *   - el trabajo de video: la API configurada no tiene endpoint de lectura, así
 *     que se reporta cómo verificarlo de verdad.
 *
 * Reglas del instrumento:
 *   - URL de proveedor como constante del módulo: no hay variable que redirija
 *     una clave a un host equivocado;
 *   - nunca imprime un valor, ni siquiera mascarado: las claves no aparecen en
 *     la salida (hay una prueba que lo comprueba);
 *   - sin clave no se toca la red: la fila sale FALTA y el programa puede
 *     correrse en cualquier máquina;
 *   - leer es lo único que hace: todo es GET, sin cuerpo.
 */

const { getAIProviderConfig } = require("../../server/src/config/aiProviders");

/** Endpoints de metadatos. Cada uno es un GET sin cuerpo y sin costo. */
const URL_RESEND_DOMINIOS = "https://api.resend.com/domains";
const URL_OPENROUTER_CLAVE = "https://openrouter.ai/api/v1/key";
const URL_GEMINI_MODELOS = "https://generativelanguage.googleapis.com/v1beta/models";

const TIEMPO_LIMITE_MS = 15000;

/** Forma de un Client ID de OAuth para aplicación web. */
const FORMA_CLIENT_ID = /^[0-9]{6,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com$/;

function tiene(env, nombre) {
  const valor = env[nombre];

  return typeof valor === "string" && valor.trim().length > 0 ? valor.trim() : "";
}

/**
 * Solo el dominio de un remitente, que no es un dato sensible. Acepta las dos
 * formas que admite Resend —`addr@dominio` y `Nombre <addr@dominio>`— y si el
 * valor no tiene forma de correo devuelve la cadena vacía en vez de un dominio
 * inventado (un dominio mal recortado se parecería sospechosamente a «el dominio
 * no está verificado», que es un diagnóstico falso).
 */
function dominioDe(correo) {
  const texto = String(correo || "").trim();
  const entre = texto.match(/<\s*([^>]+?)\s*>/);
  const direccion = (entre ? entre[1] : texto).trim();

  if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(direccion)) return "";

  return direccion.slice(direccion.lastIndexOf("@") + 1).toLowerCase();
}

/**
 * GET con cabecera de autenticación. Devuelve `{ ok, estado, datos, error }` sin
 * lanzar: una sonda que revienta no informa, y el doctor necesita el detalle.
 */
async function leer(fetchImpl, url, cabecera) {
  let response;

  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", ...cabecera },
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS)
    });
  } catch (error) {
    return { ok: false, estado: 0, datos: null, error: error?.name || error?.message || "error" };
  }

  let datos = null;

  try {
    datos = await response.json();
  } catch {
    datos = null;
  }

  return { ok: response.ok, estado: response.status, datos, error: null };
}

function esReject(estado) {
  return estado === 401 || estado === 403;
}

/**
 * Un dominio de envío verificado es lo que hace que el correo llegue. Una clave
 * válida con el dominio pendiente deja la API en 200 y el correo en el limbo,
 * así que se comprueban las dos cosas juntas.
 */
async function sondaResend({ env, fetchImpl }) {
  const clave = tiene(env, "RESEND_API_KEY");
  const remitente = tiene(env, "RESEND_FROM_EMAIL");

  if (!clave) return [{ estado: "FALTA", nombre: "RESEND_API_KEY", exige: "RESEND_API_KEY", detalle: "sin clave no se consulta a Resend" }];
  if (!remitente) return [{ estado: "FALTA", nombre: "RESEND_FROM_EMAIL", exige: "RESEND_FROM_EMAIL", detalle: "la clave está, falta el remitente" }];

  const dominio = dominioDe(remitente);

  if (!dominio) {
    return [{ estado: "FALLA", nombre: "RESEND_FROM_EMAIL", exige: "RESEND_FROM_EMAIL", detalle: "no tiene forma de «buzon@dominio»: la API rechaza el envío antes de intentar nada" }];
  }

  const lectura = await leer(fetchImpl, URL_RESEND_DOMINIOS, { Authorization: `Bearer ${clave}` });

  if (lectura.error) {
    return [{ estado: "FALLA", nombre: "correo (Resend)", exige: "RESEND_API_KEY", detalle: `sin respuesta de api.resend.com (${lectura.error})` }];
  }

  if (!lectura.ok) {
    const porQue = esReject(lectura.estado) ? "clave rechazada" : "respuesta inesperada";

    return [{ estado: "FALLA", nombre: "correo (Resend)", exige: "RESEND_API_KEY", detalle: `${porQue} (HTTP ${lectura.estado})` }];
  }

  const dominios = Array.isArray(lectura.datos?.data) ? lectura.datos.data : [];
  const propio = dominios.find((item) => String(item?.name || "").toLowerCase() === dominio);

  if (!propio) {
    return [{ estado: "FALLA", nombre: "correo (Resend)", exige: "RESEND_FROM_EMAIL", detalle: `la clave funciona pero «${dominio}» no es un dominio de envío registrado` }];
  }

  if (propio.is_verified !== true && String(propio.status || "").toLowerCase() !== "verified") {
    return [{ estado: "FALLA", nombre: "correo (Resend)", exige: "RESEND_FROM_EMAIL", detalle: `«${dominio}» registrado pero sin verificar (status=${propio.status || "?"})` }];
  }

  return [
    { estado: "OK", nombre: "correo (Resend)", exige: "RESEND_API_KEY", detalle: `clave válida · dominio «${dominio}» verificado · ${dominios.length} dominio(s) en la cuenta` },
    { estado: "OK", nombre: "correo (envío real)", detalle: "esto no prueba que un buzón haya recibido nada: para eso, un alta de cuenta o un restablecimiento con un correo propio" }
  ];
}

/**
 * OpenRouter responde a `GET /api/v1/key` con el estado de la clave: si es de
 * crédito gratuito, cuánto lleva gastado y cuál es su tope. Con eso se puede
 * decir si «hay facturación» sin generar nada.
 */
async function sondaOpenRouter({ env, fetchImpl }) {
  const clave = tiene(env, "OPENROUTER_API_KEY");

  if (!clave) {
    return [
      {
        estado: "FALTA",
        nombre: "OPENROUTER_API_KEY",
        exige: "OPENROUTER_API_KEY",
        detalle: `sin clave no se consulta a openrouter.ai · los modelos en uso serían guion=${getAIProviderConfig("script").model} e imagen=${getAIProviderConfig("image").model}`
      }
    ];
  }

  const lectura = await leer(fetchImpl, URL_OPENROUTER_CLAVE, { Authorization: `Bearer ${clave}` });

  if (lectura.error) {
    return [{ estado: "FALLA", nombre: "OPENROUTER_API_KEY", exige: "OPENROUTER_API_KEY", detalle: `sin respuesta de openrouter.ai (${lectura.error})` }];
  }

  if (!lectura.ok) {
    const porQue = esReject(lectura.estado) ? "clave rechazada" : "respuesta inesperada";

    return [{ estado: "FALLA", nombre: "OPENROUTER_API_KEY", exige: "OPENROUTER_API_KEY", detalle: `${porQue} (HTTP ${lectura.estado})` }];
  }

  const datos = lectura.datos?.data || lectura.datos || {};
  const gratuito = datos.is_free === true;
  const tope = typeof datos.limit === "number" ? `${datos.limit} créditos` : "sin tope declarado";
  const uso = typeof datos.usage === "number" ? datos.usage.toFixed(2) : "?";
  const modelos = [
    { capacidad: "guion", valor: getAIProviderConfig("script").model },
    { capacidad: "imagen", valor: getAIProviderConfig("image").model }
  ];

  return [
    {
      estado: gratuito ? "FALLA" : "OK",
      nombre: "OpenRouter (clave y facturación)",
      exige: "OPENROUTER_API_KEY",
      detalle: gratuito
        ? `la clave existe pero es de crédito gratuito: una generación facturada no va a funcionar (${tope}, uso ${uso})`
        : `clave válida · ${tope} · uso acumulado ${uso}`
    },
    { estado: "OK", nombre: "OpenRouter (modelos en uso)", detalle: `guion=${modelos[0].valor} · imagen=${modelos[1].valor}` },
    { estado: "OK", nombre: "OpenRouter (generación real)", detalle: "queda una corrida: npm run smoke:openrouter (una generación de cada, lo cobra el proveedor)" }
  ];
}

/**
 * A Gemini se le puede preguntar qué modelos admite una clave. Es el error más
 * tonto y más común: una clave válida cuyo nombre de modelo no existe, que en
 * producción se ve como un 503 perpetuo.
 */
async function sondaGemini({ env, fetchImpl }) {
  const clave = tiene(env, "GEMINI_API_KEY");
  const modelo = getAIProviderConfig("chat").model;

  if (!clave) {
    return [{ estado: "FALTA", nombre: "GEMINI_API_KEY", exige: "GEMINI_API_KEY", detalle: `el chat usaría el modelo ${modelo}, pero sin clave no se consulta` }];
  }

  const lectura = await leer(fetchImpl, `${URL_GEMINI_MODELOS}?pageSize=1000`, { "x-goog-api-key": clave });

  if (lectura.error) {
    return [{ estado: "FALLA", nombre: "GEMINI_API_KEY", exige: "GEMINI_API_KEY", detalle: `sin respuesta de generativelanguage.googleapis.com (${lectura.error})` }];
  }

  if (!lectura.ok) {
    const porQue = esReject(lectura.estado) ? "clave rechazada" : "respuesta inesperada";

    return [{ estado: "FALLA", nombre: "GEMINI_API_KEY", exige: "GEMINI_API_KEY", detalle: `${porQue} (HTTP ${lectura.estado})` }];
  }

  const modelos = Array.isArray(lectura.datos?.models) ? lectura.datos.models : [];
  const nombres = new Set(modelos.map((item) => String(item?.name || "").split("/").pop()));
  const disponible = nombres.size === 0 ? null : nombres.has(modelo);

  if (disponible === false) {
    return [{ estado: "FALLA", nombre: "Gemini (modelo del chat)", exige: "GEMINI_MODEL", detalle: `la clave es válida pero «${modelo}» no está entre los ${modelos.length} modelos que admite` }];
  }

  return [
    {
      estado: "OK",
      nombre: "Gemini (clave)",
      exige: "GEMINI_API_KEY",
      detalle: disponible
        ? `clave válida · ${modelos.length} modelos · «${modelo}» disponible`
        : `clave válida · el proveedor no devolvió el catálogo, el modelo «${modelo}» no se pudo confirmar`
    },
    { estado: "OK", nombre: "Gemini (chat real)", detalle: "queda una corrida: TOKEN=… npm run probar:chat (una respuesta corta)" }
  ];
}

/**
 * Video: la API que usa el módulo no tiene endpoint de lectura, así que no se
 * inventa una comprobación. Lo que sí se puede comprobar sin tocar el proveedor
 * es que la clave no vaya a viajar en claro.
 */
function sondaVideo({ env }) {
  const clave = tiene(env, "VIDEO_API_KEY");
  const endpoint = tiene(env, "VIDEO_API_URL");

  if (!clave || !endpoint) {
    return [{ estado: "FALTA", nombre: "VIDEO_API_KEY + VIDEO_API_URL", exige: "VIDEO_API_URL", detalle: "hace falta la clave y el endpoint del proveedor" }];
  }

  if (!endpoint.startsWith("https://")) {
    return [{ estado: "FALLA", nombre: "VIDEO_API_URL", exige: "VIDEO_API_URL", detalle: "el endpoint no es https: la clave del proveedor viajaría sin cifrar" }];
  }

  return [{ estado: "OK", nombre: "video (proveedor)", exige: "VIDEO_API_KEY", detalle: `endpoint https y clave presente · modelo en uso ${getAIProviderConfig("video").model} · sin endpoint de lectura, la verificación real es TOKEN=… npm run probar:video` }];
}

/**
 * Google: aquí el riesgo no es que falte la variable, es que el ID del cliente
 * del navegador y el del servidor no sean el mismo. La verificación del ID token
 * comprueba la audiencia contra GOOGLE_CLIENT_ID, así que dos IDs distintos dan
 * un 401 incomprensible en el botón de acceso.
 */
function sondaGoogle({ env }) {
  const servidor = tiene(env, "GOOGLE_CLIENT_ID");
  const cliente = tiene(env, "VITE_GOOGLE_CLIENT_ID");

  if (!servidor) {
    return [{ estado: "FALTA", nombre: "GOOGLE_CLIENT_ID", exige: "GOOGLE_CLIENT_ID", detalle: "sin él el botón de acceso responde enabled=false y el registro con Google no existe" }];
  }

  const filas = [];

  filas.push(
    FORMA_CLIENT_ID.test(servidor)
      ? { estado: "OK", nombre: "GOOGLE_CLIENT_ID (forma)", detalle: "con forma de Client ID de aplicación web" }
      : { estado: "FALLA", nombre: "GOOGLE_CLIENT_ID (forma)", detalle: "no parece un Client ID de Google; suele ser un Spaces o un copia-y-pega incompleto" }
  );

  if (cliente) {
    filas.push(
      cliente === servidor
        ? { estado: "OK", nombre: "GOOGLE_CLIENT_ID = VITE_GOOGLE_CLIENT_ID", exige: "VITE_GOOGLE_CLIENT_ID", detalle: "los dos coinciden: la audiencia del token va a validar" }
        : { estado: "FALLA", nombre: "GOOGLE_CLIENT_ID = VITE_GOOGLE_CLIENT_ID", exige: "VITE_GOOGLE_CLIENT_ID", detalle: "valores distintos: Google emite el token para uno y el servidor lo verifica contra el otro, y eso es un 401 en el botón" }
    );
  } else {
    filas.push({ estado: "OK", nombre: "cruce con el cliente", detalle: "VITE_GOOGLE_CLIENT_ID no está en este entorno: el cruce se hace en el panel de Vercel o con el bundle desplegado" });
  }

  return filas;
}

function sondaBaseDatos({ env, redactar }) {
  const uri = tiene(env, "MONGODB_URI");

  if (!uri) {
    return [{ estado: "FALTA", nombre: "MONGODB_URI", exige: "MONGODB_URI", detalle: "sin URI no hay base que sondear" }];
  }

  if (!/^(mongodb|mongodb\+srv):\/\//.test(uri)) {
    return [{ estado: "FALLA", nombre: "MONGODB_URI (forma)", detalle: "no es una cadena de conexión de MongoDB" }];
  }

  return [{ estado: "OK", nombre: "MONGODB_URI (forma)", detalle: `conecta contra ${redactar(uri)} · la prueba real de conexión es la sección anterior` }];
}

/**
 * Corre todas las sondas. `fetchImpl` se inyecta para poder probar el
 * instrumento con un proveedor simulado sin tocar la red.
 */
async function sondearProveedores({ env = process.env, fetchImpl = globalThis.fetch, redactar = (valor) => String(valor || "").replace(/:[^:@/]+@/, ":***@") } = {}) {
  const filas = [
    ...sondaGoogle({ env }),
    ...(await sondaResend({ env, fetchImpl })),
    ...(await sondaOpenRouter({ env, fetchImpl })),
    ...(await sondaGemini({ env, fetchImpl })),
    ...sondaVideo({ env }),
    ...sondaBaseDatos({ env, redactar })
  ];

  return filas;
}

module.exports = {
  sondearProveedores,
  ENDPOINTS: {
    resend: URL_RESEND_DOMINIOS,
    openrouter: URL_OPENROUTER_CLAVE,
    gemini: URL_GEMINI_MODELOS
  },
  FORMA_CLIENT_ID
};

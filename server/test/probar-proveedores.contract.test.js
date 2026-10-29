const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Contrato de `scripts/lib/probeaProveedores.js` — la sonda que responde a los
 * puntos del bloque C de `docs/CHECKLIST-CIERRE-Y-ESCALABILIDAD.md`.
 *
 * La sonda existe para poder decir «esta clave funciona» sin gastar crédito, sin
 * enviar un correo y sin escribir en la base. Justo por eso este contrato no
 * prueba el camino feliz: prueba que **no aprueba lo que no puede comprobar**.
 * Un instrumento de verificación que devuelve OK por defecto es peor que no
 * tenerlo, porque convierte una duda en un falso cerrado.
 *
 * El proveedor se simula inyectando `fetchImpl`: el código de producto no lleva
 * ningún modo simulado y la sonda sigue apuntando a los hosts reales.
 */

const RAIZ = path.join(__dirname, "..", "..");
const SONDA = path.join(RAIZ, "scripts", "lib", "probeaProveedores.js");
const DOCTOR = path.join(RAIZ, "scripts", "kronos-doctor.js");
const { sondearProveedores, ENDPOINTS, FORMA_CLIENT_ID } = require(SONDA);
const { getAIProviderConfig } = require(path.join(RAIZ, "server", "src", "config", "aiProviders"));

const CLIENT_ID = "132562057632-fklkvjhkd4t8f7r37ribmqjlfua3pncm.apps.googleusercontent.com";
const CANARIOS = {
  RESEND_API_KEY: "re_CANARIO_0123456789abcdef",
  OPENROUTER_API_KEY: "sk-or-v1-CANARIO0123456789abcdef",
  GEMINI_API_KEY: "AIzaCANARIO0123456789abcdef",
  VIDEO_API_KEY: "video-CANARIO-0123456789abcdef",
  JWT_SECRET: "jwt-CANARIO-0123456789abcdef",
  MONGODB_URI: "mongodb+srv://usuario-CANARIO:contra-CANARIO@cluster0.real.mongodb.net/kronos_social_ai"
};

/** Respuestas simuladas con las formas reales de cada proveedor. */
function proveedor({ resend, openrouter, gemini, estados = {} } = {}) {
  const llamadas = [];

  const fetchImpl = async (url, opciones = {}) => {
    llamadas.push({ url, metodo: opciones.method || "GET", cabeceras: opciones.headers || {} });

    const respuesta = (datos, estado) => ({
      ok: (estado || 200) < 400,
      status: estado || 200,
      json: async () => datos
    });

    if (String(url).startsWith(ENDPOINTS.resend)) {
      return respuesta(resend ?? { data: [{ object: "domain", name: "kronos-space.com", status: "verified" }] }, estados.resend);
    }

    if (String(url).startsWith(ENDPOINTS.openrouter)) {
      return respuesta(openrouter ?? { data: { label: "produccion", usage: 12.34, limit: null, is_free: false } }, estados.openrouter);
    }

    if (String(url).startsWith(ENDPOINTS.gemini)) {
      const modelos = gemini === null ? {} : { models: gemini ?? [{ name: `models/${getAIProviderConfig("chat").model}` }] };

      return respuesta(modelos, estados.gemini);
    }

    return respuesta({}, 404);
  };

  return { fetchImpl, llamadas };
}

const ENV_COMPLETO = {
  ...CANARIOS,
  RESEND_FROM_EMAIL: "Kronos <no-reply@kronos-space.com>",
  GOOGLE_CLIENT_ID: CLIENT_ID,
  VIDEO_API_URL: "https://video.kronos-space.com/api"
};

test("sin variables no se toca la red y todo se reporta como falta", async () => {
  const { fetchImpl, llamadas } = proveedor();
  const filas = await sondearProveedores({ env: {}, fetchImpl });

  assert.ok(filas.length >= 6, "debe cubrir Google, correo, OpenRouter, Gemini, video y base de datos");
  assert.deepEqual(llamadas, [], "sin clave no se hace ninguna petición: una sonda no debe enviar cabeceras vacías a ningún host");

  for (const fila of filas) {
    assert.equal(fila.estado, "FALTA", `${fila.nombre} no puede estar ${fila.estado} sin configuración`);
    assert.match(fila.nombre, /[A-Z]{4,}|GOOGLE|VIDEO|MONGODB/, `la fila "${fila.nombre}" debe nombrar la variable que falta`);
  }
});

test("cada sonda solo hace GET al host oficial de su proveedor", async () => {
  const { fetchImpl, llamadas } = proveedor();
  await sondearProveedores({ env: ENV_COMPLETO, fetchImpl });

  assert.equal(llamadas.length, 3, "correo, facturación y modelos: una lectura por proveedor configurado");

  for (const llamada of llamadas) {
    assert.equal(llamada.metodo, "GET", "la sonda es de lectura: un POST podría crear trabajo o cobrar");
    assert.match(llamada.url, /^https:\/\//, "ninguna clave viaja por http");
    assert.ok(
      /^https:\/\/(api\.resend\.com|openrouter\.ai|generativelanguage\.googleapis\.com)\//.test(llamada.url),
      `la sonda no puede enviar la clave a un host distinto: ${llamada.url}`
    );
    assert.doesNotMatch(llamada.url, /sk-or|re_|AIza|CANARIO/, "la clave va en la cabecera, nunca en la URL");
  }

  assert.equal(llamadas[0].cabeceras.Authorization, `Bearer ${CANARIOS.RESEND_API_KEY}`);
  assert.equal(llamadas[1].cabeceras.Authorization, `Bearer ${CANARIOS.OPENROUTER_API_KEY}`);
  assert.equal(
    llamadas[2].cabeceras["x-goog-api-key"],
    CANARIOS.GEMINI_API_KEY,
    "Gemini se autentica por cabecera: un modelo en la URL sería una clave en el historial del navegador"
  );
});

test("clave rechazada: FALLA con el estado HTTP, nunca OK", async () => {
  for (const [clave, nombre] of [["resend", "RESEND"], ["openrouter", "OPENROUTER"], ["gemini", "GEMINI"]]) {
    const { fetchImpl } = proveedor({ estados: { [clave]: 401 } });
    const filas = await sondearProveedores({ env: ENV_COMPLETO, fetchImpl });
    const fila = filas.find((item) => item.nombre.includes(nombre === "RESEND" ? "correo" : nombre));

    assert.ok(fila, `debe reportar la sonda de ${nombre}`);
    assert.equal(fila.estado, "FALLA");
    assert.match(fila.detalle, /clave rechazada.*401/s);
  }
});

test("proveedor sin respuesta: FALLA, no se cuelga ni aprueba", async () => {
  const filas = await sondearProveedores({
    env: ENV_COMPLETO,
    fetchImpl: async () => {
      throw Object.assign(new Error("boom"), { name: "TimeoutError" });
    }
  });
  const fallidas = filas.filter((item) => item.estado === "FALLA");

  assert.equal(fallidas.length, 3, "correo, OpenRouter y Gemini declaran que no pudieron comprobar nada");
  for (const fila of fallidas) assert.match(fila.detalle, /sin respuesta.*TimeoutError/s);
});

test("correo: la clave puede ser válida y el dominio no estar verificado", async () => {
  const pendiente = await sondearProveedores({
    env: ENV_COMPLETO,
    fetchImpl: proveedor({ resend: { data: [{ object: "domain", name: "kronos-space.com", status: "pending" }] } }).fetchImpl
  });

  assert.match(pendiente.find((f) => f.nombre.includes("correo")).detalle, /sin verificar.*pending/);

  const ajeno = await sondearProveedores({
    env: ENV_COMPLETO,
    fetchImpl: proveedor({ resend: { data: [{ object: "domain", name: "otro-dominio.example", status: "verified" }] } }).fetchImpl
  });
  const filaAjeno = ajeno.find((f) => f.nombre.includes("correo"));

  assert.equal(filaAjeno.estado, "FALLA");
  assert.match(filaAjeno.detalle, /kronos-space\.com.*no es un dominio de envío registrado/s);

  const sinForma = await sondearProveedores({
    env: { ...ENV_COMPLETO, RESEND_FROM_EMAIL: "no-reply arroba kronos" },
    fetchImpl: proveedor({ resend: null }).fetchImpl
  });
  const filaForma = sinForma.find((f) => f.nombre === "RESEND_FROM_EMAIL");

  assert.equal(filaForma.estado, "FALLA");
  assert.match(filaForma.detalle, /forma de/);
});

test("OpenRouter: una clave de crédito gratuito no aprueba «generación facturada»", async () => {
  const gratuito = await sondearProveedores({
    env: ENV_COMPLETO,
    fetchImpl: proveedor({ openrouter: { data: { label: "personal", usage: 0, limit: null, is_free: true } } }).fetchImpl
  });
  const fila = gratuito.find((f) => f.nombre.includes("facturación"));

  assert.equal(fila.estado, "FALLA");
  assert.match(fila.detalle, /crédito gratuito/);

  const pagado = await sondearProveedores({ env: ENV_COMPLETO, fetchImpl: proveedor().fetchImpl });
  const ok = pagado.find((f) => f.nombre.includes("facturación"));

  assert.equal(ok.estado, "OK");
  assert.match(ok.detalle, /12\.34/);
  assert.match(
    pagado.find((f) => f.nombre.includes("generación real")).detalle,
    /smoke:openrouter/,
    "y dice dónde se hace la comprobación que sí cobra"
  );
});

test("Gemini: clave válida con un modelo inexistente es un fallo, no un OK", async () => {
  const filas = await sondearProveedores({
    env: ENV_COMPLETO,
    fetchImpl: proveedor({ gemini: [{ name: "models/gemini-algun-dia" }] }).fetchImpl
  });
  const fila = filas.find((f) => f.nombre.includes("Gemini"));
  const modelo = getAIProviderConfig("chat").model;

  assert.equal(fila.estado, "FALLA");
  assert.match(fila.detalle, new RegExp(modelo));

  const catalogoVacio = await sondearProveedores({
    env: ENV_COMPLETO,
    fetchImpl: proveedor({ gemini: [] }).fetchImpl
  });
  const filaVacia = catalogoVacio.find((f) => f.nombre.includes("Gemini"));

  assert.match(filaVacia.detalle, /no se pudo confirmar/, "catálogo vacío no se disfraza de aprobado");
});

test("video: sin endpoint de lectura no se inventa un aprobado, pero http sí es un fallo", async () => {
  const seguro = await sondearProveedores({ env: ENV_COMPLETO, fetchImpl: proveedor().fetchImpl });
  const fila = seguro.find((f) => f.nombre.includes("video"));

  assert.equal(fila.estado, "OK");
  assert.match(fila.detalle, /probar:video/, "remite a la única comprobación que vale");

  const enClaro = await sondearProveedores({
    env: { ...ENV_COMPLETO, VIDEO_API_URL: "http://video.kronos-space.com/api" },
    fetchImpl: proveedor().fetchImpl
  });

  assert.equal(enClaro.find((f) => f.nombre === "VIDEO_API_URL").estado, "FALLA");
  assert.match(enClaro.find((f) => f.nombre === "VIDEO_API_URL").detalle, /sin cifrar/);
});

test("Google: lo que rompe el botón es que los dos Client ID no coincidan", async () => {
  const parejo = await sondearProveedores({
    env: { ...ENV_COMPLETO, VITE_GOOGLE_CLIENT_ID: CLIENT_ID },
    fetchImpl: proveedor().fetchImpl
  });
  const cruce = parejo.find((f) => f.nombre.includes("VITE_GOOGLE_CLIENT_ID"));

  assert.equal(cruce.estado, "OK");
  assert.match(cruce.detalle, /audiencia/);

  const suelto = await sondearProveedores({
    env: { ...ENV_COMPLETO, VITE_GOOGLE_CLIENT_ID: "132562057632-otroclientotroclient00.apps.googleusercontent.com" },
    fetchImpl: proveedor().fetchImpl
  });

  assert.equal(suelto.find((f) => f.nombre.includes("VITE_GOOGLE_CLIENT_ID")).estado, "FALLA");
  assert.match(suelto.find((f) => f.nombre.includes("VITE_GOOGLE_CLIENT_ID")).detalle, /401/);

  assert.ok(FORMA_CLIENT_ID.test(CLIENT_ID), "la forma aceptada debe aceptar un Client ID real");
  assert.ok(!FORMA_CLIENT_ID.test("1325-abc.apps.googleusercontent.com"), "y rechazar uno incompleto");
});

test("la base de datos se describe sin sus credenciales", async () => {
  const filas = await sondearProveedores({ env: ENV_COMPLETO, fetchImpl: proveedor().fetchImpl });
  const fila = filas.find((f) => f.nombre.includes("MONGODB_URI"));

  assert.equal(fila.estado, "OK");
  assert.match(fila.detalle, /usuario-CANARIO:\*\*\*@cluster0\.real\.mongodb\.net\/kronos_social_ai/);
  assert.doesNotMatch(fila.detalle, /contra-CANARIO/);
});

test("ninguna clave aparece en la salida, ni siquiera mascarada", async () => {
  const filas = await sondearProveedores({ env: ENV_COMPLETO, fetchImpl: proveedor().fetchImpl });
  const salida = JSON.stringify(filas);

  for (const valor of Object.values(CANARIOS)) {
    assert.ok(!salida.includes(valor), `la salida contiene el valor de una variable: ${valor.slice(0, 6)}…`);
  }

  assert.doesNotMatch(salida, /Bearer|AIza[0-9A-Za-z_-]{20,}|sk-or-v1-/);
});

test("ni la sonda ni el doctor imprimen el entorno crudo de una clave", () => {
  const nombres = ["OPENROUTER_API_KEY", "GEMINI_API_KEY", "RESEND_API_KEY", "RESEND_FROM_EMAIL", "VIDEO_API_KEY", "VIDEO_API_URL", "GOOGLE_CLIENT_ID", "JWT_SECRET", "MONGODB_URI"];

  for (const archivo of [SONDA, DOCTOR]) {
    const codigo = fs.readFileSync(archivo, "utf8");

    for (const variable of nombres) {
      // La variable solo puede aparecer como NOMBRE (entre comillas). Leer
      // process.env.X y mandarlo a la salida es la filtración por omisión.
      assert.ok(
        !new RegExp(`(?:console\\.log|line)\\([^)]*process\\.env\\.${variable}`, "s").test(codigo),
        `${path.basename(archivo)} imprime process.env.${variable}`
      );
      assert.ok(
        !new RegExp(`tiene\\(env,\\s*"${variable}"\\)[\\s\\S]{0,80}console\\.log`).test(codigo),
        `${path.basename(archivo)} imprime el valor leído de ${variable}`
      );

      if (codigo.includes(`"${variable}"`)) {
        assert.ok(
          new RegExp(`tiene\\(env, "${variable}"\\)|env\\.${variable}|OPTIONAL|"${variable}"`).test(codigo),
          `${path.basename(archivo)} referencia ${variable} fuera de los sitios permitidos`
        );
      }
    }
  }
});

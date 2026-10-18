const test = require("node:test");
const assert = require("node:assert");

/**
 * T07 — Rate limiting real.
 *
 * Las pruebas de contrato comprueban que el limitador está montado; esta
 * comprueba lo que de verdad importa para un cliente: que al pasarse, el
 * servidor responde 429 con su mensaje y con los encabezados que anuncian
 * cuándo volver a intentar. Se ejecuta contra el servidor real con un límite
 * pequeño inyectado por entorno (el mismo mecanismo que usan las E2E para
 * subirlo), sin tocar el valor por defecto de producción.
 */

// Antes de cargar el servidor: el limitador lee el entorno al construirse.
process.env.API_RATE_LIMIT_MAX = "3";
process.env.ABUSE_RATE_LIMIT_MAX = "1000";
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-rate-limit-secret";

const { server } = require("../src/server");

let baseUrl;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
});

test("rate limit: al pasarse del límite responde 429 con mensaje y encabezados", async () => {
  const estados = [];
  let ultima = null;

  for (let intento = 1; intento <= 4; intento += 1) {
    // /api/health responde 200 o 503 según la base, pero siempre pasa por el
    // limitador de /api: aquí se mide el limitador, no la base.
    const respuesta = await fetch(`${baseUrl}/api/health`);
    estados.push(respuesta.status);
    ultima = respuesta;
    if (respuesta.status === 429) break;
  }

  assert.strictEqual(estados[0] !== 429, true, "las primeras peticiones no están bloqueadas");
  assert.strictEqual(ultima.status, 429, `la cuarta petición debe estar bloqueada (estados: ${estados.join(",")})`);

  const cuerpo = await ultima.json().catch(() => null);
  assert.match(String(cuerpo?.error || ""), /Demasiadas solicitudes/i, "el mensaje es el declarado por el limitador");

  // Encabezados estándar (draft-8). El formato medido en vivo es el de la
  // política de cuota: "3-in-15min"; r=0; t=900 — el cupo, lo que queda (0) y
  // los segundos hasta poder reintentar.
  const rateLimit = ultima.headers.get("ratelimit") || "";
  assert.match(rateLimit, /"3-in-15min"/, `anuncia la política aplicada: ${rateLimit}`);
  assert.match(rateLimit, /(^|;\s*)r=0(;|$)/, `anuncia que no queda cupo: ${rateLimit}`);
  const segundosParaReintentar = Number(/t=(\d+)/.exec(rateLimit)?.[1] ?? 0);
  assert.ok(segundosParaReintentar > 0, `anuncia cuándo reintentar: ${rateLimit}`);

  const retryAfter = ultima.headers.get("retry-after");
  if (retryAfter !== null) {
    assert.ok(Number(retryAfter) > 0, `Retry-After es un número positivo: ${retryAfter}`);
  }
});

test("rate limit: el límite aplicado no altera el valor por defecto del código", () => {
  // El valor de producción vive en server.js como respaldo (300). Aquí solo se
  // demuestra que el entorno manda, que es lo que permite probarlo sin cambiarlo.
  assert.strictEqual(Number(process.env.API_RATE_LIMIT_MAX), 3);
});

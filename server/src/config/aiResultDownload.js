const dns = require("node:dns").promises;
const net = require("node:net");

/**
 * Descarga del resultado que devuelve un proveedor de IA (imagen o video).
 *
 * POR QUÉ EXISTE
 *
 * El servicio de imagen ya tenía esta guarda escrita dentro de sí mismo:
 * comprobación de dirección privada, `https` obligatorio, `redirect: "error"`
 * (seguir una redirección convertiría una respuesta comprometida del proveedor
 * en un SSRF) y tope de bytes leído en streaming. El video no tenía nada de
 * esto: guardaba la URL del proveedor tal cual, así que si caducaba la pieza se
 * perdía y el servidor nunca tocaba los bytes.
 *
 * Copiar la guarda habría dejado dos versiones de la misma política, y la
 * segunda siempre es la que se olvida de actualizar. Por eso vive aquí, se
 * usa desde los dos servicios y el de imagen reexporta estas funciones con sus
 * nombres históricos (`assertSafeProviderUrl` es API pública y está probada).
 */

function isPrivateAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    const [a, b, c] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    if (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    ) {
      return true;
    }

    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return Boolean(mappedIpv4 && isPrivateAddress(mappedIpv4[1]));
  }

  return true;
}

/**
 * Lanza `codes.invalid` si la URL no es un destino https público.
 *
 * Los códigos son parámetro obligatorio a propósito: cada capacidad tiene sus
 * propios códigos traducidos en `middleware/aiError` y este módulo no debe
 * inventar ninguno — un código sin entrada en esa tabla llega al cliente como
 * 502 genérico, que es justo lo que `ai-proveedor-503.contract.test` vigila.
 */
async function assertSafeProviderUrl(parsed, codes, { lookup = dns.lookup } = {}) {
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443")
  ) {
    throw new Error(codes.invalid);
  }

  const hostname = parsed.hostname.replace(/\.$/, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error(codes.invalid);
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error(codes.invalid);
    return;
  }

  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(codes.unavailable);
  }

  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error(codes.invalid);
  }
}

async function readBodyWithLimit(response, { maxBytes, codes }) {
  if (!response.body || typeof response.body.getReader !== "function") {
    throw new Error(codes.unavailable);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value?.byteLength || 0;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(codes.tooLarge);
      }
      if (value?.byteLength) chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error?.message === codes.tooLarge) throw error;
    throw new Error(codes.unavailable);
  }

  return Buffer.concat(chunks, total);
}

/**
 * Descarga un resultado del proveedor con todas las guardas.
 *
 * Devuelve el buffer; la validación del formato (firma del archivo) es cosa de
 * cada capacidad, que es quien sabe qué mimetypes acepta.
 */
async function fetchProviderResult(
  url,
  {
    maxBytes,
    timeoutMs,
    validate,
    codes,
    fetchImpl = fetch,
    // Inyectable para pruebas: la política es "resuelve y comprueba que
    // ninguna dirección sea privada"; resolver de verdad en un test lo hace
    // depender del DNS del entorno.
    lookup
  }
) {
  const { invalid } = codes;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(invalid);
  }

  await assertSafeProviderUrl(parsed, codes, { lookup });

  let response;
  try {
    response = await fetchImpl(parsed, {
      signal: AbortSignal.timeout(timeoutMs),
      // Las URLs del proveedor deben ser finales. Seguir redirecciones dejaría
      // que una respuesta comprometida convirtiera esto en un SSRF.
      redirect: "error"
    });
  } catch (error) {
    if (
      error?.name === "TimeoutError" ||
      error?.name === "AbortError" ||
      error?.code === "ETIMEDOUT"
    ) {
      throw new Error(codes.timeout);
    }
    throw new Error(codes.unavailable);
  }

  if (!response.ok) throw new Error(codes.unavailable);

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(codes.tooLarge);
  }

  const buffer = await readBodyWithLimit(response, { maxBytes, codes });
  return validate ? validate(buffer) : buffer;
}

module.exports = {
  isPrivateAddress,
  assertSafeProviderUrl,
  readBodyWithLimit,
  fetchProviderResult
};

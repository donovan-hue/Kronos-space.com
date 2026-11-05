/**
 * Servidores ICE de las salas en vivo.
 *
 * Hasta ahora el cliente llevaba un STUN fijo escrito en el componente
 * (`stun:stun.l.google.com:19302`). Eso funciona en redes domésticas, pero con
 * NAT simétrico —el caso típico de muchas redes móviles y corporativas— STUN
 * no basta para abrir el camino y la llamada se queda sin audio ni video. Para
 * esos casos hace falta un TURN que reenvíe el tráfico.
 *
 * Los servidores se entregan desde aquí, no se hornean en el bundle: las
 * credenciales de TURN cambian (y caducan), así que el cliente las pide a
 * `GET /api/live/ice` en cada entrada a una sala.
 *
 * Configuración (todas opcionales):
 *   LIVE_STUN_URLS   lista separada por comas. Si falta, se usa el STUN público
 *                    que ya estaba en el cliente.
 *   LIVE_TURN_URLS   lista separada por comas (`turn:host:3478?transport=udp`).
 *   LIVE_TURN_USERNAME / LIVE_TURN_CREDENTIAL
 *
 * Sin `LIVE_TURN_URLS` la respuesta es solo STUN: no se inventa un TURN que no
 * existe. La interfaz avisa de esa limitación en lugar de prometer lo que no
 * hay.
 */

const DEFAULT_STUN_URLS = ["stun:stun.l.google.com:19302"];

function listOf(value) {
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

/** Solo esquemas que WebRTC entiende: nada de URLs arbitrarias en el SDP. */
function isValidIceUrl(url) {
  return /^(stun|stuns|turn|turns):[^\s]+$/i.test(url);
}

function resolveIceServers(env = process.env) {
  const stun = listOf(env.LIVE_STUN_URLS).filter(isValidIceUrl);
  // Un solo servidor con la lista de URL STUN: WebRTC acepta `urls` como array
  // y así el navegador no lanza una reunión ICE por STUN en paralelo.
  const servers = [{ urls: stun.length ? stun : [...DEFAULT_STUN_URLS] }];

  const turnUrls = listOf(env.LIVE_TURN_URLS).filter(isValidIceUrl);
  const username = typeof env.LIVE_TURN_USERNAME === "string" ? env.LIVE_TURN_USERNAME.trim() : "";
  const credential = typeof env.LIVE_TURN_CREDENTIAL === "string" ? env.LIVE_TURN_CREDENTIAL : "";

  if (turnUrls.length) {
    // Un TURN con `turn:`/`turns:` y sin credenciales no autentica; se envía
    // igual para que el fallo se vea en el navegador y no se finja cobertura.
    servers.push({
      urls: turnUrls,
      ...(username ? { username } : {}),
      ...(credential ? { credential } : {})
    });
  }

  return {
    servers,
    hasTurn: turnUrls.length > 0
  };
}

module.exports = { resolveIceServers, isValidIceUrl, DEFAULT_STUN_URLS };

/**
 * Guarda fail-closed del destino de las pruebas E2E.
 *
 * R-12 — auditoría del job `atlas`:
 *
 *   mongoose.connect(process.env.KRONOS_E2E_MONGODB_URI, { dbName: "test" })
 *
 * `dbName` fija explícitamente la única base E2E autorizada: `test`.
 * No protege el CLÚSTER: si el secreto `MONGODB_URI` apuntara al clúster
 * productivo, las pruebas podrían escribir sobre la misma infraestructura que
 * sirve a los usuarios; por eso el host remoto exige allowlist.
 *
 * Esta guarda exige que el destino se DEMUESTRE de prueba antes de conectar.
 * No se apoya en el nombre de la base, que es lo que ya controlamos nosotros,
 * sino en el host, que es lo que de verdad decide contra qué infraestructura
 * se escribe.
 *
 * Tres desenlaces, ninguno silencioso:
 *
 *   ALLOW   el host está declarado como de pruebas -> se ejecuta
 *   SKIP    no hay forma de demostrarlo            -> no se conecta, avisa
 *   BLOCK   el destino parece productivo           -> error, exit != 0
 */

/** Hosts que nunca necesitan declaración: no salen de la máquina. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "mongo", "mongodb"]);

/**
 * Señales de que un host o una base pertenecen al servicio real.
 * Coincidir con cualquiera es motivo de BLOCK, no de duda.
 */
const PRODUCTION_HINTS = [
  /kronos-space\.com$/i,
  /(^|[-._])prod([-._]|$)/i,
  /produccion/i,
  /(^|[-._])live([-._]|$)/i,
  /^kronos_social_ai$/i
];

/** La única base que las pruebas E2E pueden usar, y ninguna otra. */
const E2E_DATABASE_NAME = "test";
const PROTECTED_DATABASES = new Set([
  "kronos-space-com",
  "kronos_restore",
  "kronos_social_ai"
]);

/** Variable con la que el operador declara qué hosts son de pruebas. */
const ALLOWLIST_VAR = "KRONOS_E2E_CLUSTER_ALLOWLIST";

/**
 * Extrae el host de una URI de MongoDB sin usar credenciales.
 *
 * No se emplea `new URL()` porque `mongodb+srv://` con varios nodos y con
 * contraseñas que llevan caracteres reservados la hace fallar de formas
 * distintas según la versión de Node. Se corta a mano y se descarta la parte
 * de usuario y contraseña sin leerla nunca.
 */
function extractHosts(uri) {
  const texto = String(uri ?? "").trim();
  const match = /^mongodb(\+srv)?:\/\/(.+)$/i.exec(texto);
  if (!match) return null;

  let resto = match[2];
  const arroba = resto.lastIndexOf("@");
  // Todo lo anterior al último @ son credenciales: se descarta sin mirarlo.
  if (arroba !== -1) resto = resto.slice(arroba + 1);

  const corte = resto.search(/[/?]/);
  const autoridad = corte === -1 ? resto : resto.slice(0, corte);
  if (!autoridad) return null;

  const hosts = autoridad
    .split(",")
    .map((entrada) => entrada.trim())
    .filter(Boolean)
    .map((entrada) => {
      // IPv6 entre corchetes, o host:puerto.
      const ipv6 = /^\[([^\]]+)\]/.exec(entrada);
      if (ipv6) return ipv6[1].toLowerCase();
      return entrada.split(":")[0].toLowerCase();
    })
    .filter(Boolean);

  return hosts.length ? hosts : null;
}

/** Base embebida en la URI, si la trae. */
function extractDatabase(uri) {
  const texto = String(uri ?? "").trim();
  const match = /^mongodb(\+srv)?:\/\/[^/]+\/([^?]*)/i.exec(texto);
  if (!match) return null;
  const nombre = decodeURIComponent(match[2] || "").trim();
  return nombre || null;
}

function pareceProduccion(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return false;
  return PRODUCTION_HINTS.some((hint) => hint.test(texto));
}

function parseAllowlist(raw) {
  return String(raw ?? "")
    .split(",")
    .map((entrada) => entrada.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Decide si las pruebas E2E pueden conectarse.
 *
 * @returns {{decision: "ALLOW"|"SKIP"|"BLOCK", reason: string, hosts: string[]|null}}
 */
function evaluateE2ETarget({ uri, dbName, env = process.env } = {}) {
  const sinUri = !uri || !String(uri).trim();
  if (sinUri) {
    return {
      decision: "SKIP",
      reason: "MONGODB_URI no está configurado: las pruebas que exigen persistencia real se omiten.",
      hosts: null
    };
  }

  const hosts = extractHosts(uri);
  if (!hosts) {
    // Una URI que no se puede analizar no se supone segura.
    return {
      decision: "BLOCK",
      reason: "MONGODB_URI no tiene forma de URI de MongoDB analizable: no se puede demostrar el destino.",
      hosts: null
    };
  }

  const destino = String(dbName ?? "").trim();
  if (PROTECTED_DATABASES.has(destino)) {
    return {
      decision: "BLOCK",
      reason:
        `La base de destino "${destino}" está protegida y nunca puede ser utilizada por E2E.`,
      hosts
    };
  }

  // El workload oficial E2E es la base fija `test`. No se aceptan bases
  // dinámicas ni cualquier otro nombre.
  if (destino !== E2E_DATABASE_NAME) {
    return {
      decision: "BLOCK",
      reason:
        `La base de destino "${dbName}" no es la base E2E oficial "${E2E_DATABASE_NAME}".`,
      hosts
    };
  }

  // Un host productivo es motivo de parada inmediata, esté o no declarado.
  const hostProductivo = hosts.find((host) => pareceProduccion(host));
  if (hostProductivo) {
    return {
      decision: "BLOCK",
      reason:
        `El host de destino "${hostProductivo}" coincide con el patrón de producción. ` +
        "Las pruebas E2E no se ejecutan contra la infraestructura real ni en una base temporal.",
      hosts
    };
  }

  // Local nunca sale de la máquina: no necesita declaración, y se decide
  // ANTES de mirar el nombre de la base. El MongoDB efímero de CI se llama
  // igual que el de producción a propósito, para que la cadena se ensaye con
  // nombres realistas; bloquearlo por el nombre sería un falso positivo que
  // además deja sin sembrar todo lo que viene detrás.
  if (hosts.every((host) => LOCAL_HOSTS.has(host))) {
    return { decision: "ALLOW", reason: `Destino local (${hosts.join(", ")}).`, hosts };
  }

  // En un host remoto, una base productiva embebida en la URI delata que el
  // secreto apunta al servicio real, aunque `dbName` la fuese a pisar.
  const baseUri = extractDatabase(uri);
  if (baseUri && PROTECTED_DATABASES.has(baseUri)) {
    return {
      decision: "BLOCK",
      reason:
        `La URI apunta a la base protegida "${baseUri}". ` +
        "E2E no puede utilizar una base de producción o restore, aunque dbName la sustituya.",
      hosts
    };
  }
  if (baseUri && pareceProduccion(baseUri)) {
    return {
      decision: "BLOCK",
      reason:
        `La URI apunta a la base "${baseUri}", que coincide con el patrón de producción. ` +
        "Aunque dbName la sustituya, el clúster de destino es el productivo.",
      hosts
    };
  }

  // Host remoto: exige declaración explícita del operador. No poder demostrar
  // que es de pruebas NO es lo mismo que ser seguro.
  const allowlist = parseAllowlist(env[ALLOWLIST_VAR]);
  if (!allowlist.length) {
    return {
      decision: "SKIP",
      reason:
        `El destino (${hosts.join(", ")}) es remoto y no hay ${ALLOWLIST_VAR} declarada, ` +
        "así que no se puede demostrar que sea un clúster de pruebas. No se conecta.",
      hosts
    };
  }

  const noDeclarados = hosts.filter((host) => !allowlist.includes(host));
  if (noDeclarados.length) {
    return {
      decision: "BLOCK",
      reason:
        `Estos hosts no están en ${ALLOWLIST_VAR}: ${noDeclarados.join(", ")}. ` +
        "Se declara el clúster de pruebas o no se ejecuta.",
      hosts
    };
  }

  return {
    decision: "ALLOW",
    reason: `Clúster de pruebas declarado en ${ALLOWLIST_VAR} (${hosts.join(", ")}).`,
    hosts
  };
}

/**
 * Aplica la decisión. Lanza en BLOCK; devuelve `false` en SKIP.
 * El mensaje nunca incluye la URI: solo el host, que no es un secreto.
 */
function assertE2ETarget({ uri, dbName, env = process.env, logger = console } = {}) {
  const veredicto = evaluateE2ETarget({ uri, dbName, env });

  if (veredicto.decision === "BLOCK") {
    const error = new Error(`E2E_TARGET_BLOCKED: ${veredicto.reason}`);
    error.code = "E2E_TARGET_BLOCKED";
    throw error;
  }

  if (veredicto.decision === "SKIP") {
    logger.warn?.(`[e2e] omitido — ${veredicto.reason}`);
    return false;
  }

  return true;
}

module.exports = {
  ALLOWLIST_VAR,
  LOCAL_HOSTS,
  PRODUCTION_HINTS,
  E2E_DATABASE_NAME,
  PROTECTED_DATABASES,
  extractHosts,
  extractDatabase,
  pareceProduccion,
  evaluateE2ETarget,
  assertE2ETarget
};

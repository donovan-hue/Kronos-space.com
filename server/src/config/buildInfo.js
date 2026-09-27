/**
 * Identidad de la compilación que está corriendo.
 *
 * R-10/R-11 — el backend vive en Render y no deja rastro auditable de qué
 * commit ejecuta: no hay manifiesto en el repositorio, y los despliegues que
 * GitHub registra son los del cliente en Vercel. Preguntarle al propio
 * servicio es la única fuente de verdad que no depende de que alguien mire un
 * panel y lo transcriba bien.
 *
 * Render inyecta `RENDER_GIT_COMMIT`, `RENDER_GIT_BRANCH`,
 * `RENDER_GIT_REPO_SLUG` y `RENDER_SERVICE_NAME` en build y en ejecución, así
 * que esto funciona sin tocar la configuración del servicio. Se aceptan
 * además las variables equivalentes de otras plataformas para no atarse a
 * una, y `KRONOS_COMMIT` como último recurso manual.
 *
 * Aquí no se expone NADA sensible: solo identificadores públicos de la
 * compilación. La URI, las credenciales y los secretos no entran en este
 * módulo ni por asomo.
 */

/** Variables que cada plataforma usa para el commit, en orden de preferencia. */
const COMMIT_VARS = [
  "RENDER_GIT_COMMIT",
  "KRONOS_COMMIT",
  "SOURCE_VERSION",
  "VERCEL_GIT_COMMIT_SHA",
  "GITHUB_SHA",
  "HEROKU_SLUG_COMMIT",
  "COMMIT_SHA"
];

const BRANCH_VARS = [
  "RENDER_GIT_BRANCH",
  "KRONOS_BRANCH",
  "VERCEL_GIT_COMMIT_REF",
  "GITHUB_REF_NAME",
  "BRANCH"
];

const REPO_VARS = ["RENDER_GIT_REPO_SLUG", "KRONOS_REPO", "GITHUB_REPOSITORY"];

const SERVICE_VARS = ["RENDER_SERVICE_NAME", "KRONOS_SERVICE", "FLY_APP_NAME"];

/** Un SHA de git válido: 7 a 40 hexadecimales. Nada más se acepta. */
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

/**
 * Primer valor no vacío de una lista de variables de entorno.
 * Devuelve `null` en vez de cadena vacía para que el consumidor distinga
 * «no configurado» de «configurado en blanco», que es justo el matiz que
 * convierte una guarda en fail-open.
 */
function firstEnv(names, env) {
  for (const name of names) {
    const raw = env[name];
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (value) return value;
  }
  return null;
}

/**
 * Describe la compilación en ejecución.
 *
 * `commit` solo se rellena si el valor parece de verdad un SHA: un
 * «unknown» o un literal sin sustituir daría una trazabilidad falsa, que es
 * peor que no tener ninguna porque invita a confiar en ella.
 */
function getBuildInfo(env = process.env) {
  const rawCommit = firstEnv(COMMIT_VARS, env);
  const commit = rawCommit && SHA_PATTERN.test(rawCommit) ? rawCommit.toLowerCase() : null;

  return {
    commit,
    commitShort: commit ? commit.slice(0, 7) : null,
    branch: firstEnv(BRANCH_VARS, env),
    repo: firstEnv(REPO_VARS, env),
    service: firstEnv(SERVICE_VARS, env),
    // Sello de arranque del proceso: permite distinguir dos instancias del
    // mismo commit y detectar reinicios sin consultar el panel.
    startedAt: new Date().toISOString(),
    // `true` cuando el commit no se pudo determinar: quien consuma esto sabe
    // que la respuesta no es trazable en lugar de leer un null ambiguo.
    traceable: Boolean(commit)
  };
}

module.exports = {
  COMMIT_VARS,
  BRANCH_VARS,
  REPO_VARS,
  SERVICE_VARS,
  SHA_PATTERN,
  firstEnv,
  getBuildInfo
};

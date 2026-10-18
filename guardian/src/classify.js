/**
 * Clasificación de rutas por zona.
 *
 * Vive en su propio módulo porque es una función pura: no necesita Octokit, ni
 * red, ni `GITHUB_TOKEN`. Mientras estuvo dentro de `diffAnalyzer.js` arrastraba
 * `githubClient.js`, que lanza en el momento de la importación si falta el token
 * e instancia el cliente al cargarse. El efecto era que las reglas de riesgo del
 * guardián no se podían ejercitar sin credenciales de GitHub — es decir, no se
 * podían probar, que es precisamente lo que más falta hace en un módulo cuyo
 * trabajo es decidir si un cambio es peligroso.
 */

/** Zonas que reconoce el evaluador de riesgo. */
function classifyFile(filename) {
  const ruta = String(filename || "");

  if (ruta.startsWith("client")) return "client";
  if (ruta.startsWith("server")) return "server";
  // El guardián no se veía a sí mismo: todo lo de guardian/ caía en "other",
  // que evaluateRisk no puntúa, así que cambiar las reglas de riesgo no
  // producía ni una línea en el informe.
  if (ruta.startsWith("guardian")) return "guardian";
  if (ruta.startsWith("scripts")) return "scripts";
  if (
    ruta.startsWith("config") ||
    ruta.startsWith(".github") ||
    ruta.includes("docker")
  ) return "config";
  return "other";
}

module.exports = { classifyFile };

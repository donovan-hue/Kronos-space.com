const fs = require("node:fs");
const { isIP } = require("node:net");

const DEFAULTS = {
  base: "https://api.kronos-space.com",
  frontend: "https://kronos-space.com",
  origins: "https://kronos-space.com,https://www.kronos-space.com"
};

// Proyecto/equipo que registra las previews reales de este repositorio.
// No aceptar cualquier dominio de Vercel ni una URL de logs como frontend.
const PREVIEW_HOST = /^kronos-space(?:com)?-[a-z0-9-]+-oficialkronosspace-1215\.vercel\.app$/;

function httpsOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash ||
      isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
      !url.hostname.includes(".") || /\.(?:localhost|local|internal|invalid)$/.test(url.hostname)) {
    throw new Error("Se requiere un origen HTTPS público, sin credenciales, puerto, ruta ni parámetros.");
  }
  return url.origin;
}

function deploymentTarget(eventName, event) {
  if (eventName === "workflow_dispatch") {
    const inputs = event.inputs || {};
    return {
      mode: "production",
      base: httpsOrigin(inputs.base || DEFAULTS.base),
      frontend: httpsOrigin(inputs.frontend || DEFAULTS.frontend),
      origins: (inputs.origins || DEFAULTS.origins).split(",").map((origin) => httpsOrigin(origin.trim())).join(","),
      require_frontend_origin: "0"
    };
  }
  if (eventName !== "deployment_status" || event.deployment_status?.state !== "success") {
    throw new Error("Solo se verifican despliegues terminados con success o consultas manuales.");
  }
  const environment = String(event.deployment?.environment || "");
  // Vercel envía production_environment=false incluso cuando environment es
  // Production. La clasificación usa el nombre real, no ese booleano.
  if (/^production(?:$|[\s–—-])/i.test(environment)) {
    return { mode: "production", ...DEFAULTS, require_frontend_origin: "0" };
  }
  if (/^preview(?:$|[\s–—-])/i.test(environment)) {
    const frontend = httpsOrigin(event.deployment_status.environment_url);
    if (!PREVIEW_HOST.test(new URL(frontend).hostname)) {
      throw new Error("La URL de preview no pertenece al proyecto/equipo Vercel de Kronos.");
    }
    return {
      mode: "preview",
      base: DEFAULTS.base,
      frontend,
      origins: frontend,
      require_frontend_origin: "1"
    };
  }
  throw new Error("Entorno de despliegue no reconocido; no se sustituye por producción.");
}

if (require.main === module) {
  try {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    const target = deploymentTarget(process.env.GITHUB_EVENT_NAME, event);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(target).map(([key, value]) => `${key}=${value}\n`).join(""));
    console.log(`Verificación de ${target.mode}: ${target.frontend}; API compartida: ${target.base}`);
  } catch (error) {
    console.error(`No se pudo elegir el despliegue: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { deploymentTarget, httpsOrigin };

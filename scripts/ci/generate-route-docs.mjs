import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ALIAS, ESTADOS, MAPA_PANTALLAS, destinoPantalla } from "../../client/src/lib/screenIndex.js";

const destino = fileURLToPath(new URL("../../docs/RUTAS-Y-NAVEGACION.md", import.meta.url));
const pantallas = MAPA_PANTALLAS.flatMap((area) => area.pantallas);
const fichas = pantallas.filter((pantalla) => pantalla.tipoRuta === "ficha");
const acceso = { publico: "Público", sesion: "Sesión", admin: "Solo administradores" };
const documento = [
  "# Rutas y navegación de Kronos Space",
  "",
  "> Generado desde `client/src/lib/screenIndex.js` con `npm run docs:routes`. No editar las tablas a mano.",
  "",
  "## Acceso visible a todas las funciones",
  "",
  "- El enlace **Funciones** de la cabecera y **Todas las pantallas** del menú abren `/pantallas`.",
  "- `/funciones` es un alias del directorio. Permite buscar por nombre, descripción, ruta, alias o área y filtrar por estado y área.",
  "- Cada entrada tiene una ficha estable `/funciones/<id>`. Los IDs son explícitos: cambiar el título no cambia el enlace de la ficha.",
  "- Las rutas con `:id`, `:userId`, `:username`, `:orbitId` o `:conversationId` abren primero su ficha para pedir el recurso real; no se enlazan parámetros literales ni datos de ejemplo.",
  "- Todas las páginas nuevas requieren sesión. La administración se identifica como restringida y su interfaz exige rol admin; el backend conserva la comprobación de rol contra la base de datos.",
  "- Una ruta no acredita disponibilidad del proveedor: el audio muestra la configuración real; catálogos e historiales muestran errores, vacíos y reintentos sin datos de relleno.",
  "- Abrir audio o apoyos no genera contenido ni crea transacciones. Esas operaciones requieren confirmación explícita. Los apoyos son créditos simbólicos, no pagos.",
  "",
  "## Alcance del directorio",
  "",
  `El directorio enumera **${pantallas.length} pantallas y funciones** de usuario/sistema en **${MAPA_PANTALLAS.length} áreas**: **${pantallas.length - fichas.length}** tienen interfaz y **${fichas.length}** tienen solo ficha informativa. No es un listado de funciones JavaScript internas ni una garantía de que los proveedores externos estén configurados.`,
  "",
  "Proyectos, Versiones y comparación y Plantillas de formato están construidos y conectados a /api/projects. Federación (solo lectura) y Webhooks y flujos son infraestructura/documentación, no herramientas pendientes ni paneles operativos de usuario.",
  "",
  ...MAPA_PANTALLAS.flatMap((area) => [
    `## ${area.titulo}`,
    "",
    area.nota,
    "",
    "| Función | Ruta definida | Acceso desde el directorio | Estado | Permiso |",
    "|---|---|---|---|---|",
    ...area.pantallas.map((pantalla) => `| ${pantalla.nombre} | \`${pantalla.ruta}\` | \`${destinoPantalla(pantalla)}\` | ${pantalla.tipoRuta === "ficha" ? "Ficha informativa · " : ""}${ESTADOS[pantalla.estado]} | ${acceso[pantalla.acceso]} |`),
    ""
  ]),
  "## Alias conservados",
  "",
  "| Alias | Destino |",
  "|---|---|",
  ...Object.entries(ALIAS).map(([alias, ruta]) => `| \`${alias}\` | \`${ruta}\` |`),
  ...pantallas.flatMap((pantalla) => (pantalla.alias || []).map((alias) => `| \`${alias}\` | \`${pantalla.ruta}\` |`)),
  "",
  "## Mantenimiento y comprobaciones",
  "",
  "1. Añadir o actualizar la entrada en `screenIndex.js`, conservando el ID de las fichas existentes.",
  "2. Registrar la ruta real en `App.jsx`, dentro de la guarda de sesión/rol apropiada. Si falta la herramienta, mantener su ficha informativa con estado explícito.",
  "3. Añadir los accesos de navegación pertinentes en `navigation/model.jsx`; todos sus destinos deben existir en el router.",
  "4. Ejecutar `npm run docs:routes` y las pruebas del cliente. `feature-routes.spec.jsx` comprueba cobertura bidireccional del router y del directorio, parámetros, permisos y este documento.",
  "",
  "Documentación relacionada: [plano de interfaz](client/PLANO-INTERFAZ-KRONOS.md), [arquitectura de workflows](WORKFLOWS-ARQUITECTURA-KRONOS.md).",
  ""
].join("\n");

if (process.argv.includes("--check")) {
  if (readFileSync(destino, "utf8") !== documento) {
    console.error("El documento de rutas está desactualizado. Ejecuta npm run docs:routes.");
    process.exitCode = 1;
  }
} else {
  writeFileSync(destino, documento);
  console.log(`Directorio actualizado: ${pantallas.length} funciones, ${fichas.length} fichas informativas.`);
}

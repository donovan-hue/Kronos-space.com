import { readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const GRAPHICS_CHUNK = /(?:three-core|three-renderer|Lightformer|WordmarkPreview|Effects3D)[-./]/i;

/** Check real output sizes and follow only STATIC imports of the entrypoint.
 * Dynamic routes must remain available, but must not preload WebGL at login. */
export function inspectBundle(manifest, readBytes, maxBytes = 500_000) {
  const entry = Object.keys(manifest).find((key) => manifest[key].isEntry);
  if (!entry) throw new Error("No hay entrada en el manifiesto de producción");
  const visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Import ausente del manifiesto: ${key}`);
    visited.add(key);
    for (const dependency of chunk.imports || []) visit(dependency);
  }
  visit(entry);
  for (const key of visited) {
    if (GRAPHICS_CHUNK.test(manifest[key].file)) {
      throw new Error(`El arranque precarga gráficos 3D: ${manifest[key].file}`);
    }
  }
  const chunks = [...new Set(Object.values(manifest).map((item) => item.file))]
    .filter((file) => file.endsWith(".js"))
    .map((file) => ({ file, bytes: readBytes(file) }));
  if (!chunks.length) throw new Error("No hay JavaScript en el manifiesto");
  for (const chunk of chunks) {
    if (chunk.bytes > maxBytes) throw new Error(`Chunk excede ${maxBytes} bytes: ${chunk.file} (${chunk.bytes})`);
  }
  return { chunks: chunks.length, largestBytes: Math.max(...chunks.map((chunk) => chunk.bytes)), startupChunks: visited.size };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const dist = fileURLToPath(new URL("../../client/dist/", import.meta.url));
    const manifest = JSON.parse(readFileSync(join(dist, ".vite/manifest.json"), "utf8"));
    const result = inspectBundle(manifest, (file) => statSync(join(dist, file)).size);
    console.log(`Bundle OK: ${result.chunks} chunks JS; máximo ${result.largestBytes} bytes; ${result.startupChunks} chunks iniciales, sin motor 3D precargado.`);
  } catch (error) {
    console.error(`BUNDLE_ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

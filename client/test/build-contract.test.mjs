import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { inspectBundle } from "../../scripts/ci/check-client-bundle.mjs";
import normalizeZodComments, { normalizeZodCommentProse } from "../config/normalizeZodComments.js";
import viteConfigFactory from "../vite.config.js";

const manifest = () => ({
  "index.html": { isEntry: true, file: "assets/index-app.js", imports: ["react"], dynamicImports: ["graphics"] },
  react: { file: "assets/vendor-react.js" },
  graphics: { file: "assets/three-core-lazy.js" }
});

test("el presupuesto comprueba también los chunks diferidos sin precargarlos", () => {
  assert.deepEqual(inspectBundle(manifest(), () => 100), { chunks: 3, largestBytes: 100, startupChunks: 2 });
  assert.throws(() => inspectBundle(manifest(), (file) => file.includes("three-core") ? 500_001 : 100), /Chunk excede/);
});

test("un motor 3D precargado indirectamente rompe el contrato del login", () => {
  const data = manifest();
  data.react.imports = ["graphics"];
  assert.throws(() => inspectBundle(data, () => 100), /precarga gráficos 3D/);
});

test("los imports rotos y los builds sin entrada fallan, los ciclos válidos terminan", () => {
  assert.throws(() => inspectBundle({}, () => 100), /No hay entrada/);
  const data = manifest();
  data.react.imports = ["missing"];
  assert.throws(() => inspectBundle(data, () => 100), /Import ausente/);
  data.react.imports = ["index.html"];
  assert.equal(inspectBundle(data, () => 100).startupChunks, 2);
});

test("se corrige solo la prosa de Zod, conservando las anotaciones reales y el código", () => {
  const real = 'const value = /* @__PURE__ */ wrap(() => Number.MAX_VALUE);';
  const input = '// Wrapped in a `@__PURE__` IIFE\n' + real;
  assert.equal(normalizeZodCommentProse(input), '// Wrapped in a pure IIFE\n' + real);
  assert.equal(normalizeZodCommentProse(real), real);
  const plugin = normalizeZodComments();
  assert.equal(plugin.transform(input, '/project/src/util.js'), null);
  assert.equal(plugin.transform(real, '/project/node_modules/zod/v4/core/util.js'), null);
  assert.equal(plugin.transform(input, '/project/node_modules/zod/v4/core/util.js').code, '// Wrapped in a pure IIFE\n' + real);
  assert.equal(plugin.transform('/* esbuild will not drop a `@__PURE__` call */\n' + real, '/project/node_modules/zod/v4/core/regexes.js').code, '/* esbuild will not drop a pure call */\n' + real);
});


test("metadatos y PWA conservan la marca y la referencia queda fuera del código", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const pwa = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.ok(html.includes("<title>KRONOS-SPACE · Tu tiempo Tu espacio Tu dominio</title>"));
  assert.ok(html.includes('property="og:site_name" content="KRONOS-SPACE"'));
  assert.equal(pwa.name, "KRONOS-SPACE");
  assert.equal(existsSync(new URL("../src/assets/kronos-master-design.png", import.meta.url)), false);
});

test("vite.config.js añade /api en tiempo de compilación cuando VITE_API_URL llega sin sufijo", () => {
  const previous = process.env.VITE_API_URL;
  try {
    process.env.VITE_API_URL = "https://api.kronos-space.com";
    const withBareHost = viteConfigFactory({ mode: "production" });
    assert.equal(
      withBareHost.define?.["import.meta.env.VITE_API_URL"],
      JSON.stringify("https://api.kronos-space.com/api")
    );

    process.env.VITE_API_URL = "https://api.kronos-space.com/";
    const withTrailingSlash = viteConfigFactory({ mode: "production" });
    assert.equal(
      withTrailingSlash.define?.["import.meta.env.VITE_API_URL"],
      JSON.stringify("https://api.kronos-space.com/api")
    );

    delete process.env.VITE_API_URL;
    const withoutEnv = viteConfigFactory({ mode: "production" });
    assert.equal(withoutEnv.define, undefined);
  } finally {
    if (previous === undefined) delete process.env.VITE_API_URL;
    else process.env.VITE_API_URL = previous;
  }
});

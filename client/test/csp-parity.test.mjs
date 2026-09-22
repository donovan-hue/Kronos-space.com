import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PRODUCTION_CSP } from "../vite.config.js";

const root = fileURLToPath(new URL("..", import.meta.url));

function normalize(csp) {
  return csp
    .split(";")
    .map((part) => part.trim().split(/\s+/).join(" "))
    .filter(Boolean)
    .sort()
    .join("; ");
}

test("el CSP del meta (build) coincide con el de vercel.json (salvo frame-ancestors)", () => {
  const vercel = JSON.parse(readFileSync(`${root}/vercel.json`, "utf8"));
  const entry = vercel.headers.find((rule) => rule.source === "/(.*)");
  assert.ok(entry, "vercel.json debe definir cabeceras para /(.*)");
  const header = entry.headers.find((item) => item.key === "Content-Security-Policy");
  assert.ok(header, "vercel.json debe enviar Content-Security-Policy");

  const headerCsp = normalize(
    header.value.replace(/;\s*frame-ancestors[^;]*/i, "")
  );
  assert.equal(normalize(PRODUCTION_CSP), headerCsp);

  // El CSP que se publica debe seguir siendo estricto: sin 'unsafe-eval'
  // ni script inline, y con object-src 'none'.
  assert.ok(!PRODUCTION_CSP.includes("unsafe-eval"), "sin unsafe-eval");
  assert.ok(!/script-src[^;]*unsafe-inline/.test(PRODUCTION_CSP), "scripts sin inline");
  assert.ok(PRODUCTION_CSP.includes("object-src 'none'"));
  assert.ok(PRODUCTION_CSP.includes("https://accounts.google.com"), "permite GSI");
});

test("el build de producción incluye el <meta> CSP", () => {
  const htmlPath = `${root}/dist/index.html`;
  if (!existsSync(htmlPath)) {
    test.skip?.("dist/index.html no existe: corre `npm run build` primero");
    return;
  }
  const html = readFileSync(htmlPath, "utf8");
  assert.ok(
    html.includes('http-equiv="Content-Security-Policy"'),
    "dist/index.html debe incluir el meta CSP"
  );
});

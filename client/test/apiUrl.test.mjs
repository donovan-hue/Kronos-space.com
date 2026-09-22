import test from "node:test";
import assert from "node:assert";

import {
  PRODUCTION_API_URL,
  isStaticFrontendHost,
  resolveApiUrl
} from "../src/services/apiUrl.js";

/**
 * KRONOS-AUDIT-003 — origen de la API del cliente.
 *
 * Motivo real: el bundle servido por Cloudflare Pages en `kronos-space.com`
 * se compiló sin `VITE_API_URL`, quedó con `/api` relativo y ese host estático
 * responde **405 Method Not Allowed** a los POST (el login fallaba con 405).
 * La resolución debe apuntar a la API real en los hosts estáticos, sin romper
 * el desarrollo local, que sigue usando el proxy de Vite.
 */

test("VITE_API_URL configurada manda sobre todo lo demás", () => {
  assert.strictEqual(
    resolveApiUrl({
      configured: "https://api.kronos-space.com/api",
      hostname: "kronos-space.com"
    }),
    "https://api.kronos-space.com/api"
  );

  assert.strictEqual(
    resolveApiUrl({
      configured: "https://otra-api.example.com/api/",
      hostname: "kronos-space.com"
    }),
    "https://otra-api.example.com/api",
    "se elimina la barra final"
  );
});

test("el dominio de producción sin variable usa la API real (no /api relativo)", () => {
  for (const hostname of [
    "kronos-space.com",
    "www.kronos-space.com"
  ]) {
    assert.strictEqual(
      resolveApiUrl({ configured: "", hostname }),
      PRODUCTION_API_URL,
      `${hostname} no puede proxear /api`
    );
  }
});

test("la app de Vercel también resuelve a la API real", () => {
  assert.strictEqual(
    resolveApiUrl({
      configured: "",
      hostname: "kronos-social-ai-client.vercel.app"
    }),
    PRODUCTION_API_URL
  );
});

test("el desarrollo local conserva /api relativo y su proxy", () => {
  for (const hostname of [
    "localhost",
    "127.0.0.1",
    "",
    "3000-abc123.e2b.app"
  ]) {
    assert.strictEqual(
      resolveApiUrl({ configured: "", hostname }),
      "/api",
      `${hostname || "(sin host)"} debe seguir usando el proxy de Vite`
    );
  }
});

test("un vercel.app genérico NO hereda la API de producción (allowlist explícita)", () => {
  assert.strictEqual(
    resolveApiUrl({ configured: "", hostname: "otro-proyecto-abc123.vercel.app" }),
    "/api",
    "los previews deben definir VITE_API_URL"
  );
  assert.strictEqual(isStaticFrontendHost("otro-proyecto-abc123.vercel.app"), false);
  assert.strictEqual(
    isStaticFrontendHost("kronos-social-ai-client.vercel.app"),
    true,
    "el alias conocido del proyecto sí resuelve a la API real"
  );
});

test("isStaticFrontendHost distingue hosts estáticos de locales", () => {
  assert.strictEqual(isStaticFrontendHost("kronos-space.com"), true);
  assert.strictEqual(isStaticFrontendHost("KRONOS-SPACE.COM"), true);
  assert.strictEqual(isStaticFrontendHost("www.kronos-space.com"), true);
  assert.strictEqual(isStaticFrontendHost("localhost"), false);
  assert.strictEqual(isStaticFrontendHost(""), false);
  assert.strictEqual(
    isStaticFrontendHost("kronos-space.com.evil.example"),
    false,
    "no debe confundirse un sufijo parecido con el dominio real"
  );
});

import test from "node:test";
import assert from "node:assert";

import {
  CANONICAL_WEB_ORIGIN,
  canonicalRedirectUrl,
  publicAppUrl
} from "../src/services/publicUrl.js";

test("www converge al dominio oficial conservando ruta, query y hash", () => {
  assert.strictEqual(
    canonicalRedirectUrl({
      protocol: "https:",
      hostname: "www.kronos-space.com",
      pathname: "/post/123",
      search: "?from=share",
      hash: "#comments"
    }),
    "https://kronos-space.com/post/123?from=share#comments"
  );
});

test("el alias estable de Vercel converge al dominio oficial", () => {
  assert.strictEqual(
    canonicalRedirectUrl({
      protocol: "https:",
      hostname: "kronos-social-ai-client.vercel.app",
      pathname: "/login"
    }),
    "https://kronos-space.com/login"
  );
});

test("producción canónica, previews y desarrollo no se redirigen", () => {
  for (const location of [
    { protocol: "https:", hostname: "kronos-space.com", pathname: "/" },
    { protocol: "https:", hostname: "preview-abc.vercel.app", pathname: "/" },
    { protocol: "http:", hostname: "localhost", pathname: "/" },
    { protocol: "https:", hostname: "3000-example.e2b.app", pathname: "/" }
  ]) {
    assert.strictEqual(canonicalRedirectUrl(location), null);
  }
});

test("http en el dominio oficial se fuerza a https", () => {
  assert.strictEqual(
    canonicalRedirectUrl({
      protocol: "http:",
      hostname: "kronos-space.com",
      pathname: "/settings"
    }),
    "https://kronos-space.com/settings"
  );
});

test("todos los enlaces compartibles usan un único origen", () => {
  assert.strictEqual(CANONICAL_WEB_ORIGIN, "https://kronos-space.com");
  assert.strictEqual(
    publicAppUrl("/post/abc"),
    "https://kronos-space.com/post/abc"
  );
});

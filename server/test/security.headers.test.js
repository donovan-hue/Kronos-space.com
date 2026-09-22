const test = require("node:test");
const assert = require("node:assert/strict");

const previousSecret = process.env.JWT_SECRET;
const previousClientUrl = process.env.CLIENT_URL;
process.env.JWT_SECRET = "security-headers-test-secret";
process.env.CLIENT_URL = "https://kronos-space.com,https://www.kronos-space.com";

const { app } = require("../src/server");
const { parseCursor, withCursorFilter, nextCursorOf } = require("../src/modules/posts/posts.routes");

let server;
let base;

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
  if (previousClientUrl === undefined) delete process.env.CLIENT_URL;
  else process.env.CLIENT_URL = previousClientUrl;
});

test("helmet: cabeceras de seguridad presentes y sin x-powered-by", async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.ok(response.headers.get("x-frame-options"), "debe enviar x-frame-options");
  assert.ok(response.headers.get("referrer-policy"), "debe enviar referrer-policy");
  assert.ok(response.headers.get("x-request-id"), "debe enviar x-request-id de trazabilidad");
});

test("CORS: refleja orígenes permitidos y no refleja otros", async () => {
  const allowed = await fetch(`${base}/api/health`, {
    headers: { Origin: "https://kronos-space.com" }
  });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://kronos-space.com");

  const denied = await fetch(`${base}/api/health`, {
    headers: { Origin: "https://evil.example.com" }
  });
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("cursor: parsea bordes válidos y rechaza inválidos", () => {
  const id = "507f1f77bcf86cd799439011";
  const parsed = parseCursor(`2026-01-02T03:04:05.678Z_${id}`);
  assert.equal(parsed.id, id);
  assert.ok(parsed.date instanceof Date);

  assert.equal(parseCursor(""), null);
  assert.equal(parseCursor(undefined), null);
  assert.ok(parseCursor("basura").error);
  assert.ok(parseCursor(`no-fecha_${id}`).error);
  assert.ok(parseCursor("2026-01-02T03:04:05.678Z_noid").error);
});

test("cursor: compone filtro $and y nextCursor del último ítem", () => {
  const id = "507f1f77bcf86cd799439011";
  const cursor = parseCursor(`2026-01-02T03:04:05.678Z_${id}`);
  const filtered = withCursorFilter({ author: "x" }, cursor);
  assert.ok(Array.isArray(filtered.$and));
  assert.equal(filtered.$and[0].author, "x");
  assert.ok(Array.isArray(filtered.$and[1].$or));

  assert.deepEqual(withCursorFilter({ author: "x" }, null), { author: "x" });

  const posts = [
    { _id: "507f1f77bcf86cd799439012", createdAt: new Date("2026-01-03T00:00:00.000Z") },
    { _id: id, createdAt: new Date("2026-01-02T03:04:05.678Z") }
  ];
  assert.equal(nextCursorOf(posts), `2026-01-02T03:04:05.678Z_${id}`);
  assert.equal(nextCursorOf([]), null);
});

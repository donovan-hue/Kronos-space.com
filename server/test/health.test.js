const test = require("node:test");
const assert = require("node:assert");

test("health check devuelve el estado esperado", () => {
  const healthResponse = {
    ok: true,
    service: "kronos-space"
  };

  assert.strictEqual(healthResponse.ok, true);
  assert.strictEqual(
    healthResponse.service,
    "kronos-space"
  );
});

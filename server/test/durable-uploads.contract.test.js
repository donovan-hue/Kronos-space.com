const test = require("node:test");
const assert = require("node:assert/strict");

const { SAFE_NAME, filenameOf } = require("../src/config/durableUploads");

test("solo se persisten y sirven nombres generados por el almacenamiento", () => {
  assert.equal(filenameOf("/uploads/media/171000-abc123def456.jpg"), "media/171000-abc123def456.jpg");
  assert.equal(SAFE_NAME.test("media/171000-abc123def456.jpg"), true);
  assert.equal(SAFE_NAME.test("avatars/171000-abc123def456.png"), true);
  assert.equal(SAFE_NAME.test("covers/171000-abc123def456.webp"), true);
  assert.equal(SAFE_NAME.test("../etc/passwd"), false);
  assert.equal(SAFE_NAME.test("media/../../server.js"), false);
  assert.equal(SAFE_NAME.test("media/not-our-name.jpg"), false);
  assert.equal(SAFE_NAME.test("media/171000-abc123def456.html"), false);
});

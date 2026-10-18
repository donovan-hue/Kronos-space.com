const test = require("node:test");
const assert = require("node:assert/strict");
const { urlConPrefijoApi } = require("../src/http/restoreApiPrefix");

test("una petición de login sin /api recupera el prefijo y conserva la query", () => {
  assert.equal(urlConPrefijoApi("/auth/login"), "/api/auth/login");
  assert.equal(
    urlConPrefijoApi("/auth/google/config?origen=login"),
    "/api/auth/google/config?origen=login"
  );
  assert.equal(urlConPrefijoApi("/posts/feed"), "/api/posts/feed");
  assert.equal(urlConPrefijoApi("/uploads/audio"), "/api/uploads/audio");
});

test("lo que ya es correcto, o no es una ruta de API, no se reescribe", () => {
  assert.equal(urlConPrefijoApi("/api/auth/login"), "/api/auth/login");
  assert.equal(urlConPrefijoApi("/health"), "/health");
  assert.equal(urlConPrefijoApi("/api/health"), "/api/health");
  assert.equal(urlConPrefijoApi("/uploads/avatars/a.png"), "/uploads/avatars/a.png");
  assert.equal(urlConPrefijoApi("/uploads/media/foto.jpg"), "/uploads/media/foto.jpg");
  assert.equal(urlConPrefijoApi("/.well-known/webfinger"), "/.well-known/webfinger");
  assert.equal(urlConPrefijoApi("/socket.io/?EIO=4"), "/socket.io/?EIO=4");
  assert.equal(urlConPrefijoApi("/authentication"), "/authentication");
});

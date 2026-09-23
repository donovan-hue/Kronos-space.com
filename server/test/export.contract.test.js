const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const exportRoutes = require("../src/modules/export/export.routes");
const { exportWindow } = exportRoutes;

function routePaths() {
  return (exportRoutes.stack || []).map((layer) => layer.route?.path).filter(Boolean);
}

test("exportación: la ventana semanal vive en la fecha guardada, no en memoria", () => {
  assert.equal(exportWindow(null).eligible, true);
  assert.equal(exportWindow(null).canDownload, false);
  const recent = new Date();
  assert.equal(exportWindow(recent).eligible, false);
  assert.equal(exportWindow(recent).canDownload, true);
  const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  assert.equal(exportWindow(old).eligible, true);
  assert.equal(exportWindow(old).canDownload, false);
});

test("exportación: las rutas existen y están protegidas con autenticación", () => {
  const paths = routePaths();
  assert.ok(paths.includes("/status"), "debe incluir GET /status");
  assert.ok(paths.includes("/request"), "debe incluir POST /request");
  assert.ok(paths.includes("/download"), "debe incluir GET /download");

  for (const layer of exportRoutes.stack.filter((item) => item.route)) {
    assert.ok(layer.route.stack.length >= 3, `la ruta ${layer.route.path} debe exigir auth y usuario`);
  }
});

test("exportación: las rutas devuelven 401 sin token", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/export", exportRoutes);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const statusRes = await fetch(`${baseUrl}/api/export/status`);
    assert.equal(statusRes.status, 401);

    const reqRes = await fetch(`${baseUrl}/api/export/request`, { method: "POST" });
    assert.equal(reqRes.status, 401);

    const dlRes = await fetch(`${baseUrl}/api/export/download`);
    assert.equal(dlRes.status, 401);
  } finally {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});


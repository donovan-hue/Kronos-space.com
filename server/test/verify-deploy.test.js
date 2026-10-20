const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = path.join(__dirname, "..", "..", "scripts", "verify-deploy.sh");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function createMockApiServer() {
  return http.createServer((req, res) => {
    const origin = req.headers.origin || "";
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "authorization,content-type");
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/health" || req.url === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        service: "kronos-space",
        database: "connected",
        environment: "production",
        environmentDeclared: true,
        autoIndex: false,
        build: {
          commit: "ffed15cd5f60299290f1ff219b5ee3ae9abc07b7",
          branch: "main",
          serviceName: "kronos-api-test",
          traceable: true
        }
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });
}

function createMockFrontendServer(bundlesByAttempt) {
  let indexRequests = 0;
  let currentBundle = bundlesByAttempt[0];

  return http.createServer((req, res) => {
    res.setHeader("cf-ray", "test-ray-id");
    res.setHeader("server", "cloudflare");

    if (req.url === "/") {
      const idx = Math.min(indexRequests, bundlesByAttempt.length - 1);
      currentBundle = bundlesByAttempt[idx];
      indexRequests += 1;
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/index-test.js"></script></body></html>');
      return;
    }

    if (req.url === "/assets/index-test.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(currentBundle);
      return;
    }

    res.writeHead(404);
    res.end();
  });
}

test("verify-deploy absorbe la propagación del CDN cuando el segundo intento ya sirve el bundle corregido", async () => {
  const apiServer = createMockApiServer();
  const feServer = createMockFrontendServer([
    'const A="https://api.kronos-space.com",B="https://api.kronos-space.com/api";',
    'const B="https://api.kronos-space.com/api";'
  ]);

  const base = await listen(apiServer);
  const frontend = await listen(feServer);

  try {
    const { stdout } = await execFileAsync("bash", [SCRIPT_PATH], {
      env: {
        ...process.env,
        BASE: base,
        FRONTEND: frontend,
        ORIGINS: "https://kronos-space.com",
        HEALTH_ATTEMPTS: "1",
        HEALTH_DELAY: "0",
        FRONTEND_ATTEMPTS: "3",
        FRONTEND_DELAY: "0"
      }
    });

    assert.match(stdout, /intento 1\/3: principal aún propaga el nuevo bundle/);
    assert.match(stdout, /el frontend principal quedó propagado al intento 2\/3/);
    assert.match(stdout, /RESULTADO: despliegue correcto/);
  } finally {
    await close(apiServer);
    await close(feServer);
  }
});

test("verify-deploy falla en rojo cuando el bundle conserva la API sin /api tras agotar los reintentos", async () => {
  const apiServer = createMockApiServer();
  const feServer = createMockFrontendServer([
    'const A="https://api.kronos-space.com",B="https://api.kronos-space.com/api";'
  ]);

  const base = await listen(apiServer);
  const frontend = await listen(feServer);

  try {
    await assert.rejects(
      execFileAsync("bash", [SCRIPT_PATH], {
        env: {
          ...process.env,
          BASE: base,
          FRONTEND: frontend,
          ORIGINS: "https://kronos-space.com",
          HEALTH_ATTEMPTS: "1",
          HEALTH_DELAY: "0",
          FRONTEND_ATTEMPTS: "2",
          FRONTEND_DELAY: "0"
        }
      }),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stdout, /FALLA principal: el bundle incluye la API sin el sufijo \/api/);
        return true;
      }
    );
  } finally {
    await close(apiServer);
    await close(feServer);
  }
});

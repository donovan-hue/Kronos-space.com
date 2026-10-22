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

function createMockFrontendServer(bundlesByAttempt, options = {}) {
  let indexRequests = 0;
  let currentBundle = bundlesByAttempt[0];

  return http.createServer((req, res) => {
    res.setHeader("cf-ray", "test-ray-id");
    res.setHeader("server", "cloudflare");

    if (req.url === "/" && options.redirect) {
      res.writeHead(302, { Location: options.redirect });
      res.end();
      return;
    }
    if (req.url === "/" && options.status) {
      res.writeHead(options.status);
      res.end("Protected preview");
      return;
    }
    if (req.url === "/") {
      const idx = Math.min(indexRequests, bundlesByAttempt.length - 1);
      currentBundle = bundlesByAttempt[idx];
      indexRequests += 1;
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/index-test.js"></script></body></html>');
      return;
    }

    if (req.url === "/assets/index-test.js") {
      res.writeHead(options.bundleStatus || 200, { "Content-Type": "application/javascript" });
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


async function runPreview(base, frontend) {
  return execFileAsync("bash", [SCRIPT_PATH], {
    env: { ...process.env, BASE: base, FRONTEND: frontend, ORIGINS: frontend,
      REQUIRE_FRONTEND_ORIGIN: "1", HEALTH_ATTEMPTS: "1", HEALTH_DELAY: "0",
      CORS_ATTEMPTS: "1", CORS_DELAY: "0",
      FRONTEND_ATTEMPTS: "1", FRONTEND_DELAY: "0" }
  });
}

test("verify-deploy: una preview sana comprueba su propio frontend y su propio CORS", async () => {
  const api = createMockApiServer();
  const frontend = createMockFrontendServer(['const API="https://api.kronos-space.com/api";']);
  const base = await listen(api);
  const url = await listen(frontend);
  try {
    const { stdout } = await runPreview(base, url);
    assert.ok(stdout.includes(`GET /api/health permite ${url}`));
    assert.ok(stdout.includes(`preflight OPTIONS /api/auth/login permite ${url}`));
    assert.ok(stdout.includes(`== principal: ${url}`));
    assert.match(stdout, /RESULTADO: despliegue correcto/);
  } finally {
    await close(api);
    await close(frontend);
  }
});

for (const status of [401, 403]) {
  test(`verify-deploy: preview protegida ${status} no pasa ni evade autenticación`, async () => {
    const api = createMockApiServer();
    const frontend = createMockFrontendServer([""], { status });
    const base = await listen(api);
    const url = await listen(frontend);
    try {
      await assert.rejects(runPreview(base, url), (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /preview protegida: no se evade su autenticación/);
        return true;
      });
    } finally {
      await close(api);
      await close(frontend);
    }
  });
}

test("verify-deploy: una preview que redirige a otro frontend no se declara sana", async () => {
  const api = createMockApiServer();
  const other = createMockFrontendServer(['const API="https://api.kronos-space.com/api";']);
  const base = await listen(api);
  const otherUrl = await listen(other);
  const frontend = createMockFrontendServer([""], { redirect: otherUrl });
  const url = await listen(frontend);
  try {
    await assert.rejects(runPreview(base, url), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /redirige a otro origen; no se verificó la preview solicitada/);
      return true;
    });
  } finally {
    await close(api);
    await close(other);
    await close(frontend);
  }
});

for (const [name, bundle, options, expected] of [
  ["404", 'const API="https://api.kronos-space.com/api";', { bundleStatus: 404 }, /bundle JS → HTTP 404/],
  ["HTML", '<!doctype html><html>https://api.kronos-space.com/api</html>', {}, /HTML en lugar de JavaScript/]
]) {
  test(`verify-deploy: un bundle ${name} no puede producir un falso verde`, async () => {
    const api = createMockApiServer();
    const frontend = createMockFrontendServer([bundle], options);
    const base = await listen(api);
    const url = await listen(frontend);
    try {
      await assert.rejects(runPreview(base, url), (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, expected);
        return true;
      });
    } finally {
      await close(api);
      await close(frontend);
    }
  });
}

test("CORS productivo: normaliza punto/barra final y acepta ambos dominios canónicos sin abrir terceros", () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-verify-deploy";
  const { parseAllowedOrigins, isAllowedCorsOrigin } = require("../src/server");
  const parsed = parseAllowedOrigins('"https://kronos-space.com/, https://www.kronos-space.com."');
  assert.deepEqual(parsed, ["https://kronos-space.com", "https://www.kronos-space.com"]);
  assert.equal(isAllowedCorsOrigin("https://www.kronos-space.com", ["https://kronos-space.com"], {}), true);
  assert.equal(isAllowedCorsOrigin("https://kronos-space.com", ["https://www.kronos-space.com"], {}), true);
  assert.equal(
    isAllowedCorsOrigin("https://kronos-space-a1b2-oficialkronosspace-1215.vercel.app", ["https://kronos-space.com"], {}),
    true
  );
  assert.equal(isAllowedCorsOrigin("https://kronos-space.com.evil.example", ["https://kronos-space.com"], {}), false);
  assert.equal(isAllowedCorsOrigin("http://kronos-space.com", ["https://kronos-space.com"], {}), false);
});

test("verify-deploy absorbe el redespliegue de Render cuando CORS aparece en el segundo intento", async () => {
  let healthCorsCalls = 0;
  const api = http.createServer((req, res) => {
    const origin = req.headers.origin || "";
    if (origin) {
      healthCorsCalls += 1;
      if (healthCorsCalls >= 3) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "authorization,content-type");
      }
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      service: "kronos-space",
      database: "connected",
      environment: "production",
      environmentDeclared: true,
      autoIndex: false,
      build: { commit: "ffed15cd5f60299290f1ff219b5ee3ae9abc07b7", branch: "main", serviceName: "kronos-api-test", traceable: true }
    }));
  });
  const fe = createMockFrontendServer(['const B="https://api.kronos-space.com/api";']);
  const base = await listen(api);
  const frontend = await listen(fe);
  try {
    const { stdout } = await execFileAsync("bash", [SCRIPT_PATH], {
      env: {
        ...process.env,
        BASE: base,
        FRONTEND: frontend,
        ORIGINS: "https://www.kronos-space.com",
        HEALTH_ATTEMPTS: "1",
        HEALTH_DELAY: "0",
        CORS_ATTEMPTS: "3",
        CORS_DELAY: "0",
        FRONTEND_ATTEMPTS: "1",
        FRONTEND_DELAY: "0"
      }
    });
    assert.match(stdout, /intento 1\/3: el backend aún propaga CORS/);
    assert.match(stdout, /CORS del backend quedó propagado al intento 2\/3/);
    assert.match(stdout, /RESULTADO: despliegue correcto/);
  } finally {
    await close(api);
    await close(fe);
  }
});


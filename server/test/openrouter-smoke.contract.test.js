const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawn } = require("node:child_process");

/**
 * Contrato de `scripts/openrouter-smoke.js`.
 *
 * Levanta un servidor local que responde con las MISMAS FORMAS que OpenRouter
 * (catálogo, capacidades, /key, chat completions, images/generations) y ejecuta
 * la prueba de humo contra él para comprobar tres cosas:
 *
 *   1. que la prueba lee bien las respuestas reales del proveedor;
 *   2. que detecta un proveedor roto (clave rechazada, JSON con markdown) en
 *      lugar de aprobar por defecto;
 *   3. que NUNCA aprueba cuando no apunta a openrouter.ai.
 *
 * El servidor local sustituye al proveedor solo para probar la herramienta.
 * La verificación real del proveedor se hace con:
 *   node scripts/openrouter-smoke.js        (con OPENROUTER_API_KEY real)
 * y en el workflow "Kronos OpenRouter Smoke".
 */

const REPO_ROOT = path.join(__dirname, "..", "..");
const SMOKE_PATH = path.join(REPO_ROOT, "scripts", "openrouter-smoke.js");
const IMAGE_MODEL = "google/gemini-2.5-flash-image";
const SCRIPT_MODEL = "openrouter/free";

const SCRIPT_PAYLOAD = {
  title: "La puerta luminosa",
  logline: "Un vigilante encuentra una puerta que no estaba ahí.",
  narrative: {
    beginning: "Ronda nocturna sin incidentes.",
    middle: "Una puerta de luz aparece en la azotea.",
    ending: "La cruza y la ciudad queda en silencio."
  },
  scenes: [
    {
      number: 1,
      heading: "EXT. AZOTEA - NOCHE",
      action: "El vigilante barre la azotea con la linterna.",
      characters: ["Vigilante"],
      dialogue: [
        {
          character: "Vigilante",
          text: "Aquí no había nada ayer.",
          direction: "susurrando"
        }
      ],
      directions: "Luz azulada.",
      transition: "CORTE A"
    }
  ],
  closing: "Continúa."
};

/** PNG real de 2x2 píxeles, con CRC e IDAT comprimidos de verdad. */
function realPng() {
  const raw = Buffer.alloc(2 * (4 * 2 + 1));

  for (let row = 0; row < 2; row += 1) {
    const offset = row * (4 * 2 + 1);
    raw[offset] = 0;
    for (let column = 0; column < 2; column += 1) {
      raw[offset + 1 + column * 4] = 16;
      raw[offset + 2 + column * 4] = 32;
      raw[offset + 3 + column * 4] = 48;
      raw[offset + 4 + column * 4] = 255;
    }
  }

  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);

    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function startGateway({ mode = "healthy" } = {}) {
  const seen = { chat: [], images: [], key: 0, models: 0 };

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const send = (status, payload) => {
      const body = JSON.stringify(payload);
      response.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      });
      response.end(body);
    };
    const readBody = (callback) => {
      let raw = "";
      request.on("data", (chunk) => {
        raw += chunk;
      });
      request.on("end", () => {
        try {
          callback(raw ? JSON.parse(raw) : null);
        } catch {
          callback(null);
        }
      });
    };

    if (request.method === "GET" && url.pathname === "/v1/models") {
      seen.models += 1;

      return send(200, {
        data: [
          { id: IMAGE_MODEL },
          { id: SCRIPT_MODEL },
          { id: "openai/gpt-6-luna" }
        ]
      });
    }

    if (
      request.method === "GET" &&
      url.pathname === `/v1/models/${encodeURIComponent(SCRIPT_MODEL)}/endpoints`
    ) {
      return send(200, { data: { id: SCRIPT_MODEL, endpoints: [] } });
    }

    if (
      request.method === "GET" &&
      url.pathname === `/v1/images/models/${encodeURIComponent(IMAGE_MODEL)}/endpoints`
    ) {
      // Igual que el proveedor real: aspect_ratio y n, nunca size.
      return send(200, {
        data: {
          id: IMAGE_MODEL,
          endpoints: [
            {
              provider_slug: "google-ai-studio",
              supported_parameters: {
                aspect_ratio: {
                  type: "enum",
                  values: ["1:1", "3:4", "4:3", "9:16", "16:9"]
                },
                n: { type: "range", min: 1, max: 1 },
                input_references: { type: "range", min: 0, max: 3 }
              }
            }
          ]
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/v1/key") {
      seen.key += 1;

      if (mode === "unauthorized") {
        return send(401, { error: { message: "No auth credentials found" } });
      }

      return send(200, {
        data: {
          label: "clave-de-prueba",
          limit: null,
          limit_remaining: null,
          usage: 1.23,
          usage_daily: 0.01,
          is_free_tier: false,
          free_model_daily_requests: { used: 3, limit: 50, remaining: 47 }
        }
      });
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      return readBody((body) => {
        seen.chat.push(body);

        if (mode === "broken-json") {
          return send(200, {
            model: "proveedor/texto",
            choices: [
              {
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: "```json\n" + JSON.stringify(SCRIPT_PAYLOAD) + "\n```"
                }
              }
            ],
            usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10, cost: 0 }
          });
        }

        return send(200, {
          model: "proveedor/gratuito-real",
          choices: [
            {
              finish_reason: "stop",
              message: { role: "assistant", content: JSON.stringify(SCRIPT_PAYLOAD) }
            }
          ],
          usage: { prompt_tokens: 12, completion_tokens: 240, total_tokens: 252, cost: 0 }
        });
      });
    }

    if (request.method === "POST" && url.pathname === "/v1/images/generations") {
      return readBody((body) => {
        seen.images.push(body);

        return send(200, {
          created: Math.floor(Date.now() / 1000),
          data: [{ b64_json: realPng().toString("base64"), media_type: "image/png" }],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 1290,
            total_tokens: 1290,
            cost: 0.039
          }
        });
      });
    }

    return send(404, { error: { message: `Ruta no emulada: ${request.method} ${url.pathname}` } });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        seen,
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

function runSmoke({ baseUrl, args = [], env = {} }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SMOKE_PATH, ...args], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        OPENROUTER_BASE_URL: baseUrl,
        OPENROUTER_MODEL: SCRIPT_MODEL,
        OPENROUTER_IMAGE_MODEL: IMAGE_MODEL,
        OPENROUTER_API_KEY: "",
        BASE: "",
        SMOKE_IMAGE: "",
        SMOKE_TIMEOUT_MS: "20000",
        ...env
      }
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      let report = null;

      try {
        report = JSON.parse(stdout);
      } catch {
        report = null;
      }

      resolve({ code, stdout, stderr, report });
    });
  });
}

function findResult(report, id) {
  return report.results.find((item) => item.id === id);
}

test("la prueba de humo lee las respuestas reales del proveedor", async (t) => {
  const gateway = await startGateway();

  t.after(() => gateway.close());

  const run = await runSmoke({
    baseUrl: gateway.baseUrl,
    args: ["--json"],
    env: { OPENROUTER_API_KEY: "clave-de-prueba-no-real", SMOKE_IMAGE: "1" }
  });

  assert.ok(run.report, `salida JSON esperada. stderr: ${run.stderr}`);

  // El proveedor no es openrouter.ai: la herramienta tiene que decirlo y
  // terminar en fallo aunque todo lo demás funcione.
  assert.equal(run.code, 1);
  assert.deepEqual(
    run.report.results.filter((item) => item.status === "FALLA").map((item) => item.id),
    ["config.baseUrl"]
  );

  for (const id of [
    "catalog.reachable",
    "catalog.imageModel",
    "catalog.scriptModel",
    "catalog.imageParameters",
    "config.script",
    "config.image",
    "key.auth",
    "key.freeQuota",
    "script.provider",
    "script.parse",
    "script.format",
    "image.provider",
    "image.mime"
  ]) {
    assert.equal(findResult(run.report, id)?.status, "OK", `${id} debería ser OK`);
  }

  // La petición de guion salió con la forma que exige el backend.
  assert.equal(gateway.seen.chat.length, 1);
  assert.equal(gateway.seen.chat[0].model, SCRIPT_MODEL);
  assert.deepEqual(gateway.seen.chat[0].response_format, { type: "json_object" });
  assert.equal(gateway.seen.chat[0].messages[0].role, "system");
  assert.match(gateway.seen.chat[0].messages[1].content, /Solicitud: /);

  // Y la de imagen no mandó `size` a un modelo que no lo declara.
  assert.equal(gateway.seen.images.length, 1);
  assert.equal(gateway.seen.images[0].size, undefined);
  assert.equal(gateway.seen.images[0].aspect_ratio, "1:1");
  assert.equal(gateway.seen.images[0].model, IMAGE_MODEL);
  assert.match(run.report.results.find((item) => item.id === "catalog.imageFrame").detail, /aspect_ratio/);
});

test("una clave rechazada no se convierte en un aprobado", async (t) => {
  const gateway = await startGateway({ mode: "unauthorized" });

  t.after(() => gateway.close());

  const run = await runSmoke({
    baseUrl: gateway.baseUrl,
    args: ["--json"],
    env: { OPENROUTER_API_KEY: "clave-revocada" }
  });

  assert.equal(run.code, 1);
  assert.equal(findResult(run.report, "key.auth").status, "FALLA");
  assert.match(findResult(run.report, "key.auth").detail, /clave inválida o revocada/);
  assert.equal(gateway.seen.chat.length, 0, "sin credencial válida no se piden generaciones");
  assert.equal(gateway.seen.images.length, 0);
});

test("un JSON con markdown del proveedor se detecta como respuesta inválida", async (t) => {
  const gateway = await startGateway({ mode: "broken-json" });

  t.after(() => gateway.close());

  const run = await runSmoke({
    baseUrl: gateway.baseUrl,
    args: ["--json"],
    env: { OPENROUTER_API_KEY: "clave-de-prueba-no-real" }
  });

  assert.equal(run.code, 1);
  assert.equal(findResult(run.report, "script.provider").status, "OK");
  assert.equal(findResult(run.report, "script.parse").status, "FALLA");
  assert.match(
    findResult(run.report, "script.parse").detail,
    /inicio de la respuesta/,
    "el fallo debe mostrar el principio de la respuesta recibida"
  );
});

test("sin clave y sin backend la prueba nunca aprueba", async (t) => {
  const gateway = await startGateway();

  t.after(() => gateway.close());

  const run = await runSmoke({ baseUrl: gateway.baseUrl, args: ["--json"] });

  // 3 = "no ejecutado"; aquí además falla la comprobación de proveedor oficial
  // (el gateway es local), así que el resultado es 1. Lo que no puede pasar
  // nunca es un 0: sin credenciales no hay verificación que aprobar.
  assert.notEqual(run.code, 0, "no verificar nada nunca puede salir con 0");
  assert.equal(run.report.ok, false);
  assert.equal(run.report.live, false);
  assert.equal(findResult(run.report, "live").status, "OMITIDO");
  assert.match(findResult(run.report, "live").detail, /OPENROUTER_API_KEY/);
  assert.equal(gateway.seen.key, 0);
  assert.equal(gateway.seen.chat.length, 0);
  assert.equal(gateway.seen.images.length, 0);
});

test("--deployed exige BASE y no finge una verificación", () => {
  const result = require("node:child_process").spawnSync(
    process.execPath,
    [SMOKE_PATH, "--deployed"],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, BASE: "", OPENROUTER_API_KEY: "" },
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /--deployed exige BASE/);
});

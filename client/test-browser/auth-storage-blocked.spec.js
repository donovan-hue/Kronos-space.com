import { test, expect, chromium } from "@playwright/test";

/**
 * KRONOS-AUDIT-002 (almacenamiento bloqueado) — la aplicación en un Chromium
 * real cuando el navegador deniega el almacén de la sesión.
 *
 * Cubre dos formas de bloqueo:
 *  - Real: Chromium arrancado con `--disable-local-storage`, que deja
 *    `localStorage === null` (acceso denegado por el navegador).
 *  - De navegador: `SecurityError` al leer/borrar y `QuotaExceededError` al
 *    escribir, con la misma forma que produce Chromium en modo privado.
 *
 * La red se sustituye por fixtures deterministas de `/api/**` (el contrato es
 * el del backend) para medir el comportamiento del cliente y no la
 * disponibilidad de MongoDB.
 *
 * Requisitos: servidor de desarrollo en KRONOS_TEST_URL (por defecto
 * http://localhost:3000).
 */

const BASE = process.env.KRONOS_TEST_URL || "http://localhost:3000";
const ID = "507f1f77bcf86cd799439011";
const USER = {
  _id: ID,
  id: ID,
  username: "audit",
  email: "audit@kronos.space",
  displayName: "Audit",
  avatar: "",
  cover: "",
  bio: "",
  role: "user",
};

const SAFE_ARGS = ["--no-sandbox", "--no-zygote", "--disable-dev-shm-usage"];

const jwt = (seconds, claims = {}) =>
  `e30.${Buffer.from(JSON.stringify({ id: ID, exp: Math.floor(Date.now() / 1000) + seconds, ...claims })).toString("base64url")}.firma-de-prueba`;

function installApiFixtures(page) {
  const calls = [];
  page.__calls = calls;

  page.route("**/api/**", (route) => {
    const url = route.request().url();
    calls.push(`${route.request().method()} ${url.replace(BASE, "")}`);

    if (url.includes("/auth/login")) {
      return route.fulfill({
        json: {
          token: jwt(3600),
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          refreshToken: "refresh-inicial",
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          user: USER,
        },
      });
    }
    if (url.includes("/auth/refresh")) {
      return route.fulfill({
        json: {
          token: jwt(3600, { tokenId: "rotado" }),
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          refreshToken: "refresh-rotado",
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      });
    }
    if (url.includes("/auth/logout")) return route.fulfill({ json: { ok: true } });
    if (url.includes("/auth/me")) return route.fulfill({ json: { user: USER } });
    if (url.includes("/auth/google/config")) return route.fulfill({ json: { enabled: false } });
    if (url.includes("/auth/sessions")) return route.fulfill({ json: { sessions: [] } });

    return route.fulfill({
      json: { user: USER, posts: [], flags: {}, stories: [], circles: [], orbits: [], items: [], users: [], sessions: [], notifications: [], unreadCount: 0 },
    });
  });

  page.route("**/socket.io/**", (route) =>
    route.fulfill({ body: '0{"sid":"audit","upgrades":[],"pingInterval":1000000,"pingTimeout":1000000}' })
  );
}

/**
 * Inyecta el bloqueo antes de que arranque la aplicación. `mode` describe el
 * fallo con la forma del navegador:
 *  - "denegado": el acceso al almacén lanza SecurityError (ambos, o local).
 *  - "escritura": setItem lanza QuotaExceededError.
 *  - "borrado": removeItem lanza SecurityError.
 */
async function blockStorage(page, mode, target = "ambos") {
  await page.addInitScript(({ mode, target }) => {
    const deny = () => { throw new DOMException("Access is denied for this document.", "SecurityError"); };
    const names = target === "ambos" ? ["localStorage", "sessionStorage"] : [target];

    if (mode === "denegado") {
      for (const name of names) Object.defineProperty(window, name, { configurable: true, get: deny });
      return;
    }
    if (mode === "escritura") {
      Storage.prototype.setItem = () => { throw new DOMException("The quota has been exceeded.", "QuotaExceededError"); };
      return;
    }
    if (mode === "borrado") {
      Storage.prototype.removeItem = () => { throw new DOMException("Access is denied for this document.", "SecurityError"); };
    }
  }, { mode, target });
}

/** Sesión preexistente, escrita antes de que el script de bloqueo la impida. */
async function seedSession(page, { token, refresh = "", remember = true }) {
  const { exp } = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  await page.addInitScript((data) => {
    // `addInitScript` se ejecuta en CADA documento: sin esta marca, una
    // recarga volvería a inyectar la sesión y la prueba no podría comprobar
    // que el logout la eliminó de verdad.
    if (localStorage.getItem("kronos_test_seeded")) return;
    localStorage.setItem("kronos_test_seeded", "1");
    const store = data.remember ? localStorage : sessionStorage;
    store.setItem("kronos_token", data.token);
    store.setItem("kronos_user", JSON.stringify({ _id: "507f1f77bcf86cd799439011", id: "507f1f77bcf86cd799439011", username: "audit", displayName: "Audit" }));
    store.setItem("kronos_session_remember", String(data.remember));
    store.setItem("kronos_session_expires_at", data.expiresAt);
    if (data.refresh) {
      store.setItem("kronos_refresh_token", data.refresh);
      store.setItem("kronos_refresh_expires_at", data.refreshExpiresAt);
    }
  }, {
    token,
    refresh,
    remember,
    expiresAt: new Date(exp * 1000).toISOString(),
    refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
}

/** Estado del almacén leído a prueba de bloqueos (para verificar el dato físico). */
const readStore = (page) =>
  page.evaluate(() => {
    const dump = (name) => {
      try {
        if (!window[name]) return { unavailable: true };
        const entries = {};
        for (let i = 0; i < window[name].length; i += 1) {
          const key = window[name].key(i);
          entries[key] = window[name].getItem(key);
        }
        return entries;
      } catch (error) {
        return { blocked: error.name };
      }
    };
    return { local: dump("localStorage"), session: dump("sessionStorage"), pathname: location.pathname };
  });

const healthyStore = (store) => store && !store.unavailable && !store.blocked;

async function login(page, { remember = true } = {}) {
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await page.getByPlaceholder("tu@correo.com").fill(USER.email);
  await page.getByPlaceholder("Mínimo 8 caracteres").fill("contrasena-larga");
  const checkbox = page.getByLabel("Recordar sesión");
  if (remember) await checkbox.check();
  else await checkbox.uncheck();
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).last().click();
}

/** Lanza Chromium con argumentos extra (para el bloqueo real del navegador). */
async function launchBrowser(extraArgs = []) {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [...SAFE_ARGS, ...extraArgs],
  });
}

let problems = [];

function watchErrors(page) {
  problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "warning" && (text.includes("GPU stall") || text.startsWith("THREE.Clock:"))) return;
    if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${text.slice(0, 160)}`);
  });
  page.on("weberror", (error) => problems.push(`weberror: ${error.error().message}`));
}

const refreshCalls = (page) => page.__calls.filter((call) => call.includes("/auth/refresh")).length;
const authMeCalls = (page) => page.__calls.filter((call) => call.includes("/auth/me")).length;

// ---------------------------------------------------------------
// Bloqueo real del navegador: --disable-local-storage
// ---------------------------------------------------------------

test("bloqueo REAL de localStorage: la app carga, avisa al guardar y no entra en bucle", async () => {
  const browser = await launchBrowser(["--disable-local-storage"]);
  const page = await browser.newPage();
  watchErrors(page);
  installApiFixtures(page);

  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  // El navegador entrega localStorage como null: acceso denegado de verdad.
  expect(await page.evaluate(() => window.localStorage)).toBeNull();
  await page.waitForURL("**/login", { timeout: 20_000 });

  await login(page, { remember: true });
  await expect(page.getByText(/No se pudo guardar la sesión en este navegador/i)).toBeVisible({ timeout: 15_000 });

  // Sigue en el login, sin sesión utilizable y sin tormenta de renovaciones.
  expect(await page.evaluate(() => location.pathname)).toBe("/login");
  expect(refreshCalls(page)).toBe(0);
  await expect(page.getByRole("button", { name: "Iniciar sesión", exact: true })).toBeVisible();
  expect(problems).toEqual([]);

  await browser.close();
});

test("bloqueo REAL de localStorage: iniciar sin recordar funciona y el ciclo completo sigue vivo", async () => {
  const browser = await launchBrowser(["--disable-local-storage"]);
  const page = await browser.newPage();
  watchErrors(page);
  installApiFixtures(page);

  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 20_000 });

  // Sin "recordar", la sesión vive en sessionStorage, que sí está disponible.
  await login(page, { remember: false });
  await page.waitForURL("**/home", { timeout: 20_000 });
  const afterLogin = await readStore(page);
  expect(healthyStore(afterLogin.session)).toBe(true);
  expect(JSON.parse(afterLogin.session.kronos_user).username).toBe("audit");

  // Recarga: la sesión permanece.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForURL("**/home", { timeout: 20_000 });

  // Navegación entre rutas: sigue autenticado y no hay bucle de /auth/me.
  for (const path of ["/explore", "/settings"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    expect((await readStore(page)).pathname).toBe(path);
  }
  // Una hidratación por carga (doble en desarrollo por StrictMode), nunca un bucle.
  expect(authMeCalls(page)).toBeLessThanOrEqual(8);
  expect(refreshCalls(page)).toBe(0);

  // Logout: la sesión desaparece del almacén disponible.
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).first().click();
  await page.waitForURL("**/login", { timeout: 20_000 });
  const afterLogout = await readStore(page);
  expect(afterLogout.session).toEqual({});
  expect((page.__calls || []).some((call) => /^POST .*\/auth\/logout$/.test(call))).toBe(true);
  expect(problems).toEqual([]);

  await browser.close();
});

// ---------------------------------------------------------------
// Bloqueos simulados con la forma del navegador
// ---------------------------------------------------------------

test("acceso denegado a ambos almacenes: login avisa, no guarda y el formulario sigue usable", async ({ page }) => {
  watchErrors(page);
  installApiFixtures(page);
  await blockStorage(page, "denegado", "ambos");

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await login(page, { remember: true });

  await expect(page.getByText(/No se pudo guardar la sesión en este navegador/i)).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => location.pathname)).toBe("/login");
  expect(refreshCalls(page)).toBe(0);
  // Reintento posible: el formulario no queda bloqueado.
  await expect(page.getByRole("button", { name: "Iniciar sesión", exact: true })).toBeEnabled();
  expect(problems).toEqual([]);
});

test("escritura bloqueada (cuota agotada): no queda sesión parcial ni error sin explicar", async ({ page }) => {
  watchErrors(page);
  installApiFixtures(page);
  await blockStorage(page, "escritura", "ambos");

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await login(page, { remember: true });

  await expect(page.getByText(/No se pudo guardar la sesión en este navegador/i)).toBeVisible({ timeout: 15_000 });
  const store = await readStore(page);
  expect(store.local).toEqual({});
  expect(store.session).toEqual({});
  expect(store.pathname).toBe("/login");
  expect(problems).toEqual([]);
});

test("borrado bloqueado: el logout no deja tokens utilizables ni revive la sesión al recargar", async ({ page }) => {
  watchErrors(page);
  installApiFixtures(page);
  await seedSession(page, { token: jwt(3600), refresh: "refresh-vivo" });
  await blockStorage(page, "borrado", "ambos");

  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).first().click();
  await page.waitForURL("**/login", { timeout: 20_000 });

  // Ninguna clave conserva un valor utilizable aunque removeItem falle.
  const afterLogout = await readStore(page);
  for (const key of ["kronos_token", "kronos_user", "kronos_refresh_token", "kronos_session_expires_at"]) {
    expect(afterLogout.local[key] || "").toBe("");
  }

  // Y no reaparece al recargar (el caso real: reabrir el navegador más tarde).
  const reloaded = await page.reload({ waitUntil: "domcontentloaded" });
  expect(reloaded).toBeTruthy();
  await page.waitForTimeout(1500);
  const afterReload = await readStore(page);
  expect(afterReload.pathname).toBe("/login");
  expect(afterReload.local.kronos_token || "").toBe("");
  expect(problems).toEqual([]);
});

test("sin sesión y con el almacén denegado: la navegación protegida devuelve al login sin errores", async ({ page }) => {
  watchErrors(page);
  installApiFixtures(page);
  await blockStorage(page, "denegado", "ambos");

  for (const path of ["/home", "/profile", "/settings"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/login", { timeout: 20_000 });
    expect(await page.evaluate(() => location.pathname)).toBe("/login");
  }

  expect(authMeCalls(page)).toBe(0);
  expect(refreshCalls(page)).toBe(0);
  expect(problems).toEqual([]);
});

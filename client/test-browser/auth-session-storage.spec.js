import { test, expect } from "@playwright/test";

/**
 * KRONOS-AUDIT-002 — ciclo de vida de la sesión en navegador real.
 *
 * Recorre la aplicación real (React + authStorage + apiClient) en un
 * Chromium real y comprueba dónde vive la sesión y cuándo se crea,
 * actualiza y elimina. La red se sustituye por fixtures deterministas
 * (`/api/**`) para que la prueba mida el almacenamiento del cliente y no
 * la disponibilidad de MongoDB; el contrato de las respuestas es el del
 * backend (token, expiresAt, refreshToken, refreshExpiresAt, user).
 *
 * Requisitos: servidor de desarrollo escuchando en `KRONOS_TEST_URL`
 * (por defecto http://localhost:3000):
 *   npm run dev --workspace=client
 *   npx playwright test auth-session-storage
 */

const BASE = process.env.KRONOS_TEST_URL || "http://localhost:3000";
const ID = "507f1f77bcf86cd799439011";

const USER = {
  _id: ID,
  id: ID,
  username: "audit",
  email: "audit@kronos.space",
  emailVerified: true,
  displayName: "Audit",
  avatar: "",
  cover: "",
  bio: "",
  role: "user",
};

/**
 * Token de prueba. `claims` permite distinguir emisiones distintas: dos
 * JWT con los mismos `id` y `exp` (mismo segundo) son idénticos, y una
 * prueba que rechace "el token viejo" por igualdad de cadena rechazaría
 * también el renovado.
 */
const jwt = (seconds, claims = {}) =>
  `e30.${Buffer.from(JSON.stringify({ id: ID, exp: Math.floor(Date.now() / 1000) + seconds, ...claims })).toString("base64url")}.firma-de-prueba`;

const expiresAt = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();

const SESSION_KEYS = [
  "kronos_token",
  "kronos_user",
  "kronos_session_expires_at",
  "kronos_session_remember",
  "kronos_refresh_token",
  "kronos_refresh_expires_at",
];

/**
 * Instala las respuestas del backend. Las peticiones autenticadas
 * rechazan con 401 el token marcado en `rejectToken` (simula un token
 * revocado en el servidor sin tocar los demás), y `/auth/refresh` puede
 * fallar para representar una sesión cuya renovación fue revocada.
 */
function installApiFixtures(page, options = {}) {
  const calls = [];
  page.__calls = calls;
  const accessToken = options.accessToken || jwt(3600);
  const refreshToken = "refresh-inicial";

  const unauthorized = (route) =>
    route.fulfill({ status: 401, json: { error: "Token inválido", code: "TOKEN_INVALID" } });

  page.route("**/api/**", (route) => {
    const url = route.request().url();
    const path = url.replace(BASE, "");
    calls.push(`${route.request().method()} ${path}`);

    if (url.includes("/auth/login")) {
      return route.fulfill({
        json: {
          token: accessToken,
          expiresAt: expiresAt(3600),
          refreshToken,
          refreshExpiresAt: expiresAt(86_400),
          user: USER,
        },
      });
    }

    if (url.includes("/auth/refresh")) {
      if (options.refreshFails) {
        return route.fulfill({ status: 401, json: { error: "La sesión expiró", code: "REFRESH_EXPIRED" } });
      }
      return route.fulfill({
        json: {
          token: jwt(3600, { tokenId: "renovado" }),
          expiresAt: expiresAt(3600),
          refreshToken: "refresh-rotado",
          refreshExpiresAt: expiresAt(86_400),
          user: USER,
        },
      });
    }

    if (url.includes("/auth/logout")) return route.fulfill({ json: { ok: true } });

    // Token revocado en el servidor: solo ese token es rechazado.
    const bearer = (route.request().headers()["authorization"] || "").replace("Bearer ", "");
    if (options.rejectToken && bearer === options.rejectToken && !url.includes("/auth/")) {
      return unauthorized(route);
    }
    if (options.unauthorized && url.includes("/auth/me")) return unauthorized(route);

    if (url.includes("/auth/me")) return route.fulfill({ json: { user: USER } });
    if (url.includes("/auth/sessions")) return route.fulfill({ json: { sessions: [] } });
    if (url.includes("/auth/google/config")) return route.fulfill({ json: { enabled: false } });

    return route.fulfill({
      json: { user: USER, posts: [], flags: {}, stories: [], circles: [], orbits: [], items: [], users: [], sessions: [], notifications: [], unreadCount: 0 },
    });
  });

  page.route("**/socket.io/**", (route) =>
    route.fulfill({ body: '0{"sid":"audit","upgrades":[],"pingInterval":1000000,"pingTimeout":1000000}' })
  );
}

/**
 * Sesión preexistente en el navegador, como tras un login anterior. Las
 * fechas se calculan aquí (Node) porque el script de inicialización se
 * ejecuta dentro de la página, donde no existe `Buffer`.
 */
async function seedSession(page, { token, refresh = "", remember = true }) {
  const { exp } = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  await page.addInitScript((data) => {
    const store = data.remember ? localStorage : sessionStorage;
    store.setItem("kronos_token", data.token);
    store.setItem("kronos_user", JSON.stringify({
      _id: "507f1f77bcf86cd799439011",
      id: "507f1f77bcf86cd799439011",
      username: "audit",
      email: "audit@kronos.space",
      displayName: "Audit",
    }));
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

const readStorage = (page) =>
  page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
  }));

const whereTokenLives = async (page) => {
  const { local, session } = await readStorage(page);
  if (local.kronos_token) return "localStorage";
  if (session.kronos_token) return "sessionStorage";
  return "ninguno";
};

async function login(page, { remember = true } = {}) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await page.getByPlaceholder("tu@correo.com").fill(USER.email);
  await page.getByPlaceholder("Mínimo 8 caracteres").fill("contrasena-larga");
  const checkbox = page.getByLabel("Recordar sesión");
  if (remember) await checkbox.check();
  else await checkbox.uncheck();
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).last().click();
  await page.waitForURL("**/home", { timeout: 20_000 });
}

let errors = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "warning" && message.text().includes("GPU stall due to ReadPixels")) return;
    if (message.type() === "warning" && message.text().startsWith("THREE.Clock:")) return;
    if (["error", "warning"].includes(message.type())) errors.push(message.text());
  });
});

test("inicio de sesión: la sesión queda disponible y persistida", async ({ page, context }) => {
  installApiFixtures(page);

  await login(page);
  await expect(page).toHaveURL(/\/home$/);

  const { local, session } = await readStorage(page);
  expect(Object.keys(local).sort()).toEqual([...SESSION_KEYS].sort());
  expect(session).toEqual({});
  expect(local.kronos_session_remember).toBe("true");
  expect(local.kronos_token.split(".")).toHaveLength(3);
  expect(local.kronos_refresh_token).toBe("refresh-inicial");
  expect(JSON.parse(local.kronos_user).username).toBe("audit");

  // La sesión no puede contener credenciales reutilizables.
  expect(local.kronos_user).not.toMatch(/password|passwordHash|credential|googleId/);

  // No hay cookies de sesión: el transporte es Bearer en el encabezado.
  expect(await context.cookies()).toEqual([]);

  expect(errors).toEqual([]);
});

test("recarga: la sesión permanece y el usuario sigue autenticado", async ({ page }) => {
  installApiFixtures(page);
  await login(page);

  const before = (await readStorage(page)).local.kronos_token;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForURL("**/home", { timeout: 20_000 });

  const { local } = await readStorage(page);
  expect(local.kronos_token).toBe(before);
  expect(page.__calls.filter((call) => call.includes("/auth/me")).length).toBeGreaterThan(0);
  expect(page.url()).toMatch(/\/home$/);
});

test("navegación entre rutas: la sesión permanece", async ({ page }) => {
  installApiFixtures(page);
  await login(page);
  const token = (await readStorage(page)).local.kronos_token;

  for (const path of ["/explore", "/profile", "/settings", "/home"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    expect(await whereTokenLives(page)).toBe("localStorage");
    expect((await readStorage(page)).local.kronos_token).toBe(token);
    expect(page.url()).not.toContain("/login");
  }
});

test("cierre de sesión: la sesión desaparece de ambos almacenes", async ({ page }) => {
  installApiFixtures(page);
  await login(page);

  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).first().click();
  await page.waitForURL("**/login", { timeout: 20_000 });

  const { local, session } = await readStorage(page);
  expect(local).toEqual({});
  expect(session).toEqual({});
  expect(page.__calls.some((call) => /^POST .*\/auth\/logout$/.test(call))).toBe(true);
  expect(await whereTokenLives(page)).toBe("ninguno");
});

test("sesión expirada: el refresh la recupera y rota los tokens", async ({ page }) => {
  installApiFixtures(page);
  const expired = jwt(-60);
  await seedSession(page, { token: expired, refresh: "refresh-vigente", remember: true });

  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/home", { timeout: 20_000 });
  await page.waitForTimeout(1000);

  const { local } = await readStorage(page);
  expect(local.kronos_token).not.toBe(expired);
  expect(local.kronos_refresh_token).toBe("refresh-rotado");
  expect(local.kronos_session_remember).toBe("true");
  expect(page.__calls.filter((call) => call.includes("/auth/refresh"))).toHaveLength(1);
  expect(page.url()).toMatch(/\/home$/);
});

test("un 401 del servidor con refresh vigente no cierra la sesión", async ({ page }) => {
  const revoked = jwt(3600);
  installApiFixtures(page, { rejectToken: revoked });
  await seedSession(page, { token: revoked, refresh: "refresh-vigente", remember: true });

  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const { local } = await readStorage(page);
  expect(page.url()).toMatch(/\/home$/);
  expect(local.kronos_token).not.toBe(revoked);
  expect(local.kronos_refresh_token).toBe("refresh-rotado");
});

test("sesión expirada sin refresh: el usuario vuelve al estado no autenticado", async ({ page }) => {
  installApiFixtures(page, { unauthorized: true });
  await seedSession(page, { token: jwt(-60), refresh: "", remember: true });

  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 20_000 });

  const { local, session } = await readStorage(page);
  expect(local).toEqual({});
  expect(session).toEqual({});
});

test("refresh rechazado: la sesión se elimina y vuelve al login", async ({ page }) => {
  installApiFixtures(page, { refreshFails: true });
  await seedSession(page, { token: jwt(-60), refresh: "refresh-revocado", remember: true });

  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 20_000 });

  expect(await whereTokenLives(page)).toBe("ninguno");
  expect((await readStorage(page)).local).toEqual({});
});

test("actualizar el usuario: se persiste en el mismo almacén sin perder la sesión", async ({ page }) => {
  installApiFixtures(page);
  await login(page);

  // La pantalla que actualiza el perfil (Profile, Onboarding, privacidad)
  // llama a updateUser; aquí se invoca el módulo real servido al navegador.
  const updated = await page.evaluate(async () => {
    const auth = await import("/src/services/authStorage.js");
    auth.updateUser({ ...auth.getUser(), displayName: "Audit Actualizado" });
    return { user: auth.getUser(), token: auth.getToken() };
  });

  const { local, session } = await readStorage(page);
  expect(updated.user.displayName).toBe("Audit Actualizado");
  expect(JSON.parse(local.kronos_user).displayName).toBe("Audit Actualizado");
  expect(local.kronos_token).toBe(updated.token);
  expect(session).toEqual({});

  // Sigue disponible tras recargar: la hidratación parte del almacén.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForURL("**/home", { timeout: 20_000 });
  expect(JSON.parse((await readStorage(page)).local.kronos_user).displayName).toBe("Audit Actualizado");
});

test("sin recordar sesión: la sesión no viaja a otra pestaña", async ({ page, context }) => {
  installApiFixtures(page);

  await login(page, { remember: false });
  const { local } = await readStorage(page);
  expect(local).toEqual({});
  expect(await whereTokenLives(page)).toBe("sessionStorage");

  // Otra pestaña del mismo navegador no hereda sessionStorage.
  const other = await context.newPage();
  installApiFixtures(other);
  await other.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await other.waitForURL("**/login", { timeout: 20_000 });
  expect(await whereTokenLives(other)).toBe("ninguno");
  await other.close();

  // En la pestaña original la sesión sigue viva tras recargar.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForURL("**/home", { timeout: 20_000 });
  expect(await whereTokenLives(page)).toBe("sessionStorage");
});

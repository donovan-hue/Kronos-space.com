import { afterEach, beforeEach, expect, it, vi } from "vitest";
import axios from "axios";

// Adaptadores unitarios explícitos que ejercitan interceptores Axios reales.
// No son API productiva ni evidencia de autenticación contra MongoDB.
let api, renewSession, subscribeToApiSession, auth;
const token = (id, seconds = 3600) => `header.${btoa(JSON.stringify({ id, exp: Math.floor(Date.now() / 1000) + seconds }))}.signature`;
function login(id, seconds = 3600) {
  auth.saveSession(token(id, seconds), { id, username: id }, true, "", { token: `refresh-${id}` });
}
const success = (config, data = {}) => ({ config, data, status: 200, statusText: "OK", headers: {} });
const unauthorized = config => new axios.AxiosError("Unauthorized fixture", "ERR_BAD_REQUEST", config, {}, { status: 401, data: {}, config });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

beforeEach(async () => {
  vi.resetModules();
  auth = await import("../src/services/authStorage");
  ({ api, renewSession, subscribeToApiSession } = await import("../src/services/apiClient"));
  login("A");
});

afterEach(() => { vi.restoreAllMocks(); auth.clearSession(); });

it("un 401 de A recibido tras iniciar B no renueva ni cierra B", async () => {
  const sent = deferred(), response = deferred();
  api.defaults.adapter = config => { sent.resolve(config); return response.promise; };
  const refresh = vi.spyOn(axios, "post").mockRejectedValue(new Error("No refresh expected"));
  const events = [];
  const off = subscribeToApiSession(event => events.push(event));
  try {
    const request = api.get("/messages").catch(error => error);
    const config = await sent.promise;
    login("B");
    response.reject(unauthorized(config));
    await request;
    expect(auth.getSession()?.user.id).toBe("B");
    expect(refresh).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  } finally { off(); }
});

it("una respuesta exitosa de A no entrega datos después de cambiar a B", async () => {
  const sent = deferred(), response = deferred();
  api.defaults.adapter = config => { sent.resolve(config); return response.promise; };
  const request = api.get("/messages").catch(error => error);
  const config = await sent.promise;
  login("B");
  response.resolve(success(config, { privateOwner: "A" }));
  const result = await request;
  expect(axios.isCancel(result)).toBe(true);
  expect(auth.getSession().user.id).toBe("B");
});

it("una petición de A esperando refresh no se envía con credenciales de B", async () => {
  login("A", -60);
  const refreshStarted = deferred(), reply = deferred();
  vi.spyOn(axios, "post").mockImplementation(() => { refreshStarted.resolve(); return reply.promise; });
  const adapter = vi.fn(async config => success(config));
  api.defaults.adapter = adapter;
  const request = api.post("/posts", { content: "A" }).catch(error => error);
  await refreshStarted.promise;
  login("B");
  reply.resolve({ data: { token: token("A-new"), refreshToken: "A-rotated" } });
  expect(axios.isCancel(await request)).toBe(true);
  expect(adapter).not.toHaveBeenCalled();
});

it("la sesión nueva tiene su propio refresh aunque el anterior siga pendiente", async () => {
  const reply = deferred();
  const post = vi.spyOn(axios, "post")
    .mockImplementationOnce(() => reply.promise)
    .mockResolvedValueOnce({ data: { token: token("B-new"), refreshToken: "B-rotated" } });
  const oldRefresh = renewSession();
  login("B", -60);
  const newRefresh = renewSession();
  reply.resolve({ data: { token: token("A-new"), refreshToken: "A-rotated" } });
  await Promise.all([oldRefresh, newRefresh]);
  expect(post).toHaveBeenCalledTimes(2);
  expect(auth.getToken()).toBe(token("B-new"));
  expect(auth.getSession().user.id).toBe("B");
});

it("401 concurrentes de una misma sesión comparten una renovación", async () => {
  const renewed = token("A-renewed");
  const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { token: renewed, refreshToken: "A-rotated" } });
  const adapter = vi.fn(async config => {
    if (config.headers.Authorization !== `Bearer ${renewed}`) throw unauthorized(config);
    return success(config, { ok: true });
  });
  api.defaults.adapter = adapter;
  const results = await Promise.all([api.get("/messages"), api.get("/notifications")]);
  expect(results.every(result => result.data.ok)).toBe(true);
  expect(post).toHaveBeenCalledTimes(1);
  expect(adapter).toHaveBeenCalledTimes(4);
});

it("un segundo 401 no genera bucle: reintenta una sola vez y cierra", async () => {
  const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { token: token("A-renewed"), refreshToken: "A-rotated" } });
  const adapter = vi.fn(async config => { throw unauthorized(config); });
  api.defaults.adapter = adapter;
  await expect(api.get("/messages")).rejects.toMatchObject({ response: { status: 401 } });
  expect(post).toHaveBeenCalledTimes(1);
  expect(adapter).toHaveBeenCalledTimes(2);
  expect(auth.getSession()).toBeNull();
});

it("un fallo de red normal no renueva ni elimina una sesión", async () => {
  const post = vi.spyOn(axios, "post");
  api.defaults.adapter = async config => { throw new axios.AxiosError("Offline fixture", "ERR_NETWORK", config); };
  await expect(api.get("/messages")).rejects.toMatchObject({ code: "ERR_NETWORK" });
  expect(post).not.toHaveBeenCalled();
  expect(auth.getSession().user.id).toBe("A");
});


it("un 401 tardío tras rotar en la misma sesión usa el token nuevo sin otro refresh", async () => {
  const sent = deferred(), reply = deferred();
  const renewed = token("A-renewed");
  const adapter = vi.fn()
    .mockImplementationOnce(config => { sent.resolve(config); return reply.promise; })
    .mockImplementationOnce(async config => success(config));
  api.defaults.adapter = adapter;
  const request = api.get("/messages");
  const config = await sent.promise;
  const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { token: renewed, refreshToken: "A-rotated" } });
  await renewSession();
  reply.reject(unauthorized(config));
  await request;
  expect(post).toHaveBeenCalledTimes(1);
  expect(adapter).toHaveBeenCalledTimes(2);
  expect(adapter.mock.calls[1][0].headers.Authorization).toBe(`Bearer ${renewed}`);
});

it("el finally de A no retira el refresh pendiente de B", async () => {
  const oldReply = deferred(), newReply = deferred();
  const post = vi.spyOn(axios, "post")
    .mockImplementationOnce(() => oldReply.promise)
    .mockImplementationOnce(() => newReply.promise);
  const oldRefresh = renewSession();
  login("B");
  const newRefresh = renewSession();
  oldReply.resolve({ data: { token: token("A-new"), refreshToken: "A-rotated" } });
  await oldRefresh;
  const sharedRefresh = renewSession();
  newReply.resolve({ data: { token: token("B-new"), refreshToken: "B-rotated" } });
  await Promise.all([newRefresh, sharedRefresh]);
  expect(post).toHaveBeenCalledTimes(2);
  expect(auth.getToken()).toBe(token("B-new"));
});

for (const failure of [
  { code: "ERR_NETWORK" },
  { code: "ECONNABORTED" },
  { code: "ERR_BAD_RESPONSE", response: { status: 503, data: { error: "Unavailable fixture" } } }
]) {
  for (const expired of [false, true]) {
    it(`refresh ${failure.code} conserva sesión y rechaza operación (${expired ? "preflight" : "401"})`, async () => {
      login("A", expired ? -60 : 3600);
      const original = auth.getSession();
      const events = [];
      const off = subscribeToApiSession(event => events.push(event));
      const refreshError = Object.assign(new Error("Refresh transport fixture"), failure, { config: { url: "/auth/refresh" } });
      const post = vi.spyOn(axios, "post").mockRejectedValue(refreshError);
      const adapter = vi.fn(async config => { throw unauthorized(config); });
      api.defaults.adapter = adapter;
      try {
        await expect(api.post("/posts", { content: "test" })).rejects.toMatchObject({ code: failure.code });
        expect(auth.getSession()).toEqual(original);
        expect(events).toEqual([]);
        expect(post).toHaveBeenCalledTimes(1);
        expect(adapter).toHaveBeenCalledTimes(expired ? 0 : 1);
      } finally { off(); }
    });
  }
}

it("la siguiente operación puede renovar tras un fallo temporal, sin reenvío automático", async () => {
  login("A", -60);
  const post = vi.spyOn(axios, "post")
    .mockRejectedValueOnce(new axios.AxiosError("Offline", "ERR_NETWORK"))
    .mockResolvedValueOnce({ data: { token: token("A-new"), refreshToken: "A-rotated" } });
  const adapter = vi.fn(async config => success(config));
  api.defaults.adapter = adapter;
  await expect(api.get("/messages")).rejects.toMatchObject({ code: "ERR_NETWORK" });
  await api.get("/messages");
  expect(post).toHaveBeenCalledTimes(2);
  expect(adapter).toHaveBeenCalledTimes(1);
  expect(auth.getSession().user.id).toBe("A");
});

it("un refresh realmente rechazado con 401 sí invalida y notifica una sola vez", async () => {
  const events = [];
  const off = subscribeToApiSession(event => events.push(event));
  vi.spyOn(axios, "post").mockRejectedValue(Object.assign(new Error("Revoked fixture"), { response: { status: 401 } }));
  try {
    expect(await renewSession()).toBeNull();
    expect(auth.getSession()).toBeNull();
    expect(events.map(event => event.type)).toEqual(["cleared"]);
  } finally { off(); }
});

it("una respuesta de refresh sin token rechaza sin fingir éxito ni borrar la sesión", async () => {
  login("A", -60);
  vi.spyOn(axios, "post").mockResolvedValue({ data: {} });
  const adapter = vi.fn(async config => success(config));
  api.defaults.adapter = adapter;
  await expect(api.get("/messages")).rejects.toThrow("REFRESH_INVALID_RESPONSE");
  expect(adapter).not.toHaveBeenCalled();
  expect(auth.getRefreshToken()).toBe("refresh-A");
});

it("un refresh temporal fallido compartido rechaza cada operación con su propio config", async () => {
  login("A", -60);
  const reply = deferred();
  const post = vi.spyOn(axios, "post").mockImplementation(() => reply.promise);
  const adapter = vi.fn(async config => success(config));
  api.defaults.adapter = adapter;
  const requests = [api.get("/messages"), api.get("/notifications")];
  const settled = Promise.allSettled(requests);
  await Promise.resolve();
  reply.reject(new axios.AxiosError("Offline fixture", "ERR_NETWORK"));
  const results = await settled;
  expect(results.map(result => result.status)).toEqual(["rejected", "rejected"]);
  expect(results.map(result => result.reason.config.url)).toEqual(["/messages", "/notifications"]);
  expect(results.every(result => result.reason.code === "ERR_NETWORK")).toBe(true);
  expect(post).toHaveBeenCalledTimes(1);
  expect(adapter).not.toHaveBeenCalled();
  expect(auth.getSession().user.id).toBe("A");
});

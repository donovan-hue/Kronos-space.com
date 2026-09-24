import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/services/apiClient";
import * as authStorage from "../src/services/authStorage";
import { generateImage, generateScript, generateVideo, getVideoJob, getImageHistory, sendKairosMessage } from "../src/services/aiService";

// Contrato de transporte local, no demuestra generación contra proveedor.
// Los spies son exclusivos del test; ningún fallback de producción.
afterEach(() => vi.restoreAllMocks());

describe("presupuestos de espera por operación IA", () => {
  for (const [label, call, endpoint, timeout] of [
    ["imagen", generateImage, "/ai/images/generate", 120_000],
    ["guion", generateScript, "/ai/scripts/generate", 60_000],
    ["video", generateVideo, "/ai/videos/generate", 45_000],
    ["chat", sendKairosMessage, "/ai/chat", 60_000]
  ]) {
    it(`${label}: espera el presupuesto propio y conserva el payload`, async () => {
      const post = vi.spyOn(api, "post").mockResolvedValue({ data: { contract: label } });
      expect(await call({ prompt: "idea", message: "idea" })).toEqual({ contract: label });
      expect(post).toHaveBeenCalledOnce();
      expect(post.mock.calls[0][0]).toBe(endpoint);
      expect(post.mock.calls[0][2]).toEqual({ timeout });
      expect(post.mock.calls[0][1]).toMatchObject(label === "chat" ? { message: "idea" } : { prompt: "idea" });
    });

    it(`${label}: propaga timeout sin reenviar generación`, async () => {
      const error = Object.assign(new Error("timeout fixture"), { code: "ECONNABORTED" });
      const post = vi.spyOn(api, "post").mockRejectedValue(error);
      await expect(call({ prompt: "idea", message: "idea" })).rejects.toBe(error);
      expect(post).toHaveBeenCalledOnce();
    });
  }

  it("polling usa el presupuesto de video; historial conserva el timeout normal", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: {} });
    await getVideoJob("job-contract");
    expect(get).toHaveBeenNthCalledWith(1, "/ai/videos/job-contract/status", { timeout: 45_000 });
    await getImageHistory();
    expect(get).toHaveBeenNthCalledWith(2, "/ai/images/history");
    expect(api.defaults.timeout).toBe(15_000);
  });
});


it("polling solapado del mismo trabajo comparte solo la petición en curso", async () => {
  let finish;
  const get = vi.spyOn(api, "get").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const first = getVideoJob("same-job");
  const second = getVideoJob("same-job");
  expect(get).toHaveBeenCalledTimes(1);
  finish({ data: { generation: { status: "processing" } } });
  expect(await first).toEqual(await second);
  get.mockResolvedValueOnce({ data: { generation: { status: "completed" } } });
  expect((await getVideoJob("same-job")).generation.status).toBe("completed");
  expect(get).toHaveBeenCalledTimes(2);
});

it("polling fallido libera la petición para la próxima consulta", async () => {
  const get = vi.spyOn(api, "get").mockRejectedValueOnce(new Error("timeout fixture"));
  await expect(getVideoJob("failed-job")).rejects.toThrow("timeout fixture");
  get.mockResolvedValueOnce({ data: { recovered: true } });
  expect(await getVideoJob("failed-job")).toEqual({ recovered: true });
  expect(get).toHaveBeenCalledTimes(2);
});

it("otra sesión no hereda un polling pendiente y la respuesta vieja no borra el nuevo", async () => {
  const token = vi.spyOn(authStorage, "getToken").mockReturnValue("session-A-fixture");
  const finish = [];
  const get = vi.spyOn(api, "get").mockImplementation(() => new Promise(resolve => { finish.push(resolve); }));
  const oldRequest = getVideoJob("shared-id");
  token.mockReturnValue("session-B-fixture");
  const newRequest = getVideoJob("shared-id");
  expect(get).toHaveBeenCalledTimes(2);
  finish[0]({ data: { owner: "A" } });
  await oldRequest;
  const repeat = getVideoJob("shared-id");
  expect(get).toHaveBeenCalledTimes(2);
  finish[1]({ data: { owner: "B" } });
  expect(await newRequest).toEqual({ owner: "B" });
  expect(await repeat).toEqual({ owner: "B" });
});

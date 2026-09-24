import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { renewSession, subscribeToApiSession } from "../src/services/apiClient";
import { clearSession, getRefreshToken, getSession, saveSession } from "../src/services/authStorage";

// Pruebas unitarias del contrato storage/interceptores: axios.post es un
// doble explícito, NO una comprobación de OAuth, MongoDB ni backend real.
const user = { id: "storage-contract", username: "storage-contract" };
const token = seconds => `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }))}.signature`;
let events;
let unsubscribe;

beforeEach(() => {
  clearSession();
  saveSession(token(-60), user, true, "", { token: "refresh-before" });
  events = [];
  unsubscribe = subscribeToApiSession(event => events.push(event));
});

afterEach(() => {
  unsubscribe();
  vi.restoreAllMocks();
  clearSession();
});

describe("renovación solo anuncia éxito después de persistir el par", () => {
  it("conserva la expiración de refresh del contrato backend", async () => {
    const data = { token: token(3600), refreshToken: "refresh-after", refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString() };
    vi.spyOn(axios, "post").mockResolvedValue({ data });
    expect(await renewSession()).toEqual(data);
    expect(getSession().refreshExpiresAt).toBe(data.refreshExpiresAt);
    expect(events.map(event => event.type)).toEqual(["refreshed"]);
  });

  it("cierra sesión y no emite refreshed si la escritura falla tras rotar en backend", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: { token: token(3600), refreshToken: "refresh-after" } });
    const write = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (key, value) {
      if (key === "kronos_refresh_token") throw new DOMException("Quota exceeded", "QuotaExceededError");
      return write.call(this, key, value);
    });
    expect(await renewSession()).toBeNull();
    expect(getSession()).toBeNull();
    expect(getRefreshToken()).toBe("");
    expect(events.map(event => event.type)).toEqual(["cleared"]);
    expect(events[0].reason).toBe("invalid");
  });

  it("no reabre la sesión si desapareció mientras la renovación estaba en curso", async () => {
    vi.spyOn(axios, "post").mockImplementation(async () => {
      clearSession();
      return { data: { token: token(3600), refreshToken: "refresh-after" } };
    });
    expect(await renewSession()).toBeNull();
    expect(getSession()).toBeNull();
    expect(events.some(event => event.type === "refreshed")).toBe(false);
  });

  it("una respuesta tardía no sobrescribe los tokens de otra cuenta", async () => {
    const other = { id: "another-account", username: "another-account" };
    vi.spyOn(axios, "post").mockImplementation(async () => {
      saveSession(token(3600), other, false, "", { token: "other-refresh" });
      return { data: { token: token(7200), refreshToken: "stale-refresh" } };
    });
    expect(await renewSession()).toBeNull();
    expect(getSession().user).toEqual(other);
    expect(getRefreshToken()).toBe("other-refresh");
    expect(events).toEqual([]);
  });

  it("un 401 tardío del refresh anterior no cierra la cuenta nueva", async () => {
    vi.spyOn(axios, "post").mockImplementation(async () => {
      saveSession(token(3600), user, false, "", { token: "other-refresh" });
      throw Object.assign(new Error("Refresh rejected"), { response: { status: 401 } });
    });
    expect(await renewSession()).toBeNull();
    expect(getRefreshToken()).toBe("other-refresh");
    expect(events).toEqual([]);
  });

});

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}));

vi.mock("../src/services/apiClient", () => ({ api: apiMocks }));
vi.mock("../src/services/authStorage", () => ({ saveSession: vi.fn() }));

import Auth from "../src/features/auth/Auth";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";

describe("Continuar con Google", () => {
  let googleCallback;

  beforeEach(() => {
    googleCallback = undefined;
    apiMocks.get.mockResolvedValue({
      data: { enabled: true, clientId: CLIENT_ID }
    });
    apiMocks.post.mockReset();

    window.google = {
      accounts: {
        id: {
          initialize: vi.fn((options) => {
            googleCallback = options.callback;
          }),
          renderButton: vi.fn((slot) => {
            const button = document.createElement("button");
            button.textContent = "Continuar con Google";
            slot.appendChild(button);
          })
        }
      }
    };
  });

  afterEach(() => {
    delete window.google;
  });

  it("muestra en el landing el error devuelto por el backend", async () => {
    apiMocks.post.mockRejectedValue({
      response: {
        status: 401,
        data: { error: "No pudimos verificar tu cuenta de Google. Intenta nuevamente." }
      }
    });

    render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(window.google.accounts.id.renderButton).toHaveBeenCalled();
      expect(googleCallback).toBeTypeOf("function");
    });

    await act(async () => {
      await googleCallback({ credential: "google-id-token" });
    });

    expect(apiMocks.post).toHaveBeenCalledWith("/auth/google", {
      credential: "google-id-token"
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "No pudimos verificar tu cuenta de Google. Intenta nuevamente."
    );
  });
});

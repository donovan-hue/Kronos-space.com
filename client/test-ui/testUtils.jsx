import React from "react";
import { render } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../src/app/queryClient";

/**
 * Utilidades para montar pantallas que dependen de TanStack Query.
 * Cada montaje recibe un QueryClient fresco (sin reintentos ni refetch
 * automático) para aislar los casos de prueba.
 */

export function withQueryClient(ui) {
  const queryClient = createTestQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
  return { ...result, queryClient };
}

/** Wrapper para renderHook de hooks que usan useQuery/useInfiniteQuery. */
export function createHookWrapper() {
  const queryClient = createTestQueryClient();
  const Wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
}

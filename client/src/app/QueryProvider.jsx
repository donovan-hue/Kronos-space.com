import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "./queryClient";

/**
 * Provee el QueryClient a la app. El cliente vive por montaje de la
 * aplicación: en producción se monta una vez; en pruebas cada montaje
 * obtiene un caché aislado.
 */
export default function QueryProvider({ children }) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

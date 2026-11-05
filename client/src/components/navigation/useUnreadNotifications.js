import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../services/apiClient";
import { getSocket } from "../../services/socket";
import { queryKeys } from "../../services/queryKeys";

/**
 * Contador de notificaciones sin leer para el shell (campana de la barra
 * superior y menú de secciones).
 *
 * Antes el número solo existía dentro de la pantalla de notificaciones
 * (`useNotifications`), así que la campana no avisaba de nada: había que
 * entrar a mirar para enterarse. Este hook pide UNA cifra (limit=1, la
 * respuesta ya trae `unreadCount` global) y la mantiene al día con el mismo
 * socket que usa la lista.
 *
 * Comparte la raíz de caché ["notifications"], así que un `mark`/`markAll`
 * hecho en la pantalla invalida el contador sin coordinación extra.
 */
export default function useUnreadNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.notificationsUnread,
    queryFn: async () => {
      const { data } = await api.get("/notifications", { params: { limit: 1 } });
      return Number(data?.unreadCount) || 0;
    },
    // El socket empuja los cambios; el intervalo es la red de seguridad para
    // cuando la pestaña estuvo dormida o el socket se reconectó.
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    retry: 1
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const bump = (item) => {
      if (!item?._id || item.read) return;
      queryClient.setQueryData(queryKeys.notificationsUnread, (current) =>
        (Number(current) || 0) + 1
      );
    };

    socket.on("notification:new", bump);
    return () => socket.off("notification:new", bump);
  }, [queryClient]);

  const count = Number(query.data) || 0;

  return { count, loading: query.isLoading, error: query.error };
}

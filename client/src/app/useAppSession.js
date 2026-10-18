import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/feedback/ToastProvider";
import { api, renewSession, subscribeToApiSession } from "../services/apiClient";
import { clearSession, getRefreshToken, getSessionRevision, getToken, getUser, isTokenExpired, SESSION_CLEAR_REASONS } from "../services/authStorage";
import { connectSocket, disconnectSocket } from "../services/socket";

/** Ciclo de sesión compartido: identidad, hidratación, caché y socket.
 * La UI de rutas no duplica interceptores ni políticas de autenticación. */
export default function useAppSession() {
  const { showToast } = useToast();
  const [user, setUser] = useState(getUser);
  const queryClient = useQueryClient();

  // El caché de datos está ligado a la sesión: cuando la sesión termina
  // (logout, 401 irrecuperable, hidratación fallida) se limpia por
  // completo para que el siguiente inicio nunca herede datos del
  // usuario anterior.
  useEffect(() => {
    if (!user) queryClient.clear();
  }, [user, queryClient]);
  // KRONOS-PROD-001 — cierre de sesión real en la interfaz.
  //
  // La capa de API (services/apiClient.js) es quien decide que un 401 ya no
  // es recuperable: renueva el refresh y, si la renovación falla, limpia el
  // almacenamiento y emite el evento de sesión cerrada. Aquí había un
  // interceptor de respuesta propio que comprobaba `getToken()` antes de
  // avisar; como los interceptores de respuesta de axios se ejecutan en el
  // orden en que se registraron, el de apiClient corría PRIMERO y ya había
  // borrado el token, así que esa rama nunca entraba: el usuario se quedaba
  // en una pantalla protegida con la sesión muerta y sin ningún aviso.
  //
  // Se usa la suscripción pública de apiClient como fuente única de verdad.
  const userRef = useRef(user);
  const manualLogoutRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    const unsubscribe = subscribeToApiSession((event) => {
      // KRONOS-PROD-002 — el socket debe renovarse junto con la sesión.
      //
      // `connectSocket` solo se llama desde el efecto que depende de `user`,
      // y una renovación de token no cambia el usuario: el socket se quedaba
      // autenticando con el JWT anterior. Al expirar ese JWT, el handshake lo
      // rechazaba (AUTH_INVALID) y, con `reconnectionAttempts: Infinity`, el
      // cliente reintentaba para siempre sin volver a conectar: presencia,
      // typing, mensajes y notificaciones en tiempo real se perdían hasta
      // recargar la página.
      if (event?.type === "refreshed") {
        if (!userRef.current) return;

        connectSocket(getToken());
        return;
      }

      if (event?.type !== "cleared") return;

      // El logout manual ya limpia su propio estado: no se avisa dos veces
      // ni se muestra un error cuando fue el usuario quien cerró sesión.
      if (
        manualLogoutRef.current ||
        event.reason === SESSION_CLEAR_REASONS.logout ||
        event.reason === SESSION_CLEAR_REASONS.manual
      ) {
        return;
      }

      // Un 401 sin sesión activa (petición pública, token ausente) no tiene
      // nada que cerrar en la interfaz.
      if (!userRef.current) return;

      userRef.current = null;
      disconnectSocket();
      setUser(null);
      showToast("Tu sesión terminó. Inicia sesión nuevamente.", { tone: "error" });
    });

    return unsubscribe;
  }, [showToast]);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      const revision = getSessionRevision();
      const isCurrent = () => active && getSessionRevision() === revision;
      // KRONOS-UI-007: un access token expirado ya no obliga a volver a
      // iniciar sesión si el refresh token sigue vigente. El cliente
      // renueva con rotación y continúa la sesión donde estaba.
      if (isTokenExpired() && getRefreshToken()) {
        let refreshed;
        try {
          refreshed = await renewSession();
        } catch {
          // Red/timeout/5xx no demuestran expiración del refresh. No borrar
          // credenciales ni continuar /auth/me como si se hubiera renovado.
          // Las solicitudes posteriores podrán volver a intentar renovar.
          return;
        }

        if (!isCurrent()) return;

        if (!refreshed) {
          clearSession(SESSION_CLEAR_REASONS.expired);
          setUser(null);
          return;
        }
      }

      if (!getToken()) {
        setUser(null);
        return;
      }

      try {
        const { data } = await api.get("/auth/me");

        if (isCurrent() && data.user) setUser(data.user);
      } catch {
        if (isCurrent() && !getToken()) setUser(null);
      }
    }

    hydrate();

    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const token = getToken();
    if (!user || !token) {
      disconnectSocket();
      return undefined;
    }
    connectSocket(token);
    return () => disconnectSocket();
  }, [user]);
  async function logout() {
    // Marca el cierre como iniciativa del usuario antes de llamar a la API:
    // si el backend responde 401 (token ya vencido) la capa de API emite su
    // propio evento de sesión cerrada y no debe mostrarse el aviso de error.
    manualLogoutRef.current = true;

    try {
      const refreshToken = getRefreshToken();

      await api.post(
        "/auth/logout",
        refreshToken ? { refreshToken } : {}
      );
    } catch {
      /* la sesión local se limpia igual */
    }
    clearSession(SESSION_CLEAR_REASONS.logout);
    disconnectSocket();
    setUser(null);
    manualLogoutRef.current = false;
  }
  return { user, setUser, logout };
}

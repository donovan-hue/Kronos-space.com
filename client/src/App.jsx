import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Auth from "./features/auth/Auth";
import NotFound from "./features/NotFound";
import ForgotPassword from "./features/auth/ForgotPassword";
import ResetPassword from "./features/auth/ResetPassword";
import VerifyEmail from "./features/auth/VerifyEmail";
import ImageGenerator from "./features/image-ai/ImageGenerator";
import ScriptGenerator from "./features/script-ai/ScriptGenerator";
import VideoGenerator from "./features/video-ai/VideoGenerator";
import VideoJobs from "./features/video-ai/VideoJobs";
import AICenter from "./features/ai/AICenter";
import KairosHistory from "./features/ai/KairosHistory";
import MediaLibrary from "./features/ai/MediaLibrary";
import SocialPage from "./features/social/SocialPage";
import PostDetail from "./features/social/PostDetail";
import SavedPosts from "./features/social/SavedPosts";
import UserSearch from "./features/users/UserSearch";
import Profile from "./features/users/Profile";
import ProfileByUsername from "./features/users/ProfileByUsername";
import Messages from "./features/messages/Messages";
import Conversations from "./features/messages/Conversations";
import Notifications from "./features/notifications/Notifications";
import CreatePost from "./features/social/CreatePost";
import CreateHub from "./features/social/CreateHub";
import Circles from "./features/social/Circles";
import Orbits from "./features/social/Orbits";
import OrbitFeed from "./features/social/OrbitFeed";
import Channels from "./features/social/Channels";
import StoryArchive from "./features/social/stories/StoryArchive";
import VerticalFeed from "./features/social/vertical/VerticalFeed";
import Capsules from "./features/capsules/Capsules";
import Pulse from "./features/pulse/Pulse";
import Live from "./features/live/Live";
import Analytics from "./features/analytics/Analytics";
import Settings from "./features/settings/Settings";
import ProfileSettings from "./features/settings/ProfileSettings";
import ModerationCenter from "./features/moderation/ModerationCenter";
import AdminCenter from "./features/admin/AdminCenter";
import Onboarding from "./features/onboarding/Onboarding";
import AppLayout from "./layouts/AppLayout";
import ProtectedRoute from "./routes/ProtectedRoute";
import { api } from "./services/apiClient";
import {
  clearSession,
  getRefreshToken,
  getToken,
  getUser,
  isTokenExpired,
  SESSION_CLEAR_REASONS,
} from "./services/authStorage";
import { renewSession, subscribeToApiSession } from "./services/apiClient";
import { connectSocket, disconnectSocket } from "./services/socket";
import { ToastProvider, useToast } from "./components/feedback/ToastProvider";
import { ConfirmProvider } from "./components/feedback/ConfirmProvider";
import QueryProvider from "./app/QueryProvider";
import MotionProvider from "./app/MotionProvider";
import { useQueryClient } from "@tanstack/react-query";
const WordmarkPreview = lazy(() => import("./design-preview/wordmark/WordmarkPreview"));

function AppContent() {
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
      // KRONOS-UI-007: un access token expirado ya no obliga a volver a
      // iniciar sesión si el refresh token sigue vigente. El cliente
      // renueva con rotación y continúa la sesión donde estaba.
      if (isTokenExpired() && getRefreshToken()) {
        const refreshed = await renewSession();

        if (!active) return;

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

        if (active && data.user) setUser(data.user);
      } catch {
        if (active && !getToken()) setUser(null);
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
  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate replace to="/home" />
          ) : (
            <Auth onLogin={setUser} initialMode="login" />
          )
        }
      />
      <Route
        path="/register"
        element={
          user ? (
            <Navigate replace to="/home" />
          ) : (
            <Auth onLogin={setUser} initialMode="register" />
          )
        }
      />
      <Route
        path="/forgot-password"
        element={user ? <Navigate replace to="/home" /> : <ForgotPassword />}
      />
      <Route
        path="/reset-password"
        element={user ? <Navigate replace to="/home" /> : <ResetPassword />}
      />
      <Route
        path="/verify-email"
        element={<VerifyEmail />}
      />
      <Route
        path="/"
        element={<Navigate replace to={user ? "/home" : "/login"} />}
      />
      <Route element={<ProtectedRoute user={user} />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<AppLayout user={user} />}>
          <Route path="/home" element={<SocialPage />} />
          <Route path="/feed" element={<Navigate replace to="/home" />} />
          <Route path="/social" element={<Navigate replace to="/home" />} />
          <Route path="/explore" element={<UserSearch />} />
          <Route path="/search" element={<Navigate replace to="/explore" />} />
          <Route path="/create" element={<CreateHub />} />
          <Route path="/create/post" element={<CreatePost />} />
          <Route path="/circles" element={<Circles />} />
          <Route path="/orbits" element={<Orbits />} />
          <Route path="/orbits/:orbitId" element={<OrbitFeed />} />
          <Route path="/channels" element={<Channels />} />
          <Route path="/vertical" element={<VerticalFeed />} />
          {/* La bandeja de historias enlaza a /stories/archive desde siempre,
              pero la ruta no existía: el comodín final la redirigía a /home
              en silencio y el archivo personal era inalcanzable. */}
          <Route path="/stories/archive" element={<StoryArchive />} />
          <Route path="/capsules" element={<Capsules />} />
          <Route path="/pulse" element={<Pulse />} />
          <Route path="/live" element={<Live />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/kairos" element={<AICenter />} />
          <Route path="/kairos/image" element={<ImageGenerator />} />
          <Route path="/kairos/video" element={<VideoGenerator />} />
          <Route path="/kairos/script" element={<ScriptGenerator />} />
          <Route path="/kairos/history" element={<KairosHistory />} />
          <Route path="/kairos/video/jobs" element={<VideoJobs />} />
          <Route path="/ai" element={<Navigate replace to="/kairos" />} />
          <Route path="/ai/image" element={<Navigate replace to="/kairos/image" />} />
          <Route path="/ai/script" element={<Navigate replace to="/kairos/script" />} />
          <Route path="/ai/video" element={<Navigate replace to="/kairos/video" />} />
          <Route path="/ai/video/jobs" element={<Navigate replace to="/kairos/video/jobs" />} />
          <Route path="/library" element={<MediaLibrary />} />
          <Route path="/post/:id" element={<PostDetail />} />
          <Route path="/saved" element={<SavedPosts />} />
          <Route path="/users" element={<UserSearch />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:username" element={<ProfileByUsername />} />
          <Route path="/users/:id" element={<Profile />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:userId" element={<Messages />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/conversations/:conversationId" element={<Conversations />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<Settings onLogout={logout} />} />
          <Route path="/settings/profile" element={<ProfileSettings />} />
          <Route path="/settings/security" element={<ModerationCenter />} />
          <Route path="/moderation" element={<ModerationCenter />} />
          <Route path="/admin" element={<AdminCenter />} />
          {/* KRONOS-UIX-AUDIT: con sesión activa, cualquier ruta desconocida
              muestra una pantalla 404 con contexto y acciones en lugar de
              redirigir en silencio a /home (que ocultaba enlaces rotos). */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
      <Route
        path="*"
        element={<AnonymousPathRedirect />}
      />
    </Routes>
  );
}

/**
 * Ruta de entrada para usuarios SIN sesión: conserva la URL intentada para
 * que Auth pueda devolver al usuario a su destino tras iniciar sesión
 * (paridad con ProtectedRoute, que ya hace esto con state.from).
 */
function AnonymousPathRedirect() {
  const location = useLocation();
  return <Navigate replace to="/login" state={{ from: location }} />;
}
export default function App() {
  if (["/design-preview", "/design-preview/", "/design-preview/wordmark", "/design-preview/wordmark/"].includes(window.location.pathname)) {
    return <Suspense fallback={<p>Cargando identidad orbital…</p>}><WordmarkPreview /></Suspense>;
  }
  return (
    <QueryProvider>
      <MotionProvider>
        <BrowserRouter>
          <ToastProvider>
            <ConfirmProvider>
              <AppContent />
            </ConfirmProvider>
          </ToastProvider>
        </BrowserRouter>
      </MotionProvider>
    </QueryProvider>
  );
}

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

// Code-splitting por ruta (C-3): el bundle inicial ya no arrastra las ~35
// pantallas. Cada pantalla viaja en su propio chunk bajo demanda.
const Auth = lazy(() => import("./features/auth/Auth"));
const ForgotPassword = lazy(() => import("./features/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./features/auth/ResetPassword"));
const VerifyEmail = lazy(() => import("./features/auth/VerifyEmail"));
const ImageGenerator = lazy(() => import("./features/image-ai/ImageGenerator"));
const ScriptGenerator = lazy(() => import("./features/script-ai/ScriptGenerator"));
const VideoGenerator = lazy(() => import("./features/video-ai/VideoGenerator"));
const VideoJobs = lazy(() => import("./features/video-ai/VideoJobs"));
const AICenter = lazy(() => import("./features/ai/AICenter"));
const KairosHistory = lazy(() => import("./features/ai/KairosHistory"));
const MediaLibrary = lazy(() => import("./features/ai/MediaLibrary"));
const SocialPage = lazy(() => import("./features/social/SocialPage"));
const PostDetail = lazy(() => import("./features/social/PostDetail"));
const SavedPosts = lazy(() => import("./features/social/SavedPosts"));
const UserSearch = lazy(() => import("./features/users/UserSearch"));
const Profile = lazy(() => import("./features/users/Profile"));
const ProfileByUsername = lazy(() => import("./features/users/ProfileByUsername"));
const Messages = lazy(() => import("./features/messages/Messages"));
const Conversations = lazy(() => import("./features/messages/Conversations"));
const Notifications = lazy(() => import("./features/notifications/Notifications"));
const CreatePost = lazy(() => import("./features/social/CreatePost"));
const CreateHub = lazy(() => import("./features/social/CreateHub"));
const Circles = lazy(() => import("./features/social/Circles"));
const Orbits = lazy(() => import("./features/social/Orbits"));
const OrbitFeed = lazy(() => import("./features/social/OrbitFeed"));
const Channels = lazy(() => import("./features/social/Channels"));
const VerticalFeed = lazy(() => import("./features/social/vertical/VerticalFeed"));
const Capsules = lazy(() => import("./features/capsules/Capsules"));
const Pulse = lazy(() => import("./features/pulse/Pulse"));
const Analytics = lazy(() => import("./features/analytics/Analytics"));
const Settings = lazy(() => import("./features/settings/Settings"));
const ProfileSettings = lazy(() => import("./features/settings/ProfileSettings"));
const ModerationCenter = lazy(() => import("./features/moderation/ModerationCenter"));
const AdminCenter = lazy(() => import("./features/admin/AdminCenter"));
const Onboarding = lazy(() => import("./features/onboarding/Onboarding"));
const AppLayout = lazy(() => import("./layouts/AppLayout"));
const NotFound = lazy(() => import("./routes/NotFound"));
import ProtectedRoute from "./routes/ProtectedRoute";
import { api, subscribeToApiSession } from "./services/apiClient";
import {
  clearSession,
  getToken,
  getUser,
  hasSessionHint,
  isTokenExpired,
  SESSION_CLEAR_REASONS,
} from "./services/authStorage";
import { renewSession } from "./services/apiClient";
import {
  connectSocket,
  disconnectSocket,
  onSocketAuthError,
  updateSocketToken
} from "./services/socket";
import { ToastProvider, useToast } from "./components/feedback/ToastProvider";
import { ConfirmProvider } from "./components/feedback/ConfirmProvider";
import ErrorBoundary from "./components/feedback/ErrorBoundary";
import Spinner from "./components/ui/Spinner";
import QueryProvider from "./app/QueryProvider";
import MotionProvider from "./app/MotionProvider";
import { useQueryClient } from "@tanstack/react-query";

function RouteFallback() {
  return (
    <section className="page" aria-label="Cargando pantalla">
      <div className="k-feed-state">
        <Spinner size="lg" label="Cargando…" />
      </div>
    </section>
  );
}

/** Cada pantalla lazy va aislada: un crash solo tumba su ruta (C-4). */
function Screen({ children }) {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

function AppContent() {
  const { showToast } = useToast();
  const [user, setUser] = useState(getUser);
  // `ready` distingue "sin sesión" de "sesión aún validándose" (M-4).
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();
  const userRef = useRef(user);
  userRef.current = user;

  // El caché de datos está ligado a la sesión: cuando la sesión termina
  // (logout, 401 irrecuperable, hidratación fallida) se limpia por
  // completo para que el siguiente inicio nunca herede datos del
  // usuario anterior.
  useEffect(() => {
    if (!user) queryClient.clear();
  }, [user, queryClient]);
  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        // Un 401 de login/registro no representa una sesión vencida. Solo
        // cerramos y avisamos cuando ya existía una sesión autenticada.
        if (error.response?.status === 401 && getToken()) {
          clearSession(SESSION_CLEAR_REASONS.unauthorized);
          disconnectSocket();
          setUser(null);
          showToast("Tu sesión terminó. Inicia sesión nuevamente.", { tone: "error" });
        }
        return Promise.reject(error);
      },
    );
    return () => api.interceptors.response.eject(interceptor);
  }, [showToast]);
  useEffect(() => {
    let active = true;

    async function hydrate() {
      try {
        // KRONOS-UI-007 + A-1: el access vive en memoria (vacía al
        // recargar) y el refresh en cookie httpOnly. Si hay hint de
        // sesión pero no token usable, se intenta UN refresh silencioso;
        // si falla, la sesión terminó de verdad.
        if ((!getToken() || isTokenExpired()) && hasSessionHint()) {
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
      } finally {
        if (active) setReady(true);
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

  // Al renovarse el access token, el socket se re-autentica con el nuevo
  // (antes seguía con el token viejo hasta recargar la página).
  useEffect(() => subscribeToApiSession((event) => {
    if (event?.type === "refreshed" && userRef.current) {
      const token = getToken();
      if (token) updateSocketToken(token);
    }
  }), []);

  // El socket corta sus reintentos ante AUTH_*: aquí se intenta UNA
  // renovación y, si falla, se cierra la sesión con aviso.
  useEffect(() => onSocketAuthError(async () => {
    if (!userRef.current) return;
    try {
      const renewed = await renewSession();
      const token = getToken();
      if (renewed && token) {
        updateSocketToken(token);
        return;
      }
    } catch {
      // La sesión local se cierra igual abajo.
    }
    clearSession(SESSION_CLEAR_REASONS.expired);
    disconnectSocket();
    setUser(null);
    showToast("Tu sesión terminó. Inicia sesión nuevamente.", { tone: "error" });
  }), [showToast]);
  async function logout() {
    try {
      // La cookie del refresh la adjunta el navegador; el servidor la
      // revoca y la limpia. Sin cuerpo: no hay token en JS que enviar.
      await api.post("/auth/logout", {});
    } catch {
      /* la sesión local se limpia igual */
    }
    clearSession(SESSION_CLEAR_REASONS.logout);
    disconnectSocket();
    setUser(null);
  }

  if (!ready) {
    return (
      <section className="page" aria-label="Iniciando Kronos">
        <div className="k-feed-state">
          <Spinner size="lg" label="Iniciando Kronos…" />
        </div>
      </section>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate replace to="/home" />
          ) : (
            <Screen><Auth onLogin={setUser} initialMode="login" /></Screen>
          )
        }
      />
      <Route
        path="/register"
        element={
          user ? (
            <Navigate replace to="/home" />
          ) : (
            <Screen><Auth onLogin={setUser} initialMode="register" /></Screen>
          )
        }
      />
      <Route
        path="/forgot-password"
        element={user ? <Navigate replace to="/home" /> : <Screen><ForgotPassword /></Screen>}
      />
      <Route
        path="/reset-password"
        element={user ? <Navigate replace to="/home" /> : <Screen><ResetPassword /></Screen>}
      />
      <Route
        path="/verify-email"
        element={<Screen><VerifyEmail /></Screen>}
      />
      <Route
        path="/"
        element={<Navigate replace to={user ? "/home" : "/login"} />}
      />
      <Route element={<ProtectedRoute user={user} ready={ready} />}>
        <Route path="/onboarding" element={<Screen><Onboarding /></Screen>} />
        <Route element={<Screen><AppLayout user={user} /></Screen>}>
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
          <Route path="/capsules" element={<Capsules />} />
          <Route path="/pulse" element={<Pulse />} />
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
        </Route>
      </Route>
      <Route
        path="*"
        element={<Screen><NotFound /></Screen>}
      />
    </Routes>
  );
}
export default function App() {
  return (
    <QueryProvider>
      <MotionProvider>
        <BrowserRouter>
          <ToastProvider>
            <ConfirmProvider>
              <ErrorBoundary>
                <AppContent />
              </ErrorBoundary>
            </ConfirmProvider>
          </ToastProvider>
        </BrowserRouter>
      </MotionProvider>
    </QueryProvider>
  );
}

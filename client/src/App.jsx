import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Auth from "./features/auth/Auth";
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
import Settings from "./features/settings/Settings";
import ProfileSettings from "./features/settings/ProfileSettings";
import ModerationCenter from "./features/moderation/ModerationCenter";
import AdminCenter from "./features/admin/AdminCenter";
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
import { renewSession } from "./services/apiClient";
import { connectSocket, disconnectSocket } from "./services/socket";
import { ToastProvider, useToast } from "./components/feedback/ToastProvider";
import QueryProvider from "./app/QueryProvider";
import { useQueryClient } from "@tanstack/react-query";
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
  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        // Un 401 de login/registro no representa una sesión vencida. Solo
        // cerramos y avisamos cuando ya existía una sesión autenticada.
        if (error.response?.status === 401 && getToken()) {
          clearSession();
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
        <Route element={<AppLayout user={user} />}>
          <Route path="/home" element={<SocialPage />} />
          <Route path="/feed" element={<SocialPage />} />
          <Route path="/social" element={<SocialPage />} />
          <Route path="/explore" element={<UserSearch />} />
          <Route path="/search" element={<UserSearch />} />
          <Route path="/create" element={<CreatePost />} />
          <Route path="/kairos" element={<AICenter />} />
          <Route path="/kairos/image" element={<ImageGenerator />} />
          <Route path="/kairos/video" element={<VideoGenerator />} />
          <Route path="/kairos/script" element={<ScriptGenerator />} />
          <Route path="/kairos/history" element={<KairosHistory />} />
          <Route path="/ai" element={<AICenter />} />
          <Route path="/ai/image" element={<ImageGenerator />} />
          <Route path="/ai/script" element={<ScriptGenerator />} />
          <Route path="/ai/video" element={<VideoGenerator />} />
          <Route path="/ai/video/jobs" element={<VideoJobs />} />
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
        element={<Navigate replace to={user ? "/home" : "/login"} />}
      />
    </Routes>
  );
}
export default function App() {
  return (
    <QueryProvider>
      <BrowserRouter>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </BrowserRouter>
    </QueryProvider>
  );
}

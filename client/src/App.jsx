import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import Auth from "./features/auth/Auth";
import NotFound from "./features/NotFound";
import RouteFallback from "./components/feedback/RouteFallback";

// FASE 8 (frontend) — división de código por ruta.
//
// Antes, App.jsx importaba las ~39 pantallas de forma estática: el bundle
// inicial incluía Kairos, analíticas, directos y el editor de vídeo aunque
// el usuario solo abriera el login. Ahora cada ruta se carga cuando se
// visita; solo el login y el 404 viajan en la entrada.
const ForgotPassword = lazy(() => import("./features/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./features/auth/ResetPassword"));
const VerifyEmail = lazy(() => import("./features/auth/VerifyEmail"));
// Páginas públicas de texto: documentos legales y estado del servicio. Viven
// fuera del árbol protegido porque quien aún no tiene cuenta tiene derecho a
// leer las condiciones antes de crearla.
const TerminosPage = lazy(() => import("./features/legal/TerminosPage"));
const PrivacidadPage = lazy(() => import("./features/legal/PrivacidadPage"));
const CookiesPage = lazy(() => import("./features/legal/CookiesPage"));
const StatusPage = lazy(() => import("./features/status/StatusPage"));
const AyudaPage = lazy(() => import("./features/help/AyudaPage"));
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
const StoryArchive = lazy(() => import("./features/social/stories/StoryArchive"));
const VerticalFeed = lazy(() => import("./features/social/vertical/VerticalFeed"));
const Capsules = lazy(() => import("./features/capsules/Capsules"));
const Pulse = lazy(() => import("./features/pulse/Pulse"));
const Live = lazy(() => import("./features/live/Live"));
const Analytics = lazy(() => import("./features/analytics/Analytics"));
const Settings = lazy(() => import("./features/settings/Settings"));
const ModerationCenter = lazy(() => import("./features/moderation/ModerationCenter"));
const AdminCenter = lazy(() => import("./features/admin/AdminCenter"));
const Onboarding = lazy(() => import("./features/onboarding/Onboarding"));
const ProjectsPage = lazy(() => import("./features/projects/ProjectsPage"));
const ProjectBoard = lazy(() => import("./features/projects/ProjectBoard"));
const TemplatesPage = lazy(() => import("./features/projects/TemplatesPage"));
const StudioPage = lazy(() => import("./features/ai/StudioPage"));
const AudioTools = lazy(() => import("./features/ai/AudioTools"));
const SupportPage = lazy(() => import("./features/users/SupportPage"));
import AppLayout from "./layouts/AppLayout";
import ProtectedRoute from "./routes/ProtectedRoute";
import AdminRoute from "./routes/AdminRoute";
import useAppSession from "./app/useAppSession";
import { ToastProvider } from "./components/feedback/ToastProvider";
import { ConfirmProvider } from "./components/feedback/ConfirmProvider";
import QueryProvider from "./app/QueryProvider";
import MotionProvider from "./app/MotionProvider";
const WordmarkPreview = lazy(() => import("./design-preview/wordmark/WordmarkPreview"));

/**
 * Alias heredado /u/:username -> /profile/:username.
 * Conserva el enlace guardado sin duplicar la pantalla del perfil.
 */
function UsernameAlias() {
  const { username } = useParams();
  return <Navigate replace to={`/profile/${username || ""}`} />;
}

/** Alias heredado /users/:id -> /profile/:id (el perfil resuelve ambos). */
function ProfileIdAlias() {
  const { id } = useParams();
  return <Navigate replace to={`/profile/${id || ""}`} />;
}

function AppContent() {
  const { user, setUser, logout } = useAppSession();
  return (
    <Suspense fallback={<RouteFallback />}>
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
      {/* Públicas por diseño: se leen sin sesión y sin redirigir al login. */}
      <Route path="/terminos" element={<TerminosPage />} />
      <Route path="/privacidad" element={<PrivacidadPage />} />
      <Route path="/cookies" element={<CookiesPage />} />
      <Route path="/estado" element={<StatusPage />} />
      <Route path="/ayuda" element={<AyudaPage />} />
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
          <Route path="/vertical" element={<VerticalFeed />} />
          {/* La bandeja de historias enlaza a /stories/archive desde siempre,
              pero la ruta no existía: el comodín final la redirigía a /home
              en silencio y el archivo personal era inalcanzable. */}
          <Route path="/stories/archive" element={<StoryArchive />} />
          <Route path="/historias" element={<Navigate replace to="/stories/archive" />} />
          <Route path="/capsules" element={<Capsules />} />
          <Route path="/pulse" element={<Pulse />} />
          <Route path="/live" element={<Live />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/kairos" element={<AICenter />} />
          <Route path="/kairos/image" element={<ImageGenerator />} />
          <Route path="/kairos/video" element={<VideoGenerator />} />
          <Route path="/kairos/script" element={<ScriptGenerator />} />
          <Route path="/kairos/studio" element={<StudioPage />} />
          <Route path="/kairos/audio" element={<AudioTools key="audio" />} />
          <Route path="/kairos/catalogs" element={<AudioTools key="catalogs" catalogo />} />
          <Route path="/kairos/history" element={<KairosHistory />} />
          <Route path="/kairos/video/jobs" element={<VideoJobs />} />
          <Route path="/ai" element={<Navigate replace to="/kairos" />} />
          <Route path="/ai/image" element={<Navigate replace to="/kairos/image" />} />
          <Route path="/ai/script" element={<Navigate replace to="/kairos/script" />} />
          <Route path="/ai/video" element={<Navigate replace to="/kairos/video" />} />
          <Route path="/ai/video/jobs" element={<Navigate replace to="/kairos/video/jobs" />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/plantillas" element={<TemplatesPage />} />
          <Route path="/projects/:projectId" element={<ProjectBoard />} />
          <Route path="/library" element={<MediaLibrary />} />
          <Route path="/post/:id" element={<PostDetail />} />
          <Route path="/saved" element={<SavedPosts />} />
          <Route path="/users" element={<Navigate replace to="/explore" />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:username" element={<ProfileByUsername />} />
          <Route path="/u/:username" element={<UsernameAlias />} />
          <Route path="/users/:id" element={<ProfileIdAlias />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:userId" element={<Messages />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/conversations/:conversationId" element={<Conversations />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<Settings onLogout={logout} />} />
          <Route path="/settings/profile" element={<Navigate replace to="/settings#privacy" />} />
          <Route path="/settings/security" element={<Navigate replace to="/moderation" />} />
          <Route path="/moderation" element={<ModerationCenter />} />
          <Route path="/admin" element={<AdminRoute user={user}><AdminCenter /></AdminRoute>} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/support/:userId" element={<SupportPage />} />
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
    </Suspense>
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

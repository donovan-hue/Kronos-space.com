# KRONOS SPACE, Fase 00: auditoría

## Estado de la base

- Frontend: React 19 + Vite + React Router 7, organizado por features.
- Backend: Node.js + Express + MongoDB/Mongoose + JWT + Socket.IO.
- Cliente HTTP: Axios dentro de las features y servicios existentes.
- IA: módulos separados para imágenes, video, scripts y chat.
- Social: posts, comentarios, likes, usuarios, mensajes y notificaciones.
- Rama de trabajo: `feature/design-system`, creada desde `main`.

## Mapa actual resumido

| Área | Ruta actual | Componente / módulo | API o integración |
|---|---|---|---|
| Auth | raíz sin sesión | `features/auth/Auth` | `/api/auth` |
| Social | `/`, `/social` | `features/social/SocialPage` | `/api/posts` |
| Crear | `/create-post` | `features/social/CreatePost` | `/api/posts` |
| Usuarios | `/users`, `/users/:id` | `features/users` | `/api/users` |
| Perfil | `/profile` | `features/users/Profile` | `/api/users` |
| Mensajes | `/messages` | `features/messages/Messages` | `/api/messages` + Socket.IO |
| Notificaciones | `/notifications` | `features/notifications/Notifications` | `/api/notifications` |
| IA | `/ai/*` | `features/ai`, `image-ai`, `video-ai`, `script-ai` | `/api/ai/*` |
| Configuración | `/settings` | `features/settings/Settings` | endpoints existentes por verificar |

## Hallazgos de arquitectura

1. La autenticación y la expiración JWT ya están centralizadas en `App.jsx` mediante Axios interceptor.
2. Socket.IO ya se conecta desde `client/src/services/socket.js`; no se debe crear un segundo cliente.
3. El servidor ya monta auth, users, posts, messages, notifications e IA, y conserva `GET /health`.
4. La navegación actual vive dentro de `App.jsx` y necesita pasar a un layout global en fases posteriores.
5. El CSS actual contiene variables y componentes reutilizables, pero también conserva temas cobre/rosa y reglas duplicadas que deben consolidarse gradualmente.
6. Las rutas objetivo del plan no existen todavía como conjunto coherente, especialmente `/home`, `/feed`, `/explore`, `/search`, `/create`, `/kairos/*`, `/profile/:username`, `/settings/profile` y `/admin`.

## Criterio para las siguientes fases

Conservar features, servicios y endpoints existentes; consolidar tokens y componentes antes de migrar rutas. No se agregan módulos fuera del alcance del plan.

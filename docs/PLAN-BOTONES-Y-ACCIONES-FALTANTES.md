# PLAN DE TRABAJO — Botones y acciones faltantes (kronos-integration)

**Fecha:** 2026-09-18
**Skill ejecutada:** `kronos-integration` + apoyo de `kronos-code-reviewer`
**Método:** validación real de cada cadena `Pantalla → Componente → Hook → Service → API → Route → Controller → DB`
**Regla aplicada:** *"Un botón visual sin funcionalidad real NO cuenta como terminado"* — y su inverso: *una acción que el usuario espera y no tiene botón, es una pantalla PARTIAL.*

---

## 1. RESUMEN EJECUTIVO

| Pantalla | Estado | Motivo principal |
|---|---|---|
| Landing / Auth (`/login`) | **PARTIAL** | Solo 2 acciones; faltan botones de la primera impresión (ver §2) |
| Feed (`/home`) | CONNECTED (con huecos) | Acciones existen pero composer limitado |
| Crear publicación (`/create`) | **PARTIAL** | ❌ No se puede publicar solo una foto; ❌ sin centrar/recortar/filtros |
| Perfil (`/profile`) | **PARTIAL** | Muchos botones faltantes (ver §4) |
| Explorar / Buscar | CONNECTED | Falta paginación "ver más" por scope |
| Guardados | CONNECTED | — |
| Detalle de post | CONNECTED | Falta botón Compartir (sí existe en feed) |
| Mensajes / Grupos | CONNECTED | — |
| Notificaciones | CONNECTED | — |
| Configuración | CONNECTED (con 1 acción muerta) | Preferencia "Apariencia" se guarda pero **nunca se aplica** |
| Kairos AI (imagen/video/guion) | CONNECTED | — |

**Hallazgo de código muerto:** `client/src/features/social/components/PostCard.jsx` no se importa en ninguna parte (componente huérfano; el feed usa un PostCard interno duplicado en `SocialPage.jsx`).

---

## 2. PANTALLA 1 — LANDING / AUTH (`Auth.jsx`)

**Lo que hay hoy:** logo, título, 2 botones (Iniciar sesión / Crear cuenta), formulario con mostrar/ocultar contraseña, recordar sesión y ¿olvidaste tu contraseña?

**Botones/acciones que FALTAN:**

| # | Falta | Cadena a construir | Prioridad |
|---|---|---|---|
| A1 | Enlaces de **Términos y Privacidad** (pie de la tarjeta) | Frontend + páginas estáticas `/terms`, `/privacy` (rutas públicas nuevas) | Alta |
| A2 | Botón **"Explorar como invitado"** o sección de presentación (qué es Kronos, capturas, CTA) — hoy la landing no vende nada | Frontend + endpoint público opcional de feed destacado | Media |
| A3 | **Selector de idioma** (la preferencia ya existe en Settings pero no en la landing) | Frontend (estado local + persistencia) | Baja |
| A4 | **Fuerza de contraseña** en registro (indicador visual) | Frontend puro | Media |
| A5 | Botón **reenviar verificación** tras registrarse (hoy solo aparece dentro de Settings) | Ya existe `POST /auth/...` (authService.requestEmailVerification) → solo UI | Media |
| A6 | **Aviso de correo no verificado** al iniciar sesión con CTA | Frontend, usa `user.emailVerified` que ya viene del backend | Media |

---

## 3. CREAR PUBLICACIÓN (`CreatePost.jsx`) — el bloqueo que reportaste

**Confirmado con evidencia:**

1. ❌ **No puedes publicar solo una foto.** El botón *Publicar* está `disabled={!content.trim()}` y el backend (`POST /api/posts`) responde `400 "La publicación está vacía"` si no hay texto. **La foto sube bien** (`POST /api/posts/media/upload` funciona), pero sin texto no hay publicación → percepción de "no puedo subir/publicar".
2. ❌ **No puedes centrar la foto.** La vista previa usa `objectFit: cover` fijo, sin control de encuadre.
3. ❌ **No hay filtros ni edición** (recorte, rotación, zoom, brillo, etc.).
4. ❌ Solo **1 imagen** por post; el modelo `Post.media` soporta `type: "video"` pero el middleware `upload.js` solo acepta JPG/PNG/WebP → **subir video es imposible** aunque el feed ya sabe renderizar `<video>`. Contrato inconsistente.

**Plan (orden de ejecución):**

| # | Tarea | Alcance | Prioridad |
|---|---|---|---|
| C1 | **Permitir post solo-imagen**: backend acepta `content` vacío si `media.url` existe; frontend habilita *Publicar* con foto sin texto | `posts.routes.js` (POST y PATCH) + `CreatePost.jsx` + `postsService.js` | 🔴 Crítica |
| C2 | **Editor de imagen básico**: recorte/encuadre (arrastrar para centrar), zoom, rotación, proporción (1:1, 4:5, 16:9). Canvas nativo, sin dependencias pesadas | Nuevo componente `ImageEditor.jsx` + integración en composer y en avatar/portada | 🔴 Crítica |
| C3 | **Filtros**: normal, B/N, sepia, contraste, brillo, saturación, viñeta (CSS filters → export canvas) | Dentro de `ImageEditor.jsx` | 🟠 Alta |
| C4 | **Selector de encuadre en preview** (cover/contain + posición focal) para quien no quiera editar | `CreatePost.jsx` | 🟠 Alta |
| C5 | **Múltiples imágenes** (carrusel, máx 4) | Modelo `Post.media` → array, rutas, feed, migración compatible | 🟡 Media |
| C6 | **Video upload real** (MP4/WebM máx 50MB) para cerrar la inconsistencia contrato/UI | `upload.js`, `posts.routes.js`, composer | 🟡 Media |
| C7 | Botones de composer estándar: **emoji picker**, contador visible ✅ (ya está), **audiencia del post** (público/seguidores) | Composer + campo `visibility` en Post | 🟡 Media |
| C8 | Borrador: botón **"Guardar y salir"** + autosave cada 30s | `CreatePost.jsx` (drafts API ya existe ✅) | 🟢 Baja |

---

## 4. PERFIL (`Profile.jsx`) — "muchísimos detalles"

**Lo que ya funciona (verificado):** seguir/dejar de seguir, mensaje, silenciar, bloquear, reportar, subir avatar, subir portada, editar nombre/bio, tabs de actividad, like/guardar/repost/editar/eliminar posts.

**Botones/acciones que FALTAN:**

| # | Falta | Cadena a construir | Prioridad |
|---|---|---|---|
| P1 | **Seguidores / Siguiendo clicables** — hoy son texto muerto; no existe pantalla ni endpoint de listas | `GET /api/users/:id/followers` + `GET /:id/following` (paginados) + modal/pantalla con botón seguir en cada fila | 🔴 Crítica |
| P2 | **Recortar/centrar avatar y portada al subir** (mismo `ImageEditor` de C2) — hoy la imagen se sube tal cual y se recorta sola con `objectFit` | Reusar C2 | 🔴 Crítica |
| P3 | Botón **"Editar perfil"** como acción principal visible en el header (hoy el formulario está siempre expandido abajo, ocupa media pantalla) → convertir a modal/panel colapsable | `Profile.jsx` refactor UI | 🟠 Alta |
| P4 | **Compartir perfil** (copiar enlace / share nativo) | Frontend puro (`navigator.share`) | 🟠 Alta |
| P5 | Botón **Compartir en cada post del perfil** (el feed lo tiene, el perfil no) | `Profile.jsx` | 🟠 Alta |
| P6 | **Campos de perfil faltantes**: sitio web, ubicación, fecha de nacimiento, pronombres | `User.js` + `PATCH /users/me` + formulario | 🟡 Media |
| P7 | Quitar campo **"Avatar (URL)"** del formulario (confuso; ya hay botón de subida) o moverlo a "avanzado" | `Profile.jsx` | 🟡 Media |
| P8 | Botones **eliminar avatar / eliminar portada** | `DELETE /users/me/avatar`, `/users/me/cover` + UI | 🟡 Media |
| P9 | Reemplazar `window.confirm` en eliminar post / repost / cerrar sesión por **diálogo propio** consistente con el diseño | Componente `ConfirmDialog.jsx` global | 🟡 Media |
| P10 | **Fecha de registro** visible ("Miembro desde…") — el backend ya devuelve `createdAt` | Frontend puro | 🟢 Baja |
| P11 | Indicador y botón sobre foto de portada **"Cambiar portada"** al hacer hover (hoy hay que bajar al formulario) | Frontend puro | 🟢 Baja |

---

## 5. RESTO DE PANTALLAS — huecos menores detectados

| # | Pantalla | Falta | Prioridad |
|---|---|---|---|
| R1 | Configuración | La preferencia **"Apariencia" (oscura/sistema) se guarda pero jamás se aplica** — no hay ningún código que lea `preferences.appearance`. Acción muerta → implementar theme switcher real o retirar el control | 🟠 Alta |
| R2 | Detalle de post | Falta botón **Compartir** (sí existe en el feed) | 🟡 Media |
| R3 | Explorar | Falta botón **"Ver más resultados"** por scope (el backend ya devuelve `hasMore`) | 🟡 Media |
| R4 | Feed | El PostCard duplicado: unificar `SocialPage.jsx#PostCard` con `components/PostCard.jsx` huérfano (eliminar el muerto) | 🟢 Baja |
| R5 | TopBar | El avatar muestra inicial aunque el usuario tenga foto — usar `user.avatar` real | 🟢 Baja |

---

## 6. ORDEN DE EJECUCIÓN PROPUESTO (sprints)

**Sprint 1 — Desbloqueo de publicación (C1, C2, C4, P2)**
El flujo foto → encuadrar → publicar (con o sin texto) queda completo end-to-end.

**Sprint 2 — Perfil de verdad (P1, P3, P4, P5, P7, P9)**
Listas de seguidores, edición en modal, compartir, diálogos propios.

**Sprint 3 — Filtros y multimedia (C3, C5, C6)**
Filtros de imagen, carrusel, video.

**Sprint 4 — Primera pantalla y pulido (A1–A6, R1–R5, P6, P8, P10, P11, C7, C8)**

**Criterio de cierre por tarea (según skill):** cada botón nuevo debe tener endpoint real verificado, estados loading/success/error, actualización optimista donde aplique, y no romper consumidores existentes. *No se declara terminado sin evidencia.*

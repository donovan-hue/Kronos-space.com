# KRONOS × React Hook Form + Zod — Sistema uniforme de formularios (Fase 3)

**Fecha:** 2026-09-19
**Rama:** `arena/01a0baf9-kronos-space-com`
**Alcance:** client/ únicamente. Sin cambios de endpoints ni de backend.

## 1. Auditoría de formularios (18 archivos con `<form>`)

| Formulario | Validación antes | Decisión |
| --- | --- | --- |
| Auth (login/registro) | Solo `required` HTML + coincidencia de contraseñas manual | **Migrado a RHF+Zod** |
| ForgotPassword | Solo `required` HTML | **Migrado** |
| ResetPassword | Chequeos manuales (min 8, coincidencia) | **Migrado** |
| Perfil — diálogo editar | Chequeos manuales (>100, >500) | **Migrado** |
| Kairos — ImageGenerator | Solo `required`/maxLength HTML | **Migrado** |
| Kairos — VideoGenerator | Solo `required`/maxLength HTML | **Migrado** |
| Kairos — ScriptGenerator (13 inputs) | Sin validación real de enums/duración | **Migrado** (mayor ganancia) |
| CreatePost | Validación equivalente ya implementada (servicio + backend + 3 specs e2e) | **Sin migrar la UI**; su validación ahora usa el esquema Zod compartido en `postsService` |
| Settings / ProfilePrivacy | Toggles con persistencia inmediata; no hay validación que unificar | Sin cambios (documentado) |
| ReportDialog / Comments / MessageComposer / grupos | Un solo campo, validado en servicio/backend | Sin cambios |

Regla aplicada (instrucción 2): RHF+Zod solo donde no existía solución
equivalente. CreatePost conserva su máquina de estados de media/borradores
— reescribirla no aporta validación y arriesgaba los specs existentes.

## 2. Esquemas Zod — única fuente de verdad (`src/schemas/index.js`)

Cada regla refleja el contrato REAL del backend (auditado en `server/`):

| Campo | Regla (backend) | Esquema |
| --- | --- | --- |
| username | 3-30, `/^[a-z0-9_]+$/` (User.js + users.routes) | `usernameField` |
| email | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, ≤254 | `emailField` |
| password | ≥8 (register y reset-password) | `passwordField` |
| displayName | ≤100 (users.routes PATCH) | `profileSchema` |
| bio | ≤500 | `profileSchema` |
| avatar | ≤2000 | `profileSchema` |
| contenido de post | ≤5000, "contenido o media" | `postCreateSchema` |
| comentario | no vacío, ≤1000 | `commentSchema` |
| prompt imagen | obligatorio, ≤4000; negativePrompt ≤2000 | `imagePromptSchema` |
| prompt video | obligatorio, ≤4000 | `videoPromptSchema` |
| script | enums type/genre/format, duración 1-180 entera, tono ≤100, audiencia ≤200, prompt obligatorio | `scriptSchema` (+ `SCRIPT_TYPES/GENRES/FORMATS` exportados) |

Mensajes en español, claros, bajo cada campo (`role="alert"`, clase
`k-field-error`). La validación nativa del navegador se desactiva
(`noValidate`) para que gobierne Zod.

## 3. Cambios por archivo

- `src/schemas/index.js` (nuevo): todos los esquemas reutilizables.
- `Auth.jsx`: RHF con resolver dinámico (login vs registro). Flujo Google,
  landing y toggles de visibilidad intactos. **Fix del fallo real encontrado
  en auditoría**: el registro ya nunca rompe por "remember is not defined".
- `ForgotPassword.jsx`, `ResetPassword.jsx`: RHF + errores por campo;
  verificación de token de URL intacta.
- `Profile.jsx`: diálogo de edición con RHF (hidratación vía `reset()` desde
  el caché de TanStack; subida de avatar/portada actualiza el formulario).
- `ImageGenerator/VideoGenerator/ScriptGenerator`: RHF + Zod; "Reutilizar"
  del historial y `reusePrompt` llenan el formulario vía `setValue/reset`.
- `postsService.js`: `createPost`/`createComment` validan con los esquemas
  compartidos (mismos mensajes que siempre; ahora el límite de 1000 del
  comentario también se aplica en el cliente, igual que el backend).
- `styles/design-system.css`: `.k-field-error` (plata KRONOS).

## 4. Validaciones (todas verdes)

| Validación | Resultado |
| --- | --- |
| `npm run lint` | ✓ |
| `npm run build` | ✓ |
| `npm run test:client` | ✓ 15 node + 65 vitest (56 previos + 9 nuevos `forms-validation.spec.jsx`) |
| `npm run test:server` | ✓ 47 pass / 0 fail |
| Esquemas (smoke Node) | ✓ 13/13 casos |

Tests nuevos: registro vacío/mismatch/válido (payload exacto al backend),
restablecimiento (mínimo, coincidencia, envío con token), edición de perfil
(bio >500 bloquea sin llamar a la API), generadores Kairos (prompt
obligatorio, duración 1-180, payload completo) y esquema compartido de
publicaciones/comentarios.

## 5. Guía rápida

```jsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@/schemas";

const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(loginSchema),
});

<form onSubmit={handleSubmit(onValid)} noValidate>
  <input {...register("email")} />
  {errors.email && <p className="k-field-error" role="alert">{errors.email.message}</p>}
</form>
```

Reglas: formulario nuevo → esquema en `src/schemas/index.js` + RHF; nunca
duplicar en `useState` lo que Zod valida; los límites los dicta el backend.

# KRONOS FRONTEND

## Identidad

**Nombre:** `kronos-frontend`
**Proyecto:** Kronos Space
**Ruta:** `.agents/skills/kronos-frontend/SKILL.md`
**Tipo:** Frontend Architecture & Development Skill
**Estado:** Producción

---

## 1. PROPÓSITO

Esta skill controla todo el desarrollo, integración, refactorización y mantenimiento del frontend de **Kronos Space**.

Su responsabilidad es garantizar que el frontend:

* esté conectado al backend real;
* utilice las APIs existentes;
* respete los contratos de datos;
* mantenga una arquitectura modular;
* tenga manejo correcto de estados;
* gestione autenticación;
* gestione errores;
* soporte comunicación en tiempo real;
* gestione multimedia;
* mantenga las pantallas conectadas;
* sea responsive;
* sea mantenible;
* sea seguro;
* esté preparado para producción.

El frontend nunca debe implementar lógica ficticia para simular funcionalidades que deben provenir del backend.

---

# 2. REGLA PRINCIPAL

Antes de modificar una parte del frontend:

1. localizar el componente;
2. localizar sus dependencias;
3. identificar el endpoint/backend relacionado;
4. verificar el modelo de datos recibido;
5. verificar autenticación requerida;
6. verificar estados de carga/error/vacío;
7. modificar únicamente lo necesario;
8. comprobar que las rutas existentes continúan funcionando.

No crear implementaciones paralelas de una funcionalidad que ya exista.

---

# 3. ARQUITECTURA

El frontend debe mantenerse organizado por responsabilidades.

Estructura conceptual:

```text
Frontend
├── Pages / Screens
├── Components
├── Layouts
├── Services
├── API
├── Authentication
├── State
├── Hooks
├── Socket
├── Uploads
├── AI
├── Utils
├── Constants
└── Styles
```

Cada módulo debe tener una responsabilidad clara.

Evitar:

```text
components/GiantComponent.jsx
```

con cientos de responsabilidades mezcladas.

Preferir:

```text
components/
├── common/
├── layout/
├── feed/
├── profile/
├── comments/
├── messages/
├── notifications/
├── ai/
└── forms/
```

La estructura exacta debe adaptarse a la estructura real existente del repositorio y no reemplazarse innecesariamente.

---

# 4. PRINCIPIOS DE IMPLEMENTACIÓN

Todo código frontend debe cumplir:

* modularidad;
* reutilización;
* tipado cuando el proyecto lo soporte;
* validación;
* manejo de errores;
* estados explícitos;
* componentes pequeños;
* nombres descriptivos;
* separación de responsabilidades;
* ausencia de código muerto;
* ausencia de mocks permanentes;
* ausencia de credenciales hardcodeadas.

No introducir:

```javascript
console.log(...)
```

como mecanismo permanente de debugging en producción.

No introducir:

```javascript
TODO
FIXME
placeholder
mock temporal
fake response
```

como sustituto de una implementación real.

---

# 5. CONFIGURACIÓN

Las URLs y configuraciones externas deben utilizar variables de entorno.

Nunca:

```javascript
const API_URL = "https://mi-api.com";
```

Preferir la configuración definida por el proyecto:

```javascript
const API_URL = import.meta.env.VITE_API_URL;
```

o el mecanismo equivalente utilizado por el framework existente.

Validar las variables críticas al iniciar la aplicación.

Ejemplo:

```javascript
export function getApiUrl() {
    const apiUrl = import.meta.env.VITE_API_URL;

    if (!apiUrl) {
        throw new Error("VITE_API_URL is not configured");
    }

    return apiUrl.replace(/\/+$/, "");
}
```

No exponer secretos en variables públicas del frontend.

---

# 6. COMUNICACIÓN CON BACKEND

Toda comunicación HTTP debe centralizarse.

No distribuir llamadas `fetch()` arbitrarias por todos los componentes.

Preferir:

```text
services/
api/
```

para encapsular la comunicación.

Ejemplo:

```javascript
export async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(endpoint, {
            credentials: "include",
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(
                data?.message || `Request failed with status ${response.status}`
            );
        }

        return data;
    } catch (error) {
        throw new Error(
            error instanceof Error
                ? error.message
                : "Unexpected API error"
        );
    }
}
```

La implementación definitiva debe respetar el sistema de autenticación real del backend.

---

# 7. ESTADOS DE UI

Toda pantalla que dependa de datos remotos debe contemplar como mínimo:

```text
loading
success
empty
error
```

Ejemplo:

```javascript
if (loading) {
    return <LoadingState />;
}

if (error) {
    return <ErrorState message={error} />;
}

if (!items.length) {
    return <EmptyState />;
}

return <ItemsList items={items} />;
```

No mostrar una pantalla vacía mientras una petición todavía está ejecutándose.

---

# 8. AUTENTICACIÓN

El frontend debe consumir el sistema de autenticación existente.

Debe existir una separación clara entre:

```text
Public Routes
Protected Routes
Authenticated User State
Session State
```

Las pantallas privadas no deben depender únicamente de una variable visual como:

```javascript
isLoggedIn === true
```

La autenticación debe estar sincronizada con el backend.

Cuando una sesión expire:

1. detectar respuesta de autorización;
2. limpiar el estado correspondiente;
3. evitar loops de peticiones;
4. redirigir al flujo de autenticación correspondiente.

Nunca almacenar secretos innecesarios en:

```text
localStorage
sessionStorage
URL
query parameters
```

---

# 9. PROTECCIÓN DE RUTAS

Las rutas privadas deben tener protección centralizada.

Conceptualmente:

```text
Router
├── Public
│   ├── Login
│   └── Register
│
└── Protected
    ├── Home
    ├── Explore
    ├── Profile
    ├── Messages
    ├── Notifications
    ├── Create
    ├── Settings
    └── AI
```

No duplicar validaciones de autenticación en cada pantalla.

---

# 10. NAVEGACIÓN

La navegación debe utilizar el router real del proyecto.

Evitar:

```javascript
window.location.href = ...
```

para navegación interna cuando exista router.

Las rutas deben tener nombres consistentes y centralizados cuando sea posible.

Ejemplo conceptual:

```javascript
export const ROUTES = {
    HOME: "/",
    EXPLORE: "/explore",
    PROFILE: "/profile",
    MESSAGES: "/messages",
    NOTIFICATIONS: "/notifications",
    CREATE: "/create",
    SETTINGS: "/settings",
};
```

No crear rutas duplicadas para la misma pantalla.

---

# 11. COMPONENTES

Los componentes deben recibir información mediante props o mecanismos de estado definidos.

Evitar componentes que dependan directamente de múltiples fuentes globales sin necesidad.

Ejemplo:

```javascript
function PostCard({
    post,
    onLike,
    onComment,
}) {
    return (
        <article>
            {/* UI */}
        </article>
    );
}
```

Las operaciones deben delegarse:

```text
Component
   ↓
Hook / Service
   ↓
API
   ↓
Backend
```

No:

```text
Component
   ↓
300 líneas de lógica
   ↓
fetch
   ↓
socket
   ↓
state
   ↓
UI
```

---

# 12. HOOKS

La lógica reutilizable debe extraerse a hooks.

Ejemplo:

```javascript
function usePosts() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    async function loadPosts() {
        try {
            setLoading(true);
            setError(null);

            const result = await fetchPosts();
            setPosts(result);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Unable to load posts"
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadPosts();
    }, []);

    return {
        posts,
        loading,
        error,
        reload: loadPosts,
    };
}
```

Los hooks no deben contener UI.

---

# 13. FORMULARIOS

Todos los formularios deben validar:

* campos requeridos;
* formato;
* longitud;
* valores permitidos;
* estado de envío;
* errores del backend;
* éxito.

Nunca permitir múltiples envíos accidentales.

Ejemplo:

```javascript
async function handleSubmit(event) {
    event.preventDefault();

    if (submitting) {
        return;
    }

    try {
        setSubmitting(true);
        setError(null);

        await submitForm(formData);
    } catch (error) {
        setError(
            error instanceof Error
                ? error.message
                : "Unable to submit form"
        );
    } finally {
        setSubmitting(false);
    }
}
```

---

# 14. MULTIMEDIA

Las cargas de imágenes y videos deben utilizar el sistema backend/storage definido por Kronos.

El frontend debe controlar:

```text
selección
↓
validación
↓
preview
↓
upload
↓
progress
↓
success/error
```

Validar:

* tipo MIME;
* tamaño;
* extensión;
* existencia del archivo.

Nunca confiar únicamente en la validación del frontend.

La validación definitiva pertenece al backend.

---

# 15. SOCKET.IO

La comunicación en tiempo real debe estar centralizada.

No crear múltiples conexiones Socket.IO innecesarias desde diferentes componentes.

Arquitectura:

```text
Socket Manager
      ↓
Connection
      ↓
Events
      ↓
Hooks / State
      ↓
Components
```

Los listeners deben limpiarse correctamente.

Ejemplo:

```javascript
useEffect(() => {
    if (!socket) {
        return;
    }

    const handleMessage = (message) => {
        setMessages((current) => [
            ...current,
            message,
        ]);
    };

    socket.on("message", handleMessage);

    return () => {
        socket.off("message", handleMessage);
    };
}, [socket]);
```

Evitar listeners duplicados.

---

# 16. MENSAJES EN TIEMPO REAL

El flujo debe contemplar:

```text
load conversation
        ↓
connect socket
        ↓
receive messages
        ↓
update state
        ↓
render
        ↓
cleanup
```

Los mensajes no deben depender únicamente de eventos Socket.IO.

El historial inicial debe provenir del backend.

---

# 17. NOTIFICACIONES

Las notificaciones deben poder:

* cargar historial;
* mostrar estado de lectura;
* recibir eventos en tiempo real cuando corresponda;
* actualizar el contador;
* manejar errores;
* evitar duplicados.

La lógica de notificaciones debe permanecer separada de la UI.

---

# 18. FEED

El Feed debe funcionar mediante datos reales.

Debe contemplar:

```text
fetch posts
↓
render posts
↓
like
↓
comment
↓
refresh/update state
```

No almacenar permanentemente publicaciones falsas.

Los cambios optimistas deben poder revertirse si el backend rechaza la operación.

---

# 19. PERFIL

El perfil debe separar:

```text
Profile data
Posts
Followers / following
Actions
Loading
Errors
```

No cargar toda la aplicación para obtener únicamente información del perfil.

---

# 20. EXPLORAR

La pantalla Explore debe utilizar los endpoints reales definidos por el backend.

Las búsquedas deben:

* validar entradas;
* controlar debounce cuando sea necesario;
* manejar loading;
* manejar resultados vacíos;
* manejar errores;
* evitar peticiones duplicadas.

---

# 21. CREAR PUBLICACIÓN

El flujo debe ser:

```text
Create
↓
Validate
↓
Upload media
↓
Create publication
↓
Backend response
↓
Update UI
↓
Navigate / refresh
```

No considerar una publicación creada hasta recibir confirmación del backend.

---

# 22. COMENTARIOS

Los comentarios deben:

* cargar desde backend;
* validar contenido;
* enviar al endpoint real;
* actualizar el estado;
* manejar errores;
* evitar duplicados.

Las operaciones deben respetar los permisos establecidos por backend.

---

# 23. CONFIGURACIÓN

La pantalla de configuración no debe modificar directamente datos internos.

Debe utilizar endpoints oficiales del backend.

Las modificaciones deben:

```text
validate
↓
submit
↓
receive backend result
↓
update local state
```

---

# 24. IA

Las interfaces de IA deben comunicarse con los servicios backend correspondientes.

El frontend no debe colocar API keys de proveedores de IA.

Nunca:

```javascript
const OPENAI_KEY = "...";
```

Ni:

```javascript
const GOOGLE_API_KEY = "...";
```

Las claves permanecen exclusivamente en backend.

El frontend solamente consume los endpoints autorizados.

---

# 25. SEPARACIÓN DE LAS TRES ÁREAS

Kronos mantiene tres áreas principales:

```text
SOCIAL
AI MEDIA
AI SCRIPT
```

Cada área debe conservar su propia lógica visual y funcional.

No mezclar servicios ni componentes sin necesidad.

---

# 26. DISEÑO VISUAL

El frontend debe respetar el sistema visual establecido para Kronos.

## Base

Todas las pantallas:

* fondo negro profundo;
* diseño minimalista;
* bordes definidos;
* elementos de interfaz claramente delimitados;
* botones de apariencia consistente;
* tipografía coherente.

## Red social

Utilizar:

**Chrome espejo / plateado.**

## IA de imágenes y videos

Utilizar:

**Chrome cobre brillante.**

## IA de scripts

Utilizar:

**Chrome rosa.**

No introducir colores adicionales como identidad visual principal.

---

# 27. RESPONSIVE DESIGN

Toda pantalla debe funcionar correctamente en:

```text
mobile
tablet
desktop
```

Evitar dimensiones rígidas innecesarias.

Preferir:

```css
width: 100%;
max-width: ...;
```

y layouts adaptativos.

No solucionar problemas responsive mediante:

```css
overflow-x: hidden;
```

sin corregir la causa real.

---

# 28. ACCESIBILIDAD

Los elementos interactivos deben tener:

* labels;
* estados visibles;
* navegación mediante teclado cuando corresponda;
* texto alternativo para imágenes;
* botones semánticos;
* feedback de errores.

Evitar:

```html
<div onClick={...}>
```

cuando corresponda utilizar:

```html
<button>
```

---

# 29. MANEJO GLOBAL DE ERRORES

El frontend debe disponer de una estrategia centralizada para:

```text
API errors
Authentication errors
Network errors
Unexpected errors
Rendering errors
```

Los mensajes mostrados al usuario deben ser claros.

No mostrar:

```text
TypeError: Cannot read properties of undefined...
```

como mensaje principal al usuario.

Los detalles técnicos deben permanecer en mecanismos de diagnóstico apropiados.

---

# 30. RENDIMIENTO

Evitar:

* renders innecesarios;
* peticiones duplicadas;
* listeners duplicados;
* cargas de recursos innecesarias;
* componentes gigantes;
* dependencias innecesarias.

Utilizar lazy loading cuando aporte valor real.

Las optimizaciones deben basarse en problemas reales y no complicar innecesariamente el código.

---

# 31. SEGURIDAD FRONTEND

Nunca confiar en el frontend para autorizar operaciones.

El frontend puede ocultar UI:

```javascript
if (!canEdit) {
    return null;
}
```

pero la autorización real debe existir en backend.

Nunca almacenar:

```text
database credentials
JWT signing secrets
AI provider keys
private API keys
```

en el bundle frontend.

---

# 32. DEPENDENCIAS

Antes de instalar una dependencia:

1. comprobar si ya existe una solución interna;
2. revisar compatibilidad;
3. comprobar mantenimiento;
4. comprobar compatibilidad con la versión actual del proyecto;
5. instalar solamente si es necesaria.

No introducir librerías para solucionar problemas simples.

---

# 33. REFACTORIZACIÓN

Cuando exista código defectuoso:

1. localizar dependencias;
2. preservar contratos existentes;
3. extraer responsabilidades;
4. corregir errores;
5. eliminar duplicación;
6. comprobar imports;
7. comprobar rutas;
8. comprobar build.

No reescribir módulos completos sin necesidad.

---

# 34. INTEGRACIÓN BACKEND ↔ FRONTEND

Toda funcionalidad nueva debe seguir:

```text
Screen
  ↓
Component
  ↓
Hook
  ↓
Service
  ↓
API
  ↓
Backend Route
  ↓
Controller
  ↓
Model / Service
  ↓
Database
```

Para tiempo real:

```text
Screen
  ↓
Hook
  ↓
Socket Manager
  ↓
Socket.IO Server
```

Para multimedia:

```text
Screen
  ↓
Upload Component
  ↓
Upload Service
  ↓
Backend
  ↓
Storage
```

---

# 35. REGLA DE CONTRATOS

Nunca asumir una respuesta del backend.

Antes de consumir un endpoint verificar:

```text
method
URL
headers
authentication
request body
response body
status codes
error format
```

El frontend debe adaptarse al contrato real.

No modificar el contrato backend únicamente para facilitar un componente frontend sin necesidad arquitectónica.

---

# 36. VALIDACIÓN ANTES DE FINALIZAR

Después de modificar frontend ejecutar, según los scripts reales del proyecto:

```bash
npm install
npm run build
```

y las pruebas disponibles.

Comprobar:

```text
✓ imports
✓ exports
✓ routes
✓ components
✓ hooks
✓ API calls
✓ authentication
✓ socket listeners
✓ forms
✓ uploads
✓ responsive layout
✓ production build
```

---

# 37. CRITERIO DE TERMINADO

Una implementación frontend solamente se considera terminada cuando:

* compila;
* no contiene imports rotos;
* no contiene referencias inexistentes;
* utiliza backend real;
* maneja loading;
* maneja errores;
* maneja estados vacíos;
* respeta autenticación;
* respeta permisos;
* funciona con las rutas reales;
* no rompe funcionalidades existentes;
* mantiene la arquitectura modular;
* respeta el diseño visual de Kronos;
* genera build de producción correctamente.

---

# 38. REGLA DE CAMBIO MÍNIMO

Cuando una tarea afecte un archivo existente:

1. conservar código funcional;
2. modificar solamente lo necesario;
3. no eliminar funcionalidades relacionadas;
4. no duplicar componentes;
5. no crear archivos equivalentes;
6. mantener compatibilidad con el resto del sistema.

---

# 39. PROHIBICIONES

Esta skill no debe:

* crear APIs falsas;
* colocar API keys en frontend;
* crear mocks permanentes;
* duplicar servicios;
* duplicar sockets;
* duplicar rutas;
* saltarse autenticación;
* implementar autorización únicamente en frontend;
* introducir colores fuera del sistema visual principal;
* romper contratos backend;
* dejar código incompleto;
* dejar placeholders;
* ignorar errores de compilación.

---

# 40. OBJETIVO FINAL

El frontend de Kronos Space debe convertirse en una interfaz de producción completamente integrada con:

```text
Kronos Frontend
       │
       ├── Social Network
       │
       ├── AI Media
       │
       └── AI Script
              │
              ▼
        Kronos Backend
              │
        ┌─────┴─────┐
        ▼           ▼
    MongoDB      Services
```

La prioridad siempre será:

**arquitectura limpia → integración real → estabilidad → seguridad → experiencia de usuario → producción.**


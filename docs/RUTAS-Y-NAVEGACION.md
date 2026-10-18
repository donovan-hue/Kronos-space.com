# Rutas y navegación de Kronos Space

> Generado desde `client/src/lib/screenIndex.js` con `npm run docs:routes`. No editar las tablas a mano.

## Acceso visible a todas las funciones

- El enlace **Funciones** de la cabecera y **Todas las pantallas** del menú abren `/pantallas`.
- `/funciones` es un alias del directorio. Permite buscar por nombre, descripción, ruta, alias o área y filtrar por estado y área.
- Cada entrada tiene una ficha estable `/funciones/<id>`. Los IDs son explícitos: cambiar el título no cambia el enlace de la ficha.
- Las rutas con `:id`, `:userId`, `:username`, `:orbitId` o `:conversationId` abren primero su ficha para pedir el recurso real; no se enlazan parámetros literales ni datos de ejemplo.
- Todas las páginas nuevas requieren sesión. La administración se identifica como restringida y su interfaz exige rol admin; el backend conserva la comprobación de rol contra la base de datos.
- Una ruta no acredita disponibilidad del proveedor: el audio muestra la configuración real; catálogos e historiales muestran errores, vacíos y reintentos sin datos de relleno.
- Abrir audio o apoyos no genera contenido ni crea transacciones. Esas operaciones requieren confirmación explícita. Los apoyos son créditos simbólicos, no pagos.

## Alcance del directorio

El directorio enumera **59 pantallas y funciones** de usuario/sistema en **7 áreas**: **54** tienen interfaz y **5** tienen solo ficha informativa. No es un listado de funciones JavaScript internas ni una garantía de que los proveedores externos estén configurados.

Las fichas de Proyectos, Versiones y comparación y Plantillas de formato indican que falta construir la herramienta. Federación y Webhooks y flujos son infraestructura/documentación: no se inventa un panel operativo.

## Entrar

Lo primero que ve alguien que llega.

| Función | Ruta definida | Acceso desde el directorio | Estado | Permiso |
|---|---|---|---|---|
| Entrada | `/` | `/` | A la vista | Público |
| Iniciar sesión | `/login` | `/login` | A la vista | Público |
| Crear cuenta | `/register` | `/register` | A la vista | Público |
| Recuperar contraseña | `/forgot-password` | `/forgot-password` | A la vista | Público |
| Restablecer contraseña | `/reset-password` | `/reset-password` | A la vista | Público |
| Verificar correo | `/verify-email` | `/verify-email` | A la vista | Público |
| Bienvenida | `/onboarding` | `/onboarding` | A la vista | Sesión |

## La red

El día a día: ver, publicar y conversar.

| Función | Ruta definida | Acceso desde el directorio | Estado | Permiso |
|---|---|---|---|---|
| Inicio | `/home` | `/home` | A la vista | Sesión |
| Pulso | `/pulse` | `/pulse` | Se puede apagar | Sesión |
| Vertical | `/vertical` | `/vertical` | Se puede apagar | Sesión |
| Explorar | `/explore` | `/explore` | A la vista | Sesión |
| Publicación | `/post/:id` | `/funciones/publicacion` | A la vista | Sesión |
| Centro de creación | `/create` | `/create` | A la vista | Sesión |
| Nueva publicación | `/create/post` | `/create/post` | A la vista | Sesión |
| Archivo de historias | `/stories/archive` | `/stories/archive` | A la vista | Sesión |
| Guardados | `/saved` | `/saved` | A la vista | Sesión |

## Comunidad

Donde la gente se junta: órbitas, círculos, canales y grupos.

| Función | Ruta definida | Acceso desde el directorio | Estado | Permiso |
|---|---|---|---|---|
| Órbitas | `/orbits` | `/orbits` | Se puede apagar | Sesión |
| Feed de una órbita | `/orbits/:orbitId` | `/funciones/feed-de-una-orbita` | A la vista | Sesión |
| Círculos | `/circles` | `/circles` | Se puede apagar | Sesión |
| Canales | `/channels` | `/channels` | Se puede apagar | Sesión |
| Conversaciones | `/conversations` | `/conversations` | A la vista | Sesión |
| Un grupo | `/conversations/:conversationId` | `/funciones/un-grupo` | A la vista | Sesión |
| Mensajes | `/messages` | `/messages` | A la vista | Sesión |
| Un mensaje directo | `/messages/:userId` | `/funciones/un-mensaje-directo` | A la vista | Sesión |
| En vivo | `/live` | `/live` | Se puede apagar | Sesión |
| Notificaciones | `/notifications` | `/notifications` | A la vista | Sesión |

## La persona

Identidad, ajustes y lo que se recibe.

| Función | Ruta definida | Acceso desde el directorio | Estado | Permiso |
|---|---|---|---|---|
| Perfil | `/profile` | `/profile` | A la vista | Sesión |
| Perfil de alguien | `/profile/:username` | `/funciones/perfil-de-alguien` | A la vista | Sesión |
| Perfil por identificador | `/users/:id` | `/funciones/perfil-por-identificador` | A la vista | Sesión |
| Buscar personas | `/users` | `/users` | A la vista | Sesión |
| Apoyar a un creador | `/support/:userId` | `/funciones/apoyar-a-un-creador` | A la vista | Sesión |
| Apoyos recibidos | `/support` | `/support` | A la vista | Sesión |
| Cápsulas | `/capsules` | `/capsules` | Se puede apagar | Sesión |
| Analítica | `/analytics` | `/analytics` | Se puede apagar | Sesión |
| Biblioteca de medios | `/library` | `/library` | A la vista | Sesión |

## Ajustes y control

Lo que se toca de vez en cuando, pero tiene que estar claro.

| Función | Ruta definida | Acceso desde el directorio | Estado | Permiso |
|---|---|---|---|---|
| Configuración | `/settings` | `/settings` | A la vista | Sesión |
| Ajustes de perfil | `/settings/profile` | `/settings/profile` | A la vista | Sesión |
| Ajustes de seguridad | `/settings/security` | `/settings/security` | A la vista | Sesión |
| Moderación | `/moderation` | `/moderation` | A la vista | Sesión |
| Administración | `/admin` | `/admin` | A la vista | Solo administradores |

## Kairos

El estudio: se produce y se publica en el mismo lugar.

| Función | Ruta definida | Acceso desde el directorio | Estado | Permiso |
|---|---|---|---|---|
| Kairos | `/kairos` | `/kairos` | A la vista | Sesión |
| Imagen | `/kairos/image` | `/kairos/image` | A la vista | Sesión |
| Video | `/kairos/video` | `/kairos/video` | A la vista | Sesión |
| Guion | `/kairos/script` | `/kairos/script` | A la vista | Sesión |
| Historial | `/kairos/history` | `/kairos/history` | A la vista | Sesión |
| Trabajos | `/kairos/video/jobs` | `/kairos/video/jobs` | A la vista | Sesión |
| Estudio de foto y video | `/kairos/studio` | `/kairos/studio` | A la vista | Sesión |
| Audio (locución) | `/kairos/audio` | `/kairos/audio` | Se puede apagar | Sesión |
| Voces y música | `/kairos/catalogs` | `/kairos/catalogs` | A la vista | Sesión |
| Proyectos | `/funciones/proyectos` | `/funciones/proyectos` | Ficha informativa · Próximamente | Sesión |
| Versiones y comparación | `/funciones/versiones-y-comparacion` | `/funciones/versiones-y-comparacion` | Ficha informativa · Próximamente | Sesión |
| Plantillas de formato | `/funciones/plantillas-de-formato` | `/funciones/plantillas-de-formato` | Ficha informativa · Próximamente | Sesión |

## Sistema

Navegación, herramientas del sistema e infraestructura documentada.

| Función | Ruta definida | Acceso desde el directorio | Estado | Permiso |
|---|---|---|---|---|
| Todas las pantallas | `/pantallas` | `/pantallas` | A la vista | Sesión |
| Mapa de navegación | `/mapa` | `/mapa` | A la vista | Sesión |
| Atajos de teclado | `/atajos` | `/atajos` | A la vista | Sesión |
| Búsqueda global | `/busqueda` | `/busqueda` | A la vista | Sesión |
| No encontrado | `/no-encontrado` | `/no-encontrado` | A la vista | Sesión |
| Federación | `/funciones/federacion` | `/funciones/federacion` | Ficha informativa · Fuera del alcance | Sesión |
| Webhooks y flujos | `/funciones/webhooks-y-flujos` | `/funciones/webhooks-y-flujos` | Ficha informativa · Fuera del alcance | Sesión |

## Alias conservados

| Alias | Destino |
|---|---|
| `/feed` | `/home` |
| `/social` | `/home` |
| `/search` | `/explore` |
| `/ai` | `/kairos` |
| `/ai/image` | `/kairos/image` |
| `/ai/script` | `/kairos/script` |
| `/ai/video` | `/kairos/video` |
| `/ai/video/jobs` | `/kairos/video/jobs` |
| `/historias` | `/stories/archive` |
| `/u/:username` | `/profile/:username` |

## Mantenimiento y comprobaciones

1. Añadir o actualizar la entrada en `screenIndex.js`, conservando el ID de las fichas existentes.
2. Registrar la ruta real en `App.jsx`, dentro de la guarda de sesión/rol apropiada. Si falta la herramienta, mantener su ficha informativa con estado explícito.
3. Añadir los accesos de navegación pertinentes en `navigation/model.jsx`; todos sus destinos deben existir en el router.
4. Ejecutar `npm run docs:routes` y las pruebas del cliente. `feature-routes.spec.jsx` comprueba cobertura bidireccional del router y del directorio, parámetros, permisos y este documento.

Documentación relacionada: [plano de interfaz](client/PLANO-INTERFAZ-KRONOS.md), [arquitectura de workflows](WORKFLOWS-ARQUITECTURA-KRONOS.md).

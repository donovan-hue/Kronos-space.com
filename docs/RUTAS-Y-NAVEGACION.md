# Rutas y navegación de Kronos Space

La ruta de todo, en texto. Es el mismo mapa que alimenta la pantalla
`/pantallas` (`client/src/lib/screenIndex.js`), así que documento y aplicación no se separan: si
cambia una ruta, cambian los dos.

Fecha: 13 de octubre de 2026, commit `0c75c53`. Los números de este documento salen del mapa
del código, no se escriben a mano: las pruebas comprueban que cuadren.

## 1. Cómo se lee

Cada pantalla tiene cuatro datos:

| Dato | Valores |
|---|---|
| Origen | Menú lateral · Botón en pantalla · Atajo de teclado · Solo escribiendo la dirección · Todavía no se puede llegar |
| Estado | A la vista · Escondido · Se puede apagar · Próximamente · Fuera del alcance |
| Ruta | Su dirección; vacía cuando todavía no tiene pantalla |
| Alias | Otros caminos que llevan al mismo lugar |

"Hoy" quiere decir el estado actual del código, sin adornos. La columna "Qué falta" es lo que
propongo para que todo quede definido y ordenado.

## 2. Resumen

| Medida | Número |
|---|---|
| Pantallas y funciones declaradas | 59 |
| Con dirección propia | 46 |
| A la vista (se llega y se entiende) | 28 |
| Escondidas (existen, no se encuentran) | 15 |
| Se pueden apagar por configuración | 8 |
| Próximamente (sin construir) | 6 |
| Fuera del alcance (declarado) | 2 |
| — Por dónde se llega — | |
| Desde el menú lateral | 24 |
| Con un botón en pantalla | 16 |
| Solo con atajo de teclado | 3 |
| Solo escribiendo la dirección | 9 |
| Todavía no se puede llegar | 7 |

## 3. Entrar

| Pantalla | Ruta | Origen | Estado | Qué falta |
|---|---|---|---|---|
| Entrada | `/` | Dirección | A la vista | Nada |
| Iniciar sesión | `/login` | Dirección | A la vista | Nada |
| Crear cuenta | `/register` | Botón | A la vista | Nada |
| Recuperar contraseña | `/forgot-password` | Botón | A la vista | Nada |
| Restablecer contraseña | `/reset-password` | Dirección | A la vista | Nada |
| Verificar correo | `/verify-email` | Dirección | A la vista | Nada |
| Bienvenida | `/onboarding` | Botón | Escondido | Decidir si se muestra después del alta; hoy depende del flujo |

## 4. La red

| Pantalla | Ruta | Origen | Estado | Qué falta |
|---|---|---|---|---|
| Inicio | `/home` | Menú | A la vista | Nada |
| Pulso | `/pulse` | Menú | Se puede apagar | Que avise cuando está apagado (ver punto 9) |
| Vertical | `/vertical` | Menú | Se puede apagar | Guardar a favoritos desde ahí |
| Explorar | `/explore` | Menú | A la vista | Buscar por etiqueta y por audio |
| Publicación | `/post/:id` | Botón | A la vista | Nada |
| Centro de creación | `/create` | Menú | A la vista | Botones visibles de "Publicación", "Encuesta" y "Evento" |
| Nueva publicación | `/create/post` | Botón | A la vista | Nada |
| Historias en curso | `/stories/archive` | Botón | Escondido | Entrada con nombre en el perfil ("Historias guardadas") |
| Guardados | `/saved` | Menú | A la vista | Nada |
| Colecciones privadas | dentro de Guardados | Botón | Escondido | Entrada propia con su nombre, o botón claro dentro de Guardados |

## 5. Comunidad

| Pantalla | Ruta | Origen | Estado | Qué falta |
|---|---|---|---|---|
| Órbitas | `/orbits` | Menú | Se puede apagar | Hoja de una página: qué es y en qué se diferencia de Círculos |
| Feed de una órbita | `/orbits/:orbitId` | Botón | A la vista | Nada |
| Círculos | `/circles` | Menú | Se puede apagar | Igual: explicar la diferencia con Órbitas |
| Canales | `/channels` | Menú | Se puede apagar | Igual: explicar la diferencia con Grupos |
| Conversaciones (grupos) | `/conversations` | Menú | A la vista | Reglas y moderación por grupo |
| Un grupo | `/conversations/:conversationId` | Botón | Escondido | Que se pueda compartir su enlace sin adivinar la dirección |
| Mensajes | `/messages` | Menú | A la vista | Nada |
| Un mensaje directo | `/messages/:userId` | Botón | A la vista | Nada |
| En vivo | `/live` | Menú | Se puede apagar | Invitados y guardado del directo |
| Notificaciones | `/notifications` | Menú | A la vista | Nada |

## 6. La persona

| Pantalla | Ruta | Origen | Estado | Qué falta |
|---|---|---|---|---|
| Perfil | `/profile` | Menú | A la vista | Nada |
| Perfil de alguien | `/profile/:username` | Botón | A la vista | Alias `/u/:username` para enlaces cortos |
| Perfil por identificador | `/users/:id` | Botón | Escondido | Es un camino interno; se deja, no se promociona |
| Buscar personas | `/users` | Botón | Escondido | Se confunde con Explorar: unificar o explicar |
| Apoyar a un creador | sin ruta | Botón | Escondido | Explicar qué es; hoy solo aparece en el perfil ajeno |
| Apoyos recibidos | sin ruta | Todavía no | Próximamente | Pantalla propia con el historial |
| Cápsulas | `/capsules` | Menú | Se puede apagar | Explicar en la primera visita |
| Analítica | `/analytics` | Menú | Se puede apagar | Decir qué mide y en qué periodo |
| Biblioteca de medios | `/library` | Menú | A la vista | Nada |

## 7. Ajustes y control

| Pantalla | Ruta | Origen | Estado | Qué falta |
|---|---|---|---|---|
| Configuración | `/settings` | Menú | A la vista | Nada |
| Ajustes de perfil | `/settings/profile` | Dirección | Escondido | Es un salto dentro de Configuración: dejar el salto y nombrarlo en el menú de la propia pantalla |
| Ajustes de seguridad | `/settings/security` | Dirección | Escondido | Igual |
| Moderación | `/moderation` | Menú | A la vista | Nada |
| Administración | `/admin` | Dirección | Escondido | Enlace visible para administradores |

## 8. Kairos

| Pantalla | Ruta | Origen | Estado | Qué falta |
|---|---|---|---|---|
| Kairos | `/kairos` | Menú | A la vista | Nada |
| Imagen | `/kairos/image` | Menú | A la vista | Semilla y variaciones, estilos guardados |
| Video | `/kairos/video` | Menú | A la vista | Nada |
| Guion | `/kairos/script` | Menú | A la vista | Convertir el guion en tomas |
| Historial | `/kairos/history` | Botón | Escondido | Está dentro del tablero; el botón ya existe: falta nombrarlo mejor |
| Trabajos | `/kairos/video/jobs` | Botón | Escondido | Decir qué se puede cancelar |
| Estudio de foto y video | sin ruta | Botón | Escondido | Abrirlo también desde Kairos, no solo al publicar (es la costura entre las dos aplicaciones) |
| Audio (locución) | sin ruta | Todavía no | Próximamente | Paso 2 del plan |
| Voces y música | sin ruta | Todavía no | Próximamente | Depende del catálogo del servidor (paso 1) |
| Proyectos | sin ruta | Todavía no | Próximamente | Paso 3 del plan |
| Versiones y comparación | sin ruta | Todavía no | Próximamente | Guardar cada corrida con su receta y su costo |
| Plantillas de formato | sin ruta | Todavía no | Próximamente | Paso 4 del plan |

## 9. Sistema

| Pantalla | Ruta | Origen | Estado | Qué falta |
|---|---|---|---|---|
| Todas las pantallas | `/pantallas` | Menú | A la vista | **Hecha en este cambio**: el índice buscable |
| Mapa de navegación | sin ruta | Tecla G | Escondido | Botón visible en la barra superior (en teléfono no hay tecla) |
| Atajos de teclado | sin ruta | Tecla ? | Escondido | Listarlos también en Configuración |
| Búsqueda global | sin ruta | Control+K | Escondido | Botón visible en teléfono |
| No encontrado | `*` | Dirección | A la vista | Nada |
| Federación | sin ruta | Dirección | Fuera del alcance | Ya está declarada: solo lectura, sin publicar desde fuera |
| Webhooks y flujos | sin ruta | Todavía no | Fuera del alcance | Decidir si son para el usuario o solo para administradores |

## 10. Alias (caminos viejos que siguen funcionando)

Estos no se anuncian, pero no se rompen: cualquier enlace compartido sigue llegando.

| Camino viejo | Llega a |
|---|---|
| `/feed` | `/home` |
| `/social` | `/home` |
| `/search` | `/explore` |
| `/ai` | `/kairos` |
| `/ai/image` | `/kairos/image` |
| `/ai/script` | `/kairos/script` |
| `/ai/video` | `/kairos/video` |
| `/ai/video/jobs` | `/kairos/video/jobs` |

## 11. Lo que se hizo en este cambio

1. `/pantallas`: el índice de todo, con buscador (sin acentos y con sinónimos: "cairos" encuentra
   Kairos) y filtros por estado. Es la respuesta a "quién sabe si están escondidas".
2. Entrada en el menú: **Todas las pantallas**, en el bloque Cuenta, con su icono. La sección y su
   etiqueta en la barra superior quedan declaradas en el modelo de navegación.
3. Las pantallas sin ruta **no se enlazan**: se muestran como ficha para que se sepa que existen,
   pero no hay enlaces que no lleven a ningún lado.
4. 11 pruebas nuevas del mapa y de la pantalla, incluida una que exige que el mapa y el menú no se
   separen.

## 12. Orden propuesto para cerrar la visibilidad

| Paso | Qué | Por qué primero |
|---|---|---|
| 1 | Botón del mapa de navegación y de la búsqueda global en la barra superior | Son las dos que hoy solo existen con teclado |
| 2 | Nombres claros para los escondidos que ya funcionan: colecciones, historias guardadas, apoyos, administración | Sin construir nada nuevo: solo ponerles puerta |
| 3 | Encuesta y Evento como botones en el Centro de creación | Hoy están dentro del compositor y nadie los busca ahí |
| 4 | Hoja de una página por cada idea que se confunde: Órbitas, Círculos, Canales, Grupos, Cápsulas, Pulso | Es lo que hace que el menú de 19 destinos se entienda |
| 5 | Aviso de funciones apagadas en Configuración | Hoy desaparecen del menú sin explicación |
| 6 | Abrir el estudio desde Kairos | Es la costura entre la red y el estudio |

## 13. Decisiones que siguen pendientes (tuyas)

- Renombrar rutas al español (como el proyecto de ejemplo) o dejarlas como están con alias.
- Media privada o pública por diseño.
- Borrar cuenta: construir o declarar que no se ofrece.
- Cuáles de las funciones de CapCut que dependen de proveedores quieres pagar (quitar fondo,
  estabilizar, voz sintética, traducción).

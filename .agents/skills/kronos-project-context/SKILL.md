---
name: kronos-project-context
description: >
  Contexto maestro de Kronos Space. Usar cuando una tarea
  implique comprender el alcance, arquitectura, aplicaciones,
  pantallas, reglas visuales, decisiones técnicas, estructura
  existente o plan de trabajo del proyecto. Esta Skill evita
  cambios de alcance, duplicación de funcionalidades y decisiones
  incompatibles con la arquitectura existente.

compatibility: >
  Kronos Space. Compatible con agentes de desarrollo que
  trabajen sobre el repositorio completo.

version: 1.0.0

tags:
  - kronos
  - context
  - architecture
  - project
  - scope
  - social-ai

---

# KRONOS PROJECT CONTEXT

## 1. Propósito

Esta Skill proporciona el contexto maestro que debe respetarse
al trabajar sobre Kronos Space.

Kronos Space es una plataforma compuesta por tres aplicaciones
principales integradas:

1. Red social.
2. Generación de imágenes y videos mediante IA.
3. Generación profesional de guiones mediante IA.

El objetivo de esta Skill es mantener coherencia entre todas las
partes del proyecto y evitar que un agente modifique el alcance,
arquitectura o comportamiento existente sin autorización.

---

# 2. Regla principal

## NO CAMBIAR EL ALCANCE

El alcance definido para Kronos Space es considerado fijo.

Un agente NO debe:

- inventar nuevas aplicaciones;
- eliminar aplicaciones existentes;
- cambiar el objetivo principal del proyecto;
- crear funcionalidades fuera del alcance;
- sustituir una tecnología existente sin necesidad;
- cambiar la arquitectura general por preferencia personal;
- eliminar código funcional solamente para simplificarlo;
- duplicar funcionalidades que ya existen;
- modificar contratos API sin revisar consumidores;
- cambiar el diseño visual principal;
- introducir colores principales nuevos;
- reorganizar masivamente el proyecto sin justificación.

Si una modificación parece necesaria para corregir un problema,
debe conservarse el alcance original.

---

# 3. Aplicaciones principales

Kronos está compuesto por tres áreas principales.

## APP 1 — RED SOCIAL

Incluye:

- Inicio / Feed.
- Explorar.
- Perfil.
- Publicaciones.
- Detalle de publicación.
- Comentarios.
- Likes.
- Crear publicación.
- Mensajes privados.
- Notificaciones.
- Configuración.
- Seguimiento de usuarios.

La red social utiliza:

- fondo negro profundo;
- estética minimalista;
- chrome espejo plateado;
- bordes marcados;
- botones tipo burbuja;
- elementos visuales limpios.

No introducir otros colores principales.

---

## APP 2 — IA MULTIMEDIA

Incluye las herramientas relacionadas con:

- generación de imágenes;
- generación de videos;
- procesamiento multimedia;
- generación mediante modelos de IA;
- gestión de resultados;
- integración frontend/backend.

Su identidad visual utiliza:

- fondo negro profundo;
- cobre chrome brillante;
- estética minimalista;
- bordes de apariencia metálica;
- elementos de interfaz limpios.

---

## APP 3 — IA DE GUIONES

Incluye:

- generación de guiones;
- estructura profesional;
- escenas;
- personajes;
- diálogos;
- desarrollo narrativo;
- generación asistida mediante IA;
- resultados profesionales para creadores.

Su identidad visual utiliza:

- fondo negro profundo;
- rosa chrome espejo;
- estética minimalista;
- bordes marcados;
- interfaz limpia.

---

# 4. Pantallas

Kronos tiene un objetivo de 18 pantallas.

Las pantallas deben conectarse con:

Frontend
↓
API
↓
Backend
↓
Base de datos / servicios externos

No crear pantallas duplicadas para resolver problemas
que deben solucionarse mediante rutas, componentes o servicios.

Cada pantalla debe tener una responsabilidad clara.

---

# 5. Arquitectura general

La arquitectura lógica del proyecto es:

```text
Kronos Space
│
├── Frontend
│   └── React
│       ├── páginas
│       ├── componentes
│       ├── navegación
│       └── consumo de API
│
├── Backend
│   └── Node.js / Express
│       ├── rutas
│       ├── middleware
│       ├── módulos
│       ├── autenticación
│       ├── lógica de negocio
│       └── servicios de IA
│
├── MongoDB Atlas
│   └── datos persistentes
│
├── Render
│   └── backend / servicios
│
└── Vercel
    └── frontend
````

La comunicación debe mantenerse explícita y trazable.

---

# 6. Frontend

El frontend se encuentra dentro de:

```text
client/
```

La aplicación utiliza React.

Las funcionalidades deben mantenerse organizadas por dominio.

Ejemplos:

```text
client/src/features/auth/
client/src/features/social/
client/src/features/users/
client/src/features/ai/
client/src/features/image-ai/
client/src/features/video-ai/
client/src/features/script-ai/
```

Antes de crear un componente nuevo:

1. comprobar si ya existe;
2. comprobar si puede reutilizarse;
3. comprobar si pertenece a una feature existente;
4. evitar duplicación.

---

# 7. Backend

El backend se encuentra dentro de:

```text
server/
```

La estructura utiliza módulos funcionales.

Ejemplos:

```text
server/src/modules/posts/
server/src/modules/users/
server/src/modules/
```

Las rutas API deben mantenerse agrupadas por dominio.

No crear endpoints duplicados.

Antes de modificar un endpoint:

1. revisar su implementación;
2. revisar quién lo consume;
3. revisar el modelo asociado;
4. revisar autenticación;
5. revisar respuestas existentes;
6. comprobar posibles regresiones.

---

# 8. Base de datos

La base de datos principal es MongoDB mediante Mongoose.

Las modificaciones de modelos deben ser compatibles con los datos
existentes siempre que sea posible.

Antes de modificar un schema:

1. revisar el modelo completo;
2. revisar rutas que lo utilizan;
3. revisar consultas;
4. revisar `populate`;
5. revisar índices;
6. revisar frontend consumidor.

No eliminar campos existentes sin comprobar sus dependencias.

---

# 9. Autenticación

Kronos utiliza autenticación mediante token.

El frontend mantiene:

```text
kronos_token
kronos_user
```

Las llamadas protegidas deben enviar:

```text
Authorization: Bearer <token>
```

No guardar secretos ni API keys en el frontend.

Nunca colocar credenciales directamente en archivos de código.

---

# 10. API

La API utiliza una base configurable mediante:

```text
VITE_API_URL
```

El fallback local utilizado actualmente es:

```text
http://localhost:5000/api
```

Los consumidores frontend deben utilizar la configuración existente
y no crear URLs duplicadas.

Antes de modificar una respuesta API:

1. localizar los consumidores;
2. verificar propiedades utilizadas;
3. mantener compatibilidad;
4. actualizar todos los consumidores afectados si realmente
   es necesario.

---

# 11. Publicaciones

Las publicaciones son parte central de la red social.

Una publicación contiene conceptualmente:

```text
_id
content
author
likes
comments
createdAt
updatedAt
```

La API puede normalizar datos para frontend, incluyendo:

```text
likesCount
liked
```

No crear una segunda representación incompatible de las
publicaciones.

---

# 12. Comentarios

Los comentarios pertenecen a las publicaciones.

Un comentario contiene conceptualmente:

```text
user
content
createdAt
```

El frontend debe utilizar la API existente.

No implementar almacenamiento local como sustituto de MongoDB.

---

# 13. Likes

Los likes son gestionados por backend.

El frontend debe considerar como fuente de verdad la respuesta
del servidor.

No fabricar artificialmente una lista de likes únicamente para
mostrar el contador.

El estado visual debe derivarse de:

```text
liked
likesCount
```

cuando estén disponibles.

---

# 14. Perfiles y usuarios

Los usuarios tienen funcionalidades relacionadas con:

* perfil;
* búsqueda;
* seguidores;
* siguiendo;
* publicaciones;
* avatar;
* nombre visible;
* biografía.

Antes de modificar usuarios:

1. revisar `User`;
2. revisar rutas;
3. revisar autenticación;
4. revisar frontend;
5. revisar relaciones `followers/following`.

---

# 15. IA

Las funcionalidades de IA forman parte del producto principal.

No mezclar arbitrariamente:

* IA de imágenes;
* IA de video;
* IA de guiones.

Cada una debe conservar su dominio.

La infraestructura común de IA puede compartirse cuando
realmente exista código reutilizable.

No duplicar clientes de proveedores innecesariamente.

---

# 16. Mensajería

La mensajería privada debe funcionar como comunicación entre
usuarios autenticados.

Cuando se implemente tiempo real se utilizará la infraestructura
Socket.IO existente.

No sustituir Socket.IO por otra tecnología sin autorización.

---

# 17. Tiempo real

Socket.IO forma parte de la arquitectura prevista para:

* mensajes privados;
* eventos en tiempo real;
* futuras notificaciones que realmente necesiten tiempo real.

No crear una segunda infraestructura WebSocket paralela.

---

# 18. Multimedia

Las funciones multimedia deben separar:

```text
entrada
↓
procesamiento
↓
generación
↓
almacenamiento
↓
resultado
```

No guardar archivos grandes directamente en MongoDB salvo que
la arquitectura existente lo requiera explícitamente.

---

# 19. Deploy

La arquitectura de producción contempla:

```text
GitHub
   │
   ├── Vercel
   │   └── Frontend
   │
   └── Render
       └── Backend
            │
            └── MongoDB Atlas
```

No cambiar el proveedor de infraestructura sin autorización.

---

# 20. Plan maestro

El proyecto se desarrolla mediante un plan de trabajo definido.

Las tareas deben ejecutarse progresivamente.

Cuando una tarea ya fue cerrada:

* no repetirla;
* no rehacerla;
* no convertirla en una auditoría permanente;
* continuar con la siguiente tarea.

Si una tarea posterior depende de una tarea anterior,
utilizar la implementación existente.

---

# 21. Regla contra auditorías repetitivas

Una revisión solamente debe realizarse cuando:

* exista una modificación;
* exista un error;
* exista una dependencia nueva;
* exista una incompatibilidad;
* el usuario solicite explícitamente una auditoría.

No detener continuamente la implementación para volver a auditar
todo el proyecto.

La prioridad es:

```text
Implementar
↓
Probar
↓
Revisar
↓
Continuar
```

---

# 22. Regla de modificación de archivos

Antes de modificar un archivo:

1. leer su contenido actual;
2. identificar dependencias;
3. conservar funcionalidad existente;
4. realizar el cambio mínimo necesario;
5. revisar el resultado completo.

Cuando sea necesario reemplazar un archivo completo, entregar
el archivo completo y definitivo.

No proporcionar instrucciones ambiguas como:

```text
"cambia unas líneas"
```

cuando un archivo completo puede entregarse.

---

# 23. Regla de compatibilidad

Cada cambio debe responder:

```text
¿Qué archivo cambia?
¿Qué consume este archivo?
¿Qué endpoint utiliza?
¿Qué modelo utiliza?
¿Qué otros archivos dependen de él?
```

No considerar un archivo aislado cuando el cambio afecta
una cadena de comunicación.

---

# 24. Regla de no duplicación

Antes de crear:

* ruta;
* componente;
* función;
* modelo;
* servicio;
* middleware;
* página;

buscar primero si ya existe una implementación equivalente.

Preferir reutilizar y extender sobre duplicar.

---

# 25. Regla de seguridad

Nunca:

* exponer secretos;
* introducir API keys en frontend;
* imprimir tokens en logs;
* desactivar autenticación para solucionar errores;
* desactivar validaciones;
* confiar en datos enviados por el cliente;
* eliminar middleware de seguridad sin justificación.

---

# 26. Regla de errores

Los errores deben:

* ser controlados;
* tener mensajes claros;
* registrarse apropiadamente en backend;
* no exponer información sensible;
* producir respuestas consistentes.

El frontend debe manejar:

```text
loading
success
error
empty state
```

cuando corresponda.

---

# 27. Regla visual

Todas las interfaces deben conservar:

```text
NEGRO PROFUNDO
MINIMALISMO
```

Identidad por aplicación:

```text
SOCIAL
└── CHROME ESPEJO PLATEADO

IA MULTIMEDIA
└── COBRE CHROME BRILLANTE

IA GUIONES
└── ROSA CHROME ESPEJO
```

No introducir un sistema de colores principal diferente.

---

# 28. Regla de UX

Las interfaces deben:

* ser claras;
* funcionar en móvil;
* mostrar estados de carga;
* mostrar errores;
* impedir acciones duplicadas;
* tener botones comprensibles;
* conservar navegación coherente.

No sacrificar funcionalidad por estética.

---

# 29. Regla de implementación

Cuando se solicite una funcionalidad:

```text
1. Identificar dominio.
2. Identificar archivos afectados.
3. Revisar implementación existente.
4. Implementar backend si corresponde.
5. Implementar frontend si corresponde.
6. Conectar ambos.
7. Verificar datos.
8. Revisar regresiones.
9. Continuar.
```

No implementar únicamente la interfaz cuando la funcionalidad
requiera backend.

No implementar únicamente backend cuando la pantalla necesite
consumirlo.

---

# 30. Regla de finalización

Una funcionalidad se considera terminada solamente cuando:

```text
Frontend
   ↓
API
   ↓
Backend
   ↓
Base de datos / servicio
```

funciona de extremo a extremo cuando corresponda.

Un botón visual sin funcionalidad real NO cuenta como terminado.

Una ruta backend sin consumidor cuando la funcionalidad requiere
frontend NO cuenta como terminada.

---

# 31. Prioridad de decisiones

Cuando existan varias opciones técnicas, utilizar este orden:

1. Compatibilidad con el proyecto existente.
2. Seguridad.
3. Correctitud.
4. Mantenibilidad.
5. Simplicidad.
6. Rendimiento.
7. Estética.

No sacrificar los puntos anteriores por una preferencia personal.

---

# 32. Regla para cambios de arquitectura

Una modificación arquitectónica solamente debe hacerse cuando:

* existe un problema real;
* la arquitectura actual no puede soportarlo;
* existe una vulnerabilidad;
* existe una incompatibilidad;
* o el usuario autoriza el cambio.

Antes de realizar un cambio arquitectónico importante,
explicar brevemente:

```text
Problema
Solución
Archivos afectados
Riesgo
```

No cambiar arquitectura por moda tecnológica.

---

# 33. Guardian / sistema de supervisión

El sistema Guardian/Kairos forma parte del proyecto,
pero su integración definitiva se realizará al final.

No adelantar su implementación durante tareas anteriores
si no es necesaria para completar la funcionalidad actual.

El Guardian debe conservarse como una fase final de:

* supervisión;
* alertas;
* registro;
* control.

No utilizarlo como excusa para bloquear el desarrollo normal.

---

# 34. Criterio de calidad

Todo código nuevo debe aspirar a:

* funcionar;
* ser legible;
* ser seguro;
* integrarse con el código existente;
* evitar duplicación;
* manejar errores;
* ser mantenible.

No agregar complejidad que no aporte una función real.

---

# 35. Comportamiento obligatorio del agente

Antes de actuar:

```text
ENTENDER
↓
LOCALIZAR
↓
REVISAR
↓
IMPLEMENTAR
↓
VERIFICAR
```

No:

```text
SUPONER
↓
MODIFICAR
↓
ROMPER
```

Si una información necesaria no está disponible,
buscarla dentro del repositorio antes de inventarla.

---

# 36. Regla final

Kronos Space debe evolucionar como un único sistema.

Cada modificación debe conservar:

```text
ALCANCE
ARQUITECTURA
SEGURIDAD
DATOS
API
UX
DISEÑO
COMPATIBILIDAD
```

La prioridad es terminar el proyecto de forma funcional,
conectada y estable.

No cambiar el alcance.

No duplicar.

No romper lo existente.

No rehacer tareas ya terminadas.

Continuar siempre desde el estado real del repositorio.



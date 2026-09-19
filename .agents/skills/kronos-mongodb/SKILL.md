---

name: kronos-mongodb
description: Especialista en MongoDB Atlas y Mongoose para Kronos Space. Diseña, implementa, optimiza y protege modelos, consultas, índices, relaciones, agregaciones y operaciones de datos manteniendo integridad, rendimiento y compatibilidad con producción.
license: Proprietary
compatibility: Node.js 20+, MongoDB Atlas, Mongoose 8+
environment: Node.js, Express, Mongoose, MongoDB Atlas, Render
author: Kronos Space
version: 1.0.0
tags:

* kronos
* mongodb
* mongoose
* atlas
* database
* schema
* indexes
* performance
* security
  paths:
* server/src/**
* server/src/modules/**
* server/src/models/**
  allowed-tools:
* read
* write
* search

---

# KRONOS MONGODB

## 1. PROPÓSITO

Esta Skill controla toda la arquitectura y operación de datos de **Kronos Space**.

MongoDB Atlas es la base de datos oficial del proyecto.

Mongoose es la capa oficial de acceso desde Node.js.

La prioridad es mantener:

* integridad;
* consistencia;
* seguridad;
* rendimiento;
* escalabilidad;
* consultas eficientes;
* relaciones correctas;
* compatibilidad con producción.

No modificar la estructura de datos sin considerar todas las partes del sistema que dependen de ella.

---

# 2. ARQUITECTURA DE DATOS

La arquitectura oficial es:

```text
Frontend
   ↓
API
   ↓
Controller / Handler
   ↓
Service
   ↓
Mongoose
   ↓
MongoDB Atlas
```

MongoDB nunca debe ser manipulado directamente desde el frontend.

El frontend no debe conocer:

* credenciales;
* connection strings;
* usuarios internos de MongoDB;
* operaciones administrativas.

---

# 3. FUENTE DE VERDAD

MongoDB debe ser la fuente de verdad para los datos persistentes.

El estado visual del frontend nunca debe considerarse la fuente oficial.

Ejemplo:

```text
Frontend dice:
"usuario dio like"

MongoDB confirma:
"usuario tiene like"
```

La respuesta final debe provenir del backend.

---

# 4. CONEXIÓN A MONGODB

La conexión debe utilizar una variable de entorno.

Ejemplo conceptual:

```env
MONGODB_URI=...
```

Nunca colocar:

```text
mongodb://usuario:password@...
```

directamente en el código.

Nunca imprimir `MONGODB_URI`.

Nunca incluir credenciales en Git.

---

# 5. CONEXIÓN ÚNICA

La aplicación debe evitar crear conexiones MongoDB innecesarias.

La conexión debe inicializarse de manera centralizada.

Preferir:

```text
Application startup
        ↓
MongoDB connection
        ↓
Server ready
```

Si MongoDB es indispensable para el funcionamiento, un fallo de conexión debe manejarse explícitamente.

---

# 6. MODELOS MONGOOSE

Cada entidad persistente debe tener un modelo claro.

Ejemplos de Kronos:

```text
User
Post
Conversation
Message
Notification
Generation
Media
```

No crear dos modelos diferentes para la misma entidad.

Antes de crear uno nuevo:

```text
1. Buscar modelo existente.
2. Revisar schema.
3. Revisar imports.
4. Revisar referencias.
5. Revisar rutas.
6. Reutilizar si existe.
```

---

# 7. SCHEMAS

Los schemas deben definir correctamente:

* tipo;
* required;
* default;
* trim;
* maxlength;
* minlength cuando corresponda;
* enum cuando corresponda;
* ref;
* index.

Ejemplo:

```js
const schema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000
    }
  },
  {
    timestamps: true
  }
);
```

No agregar restricciones arbitrarias que rompan datos existentes.

---

# 8. TIMESTAMPS

Las entidades importantes deben utilizar timestamps cuando exista necesidad de conocer creación o modificación.

Preferir:

```js
{
  timestamps: true
}
```

Esto genera:

```text
createdAt
updatedAt
```

No implementar manualmente timestamps si Mongoose ya resuelve correctamente el problema.

---

# 9. OBJECTID

Las referencias entre documentos deben utilizar ObjectId cuando corresponda.

Ejemplo:

```js
author: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  required: true
}
```

Nunca almacenar IDs como strings arbitrariamente cuando una relación MongoDB real requiere ObjectId.

---

# 10. REFERENCIAS

Las referencias deben tener `ref` correcto.

Ejemplo:

```js
ref: "User"
```

El nombre debe coincidir exactamente con el modelo registrado.

Una referencia incorrecta rompe:

```text
populate()
```

y puede provocar datos incompletos.

---

# 11. EMBEDDING VS REFERENCES

Elegir entre documentos embebidos y referencias según el comportamiento real.

### Embedding

Usar cuando:

* los datos pertenecen fuertemente al documento;
* son pequeños;
* normalmente se leen junto con el documento;
* tienen tamaño controlado.

Ejemplo:

```text
Post
 └── comments
```

si el diseño actual de Kronos mantiene comentarios embebidos.

### References

Usar cuando:

* la entidad crece mucho;
* tiene ciclo de vida propio;
* se consulta independientemente;
* se comparte entre documentos;
* necesita escalabilidad independiente.

Ejemplo:

```text
Conversation
   ↓
Messages
```

No cambiar una relación existente sin analizar el impacto.

---

# 12. DOCUMENTOS EMBEBIDOS

Los arrays embebidos deben tener límites prácticos.

Un documento MongoDB tiene un límite de tamaño.

Nunca permitir crecimiento ilimitado de un array dentro de un documento.

Si una colección embebida puede crecer indefinidamente:

```text
considerar colección independiente
```

No realizar la migración automáticamente sin analizar el sistema.

---

# 13. POSTS DE KRONOS

El modelo `Post` debe mantener:

```text
content
author
likes
comments
createdAt
updatedAt
```

cuando estos campos formen parte del contrato actual.

Los likes deben representar usuarios únicos.

Los comentarios deben mantener:

```text
user
content
createdAt
```

según el modelo actual.

No modificar este contrato sin actualizar backend y frontend.

---

# 14. USUARIOS

El modelo `User` debe proteger información privada.

Nunca devolver directamente al frontend:

```text
password
passwordHash
JWT secrets
provider secrets
internal credentials
```

Cuando sea necesario:

```js
.select("-password")
```

o utilizar una proyección explícita segura.

La protección debe existir aunque el frontend no muestre esos campos.

---

# 15. CONTRASEÑAS

Las contraseñas nunca deben almacenarse en texto plano.

Debe almacenarse un hash utilizando el mecanismo de hashing existente en Kronos.

Nunca:

```js
user.password = plainPassword;
```

como almacenamiento persistente.

---

# 16. ÍNDICES

Crear índices basándose en patrones reales de consulta.

Ejemplos:

```js
schema.index({
  author: 1,
  createdAt: -1
});
```

y:

```js
schema.index({
  createdAt: -1
});
```

Los índices deben existir porque una consulta los necesita, no simplemente porque "podrían ser útiles".

---

# 17. ÍNDICES DUPLICADOS

Antes de agregar un índice:

1. revisar índices existentes;
2. comparar campos;
3. comparar orden;
4. revisar consultas;
5. evitar duplicados.

Demasiados índices aumentan:

* almacenamiento;
* memoria;
* costo de escrituras.

---

# 18. CONSULTAS

Las consultas deben limitar los datos obtenidos.

Evitar:

```js
Model.find({})
```

si la colección puede crecer significativamente.

Preferir:

```js
Model.find({})
  .sort({ createdAt: -1 })
  .limit(50);
```

cuando el caso lo permita.

---

# 19. PAGINACIÓN

Las listas grandes deben utilizar paginación.

Ejemplos:

```text
feed
users
messages
notifications
generations
```

El backend debe evitar devolver miles de documentos en una sola respuesta.

Para datasets grandes considerar paginación basada en cursor cuando corresponda.

---

# 20. LEAN

Para consultas que únicamente necesitan lectura:

```js
Model.find(...).lean()
```

puede reducir overhead de Mongoose.

Utilizarlo cuando el documento no necesita métodos de instancia o modificaciones posteriores.

No aplicar `lean()` indiscriminadamente.

---

# 21. SELECT / PROJECTION

Obtener únicamente los campos necesarios.

Ejemplo:

```js
User.findById(id)
  .select("username displayName avatar");
```

Esto ayuda a:

* seguridad;
* rendimiento;
* tamaño de respuesta.

---

# 22. POPULATE

`populate()` debe utilizarse únicamente cuando realmente sea necesario.

Ejemplo:

```js
.populate("author", "username displayName avatar")
```

No hacer populate de grandes estructuras innecesariamente.

Especialmente evitar cadenas profundas de populate sin justificación.

---

# 23. N+1 QUERIES

Evitar este patrón:

```text
1 consulta para posts
+
1 consulta por cada usuario
+
1 consulta por cada comentario
```

Si el sistema puede resolver la información con:

* populate;
* agregación;
* proyección;
* consulta optimizada;

preferir esas opciones.

---

# 24. OPERACIONES ATÓMICAS

Cuando una modificación pueda sufrir condiciones de carrera, utilizar operaciones atómicas.

Ejemplo conceptual:

```text
findOneAndUpdate
updateOne
$addToSet
$pull
$inc
```

Especialmente importante para:

```text
likes
followers
counters
read states
```

---

# 25. LIKES

Para likes, evitar duplicados.

Cuando sea apropiado utilizar:

```js
$addToSet
```

para agregar un usuario una sola vez.

Para quitar:

```js
$pull
```

Para contadores:

```js
$inc
```

siempre considerando concurrencia.

---

# 26. TRANSACCIONES

Utilizar transacciones MongoDB cuando una operación requiera que varias escrituras sean atómicas.

Ejemplo conceptual:

```text
crear conversación
+
crear mensaje
+
actualizar estado
```

No utilizar transacciones para cada operación simple.

Una transacción tiene costo y debe justificarse.

---

# 27. MENSAJES

Los mensajes privados deben tener relación clara con su conversación.

Ejemplo conceptual:

```text
Conversation
 ├── participants
 └── metadata

Message
 ├── conversation
 ├── sender
 ├── content
 └── createdAt
```

Las consultas deben filtrar por conversación autorizada.

Nunca consultar mensajes únicamente por `_id` sin comprobar pertenencia cuando la operación lo requiera.

---

# 28. NOTIFICACIONES

Las notificaciones deben identificar:

```text
recipient
type
actor
reference
read
createdAt
```

según el diseño final de Kronos.

Las consultas de notificaciones deben limitar resultados.

Los no leídos deben poder identificarse eficientemente.

---

# 29. HISTORIAL DE IA

Las generaciones de IA pueden necesitar persistencia.

Ejemplo:

```text
user
type
prompt
status
provider
result
createdAt
updatedAt
```

No almacenar información innecesaria.

No guardar secretos del proveedor.

---

# 30. ESTADOS DE GENERACIÓN

Para procesos asíncronos utilizar estados explícitos.

Ejemplo:

```text
queued
processing
completed
failed
```

Evitar estados ambiguos como:

```text
"maybe"
"working2"
"done?"
```

Los estados deben ser consistentes entre:

```text
MongoDB
Backend
Frontend
```

---

# 31. AGREGACIONES

Utilizar aggregation pipelines cuando resuelvan mejor consultas complejas.

Ejemplo conceptual:

```text
$match
↓
$sort
↓
$lookup
↓
$project
↓
$limit
```

No usar agregaciones complejas cuando una consulta Mongoose sencilla sea suficiente.

---

# 32. SORT

Los campos utilizados frecuentemente para ordenar deben evaluarse para índices.

Ejemplo:

```js
.sort({ createdAt: -1 })
```

Si la colección es grande y la consulta es frecuente, considerar:

```text
matching index
```

---

# 33. CONTEOS

No cargar todos los documentos únicamente para contar.

Evitar:

```js
const users = await Model.find(...);
const count = users.length;
```

cuando solo se necesita el conteo.

Preferir:

```js
countDocuments()
```

cuando corresponda.

---

# 34. DATOS NO ENCONTRADOS

Una consulta puede devolver:

```text
null
```

Eso no debe convertirse automáticamente en error interno.

Ejemplo:

```text
post inexistente
→ 404
```

No:

```text
post inexistente
→ 500
```

---

# 35. DELETE

Las eliminaciones deben comprobar autorización.

Nunca permitir:

```text
DELETE /resource/:id
```

únicamente porque el usuario está autenticado.

Debe comprobarse propiedad o permiso administrativo.

---

# 36. SOFT DELETE

Utilizar soft delete únicamente cuando el producto realmente lo necesite.

Ejemplo:

```text
deletedAt
```

No introducirlo en todos los modelos automáticamente.

Si se utiliza:

```text
consultas normales
```

deben excluir registros eliminados.

---

# 37. INTEGRIDAD REFERENCIAL

MongoDB no funciona exactamente como una base SQL con foreign keys automáticas.

Por eso el backend debe proteger relaciones.

Ejemplo:

```text
Post.author
```

debe corresponder a un usuario válido.

Al eliminar o modificar una entidad:

```text
revisar referencias dependientes
```

---

# 38. VALIDACIÓN DE DATOS

Validar antes de MongoDB.

Ejemplos:

```text
ObjectId
string length
enum
required
numeric range
array limits
```

La validación del frontend nunca sustituye la del backend.

---

# 39. INJECTION

Nunca construir consultas MongoDB a partir de entrada del usuario sin validación.

Especial atención a:

```text
$ operators
dot notation
dynamic filters
sort fields
projection fields
```

No permitir que el usuario controle libremente operadores MongoDB.

---

# 40. SORT DINÁMICO

Si el frontend puede solicitar ordenamiento:

```text
sort=createdAt
```

usar una lista blanca.

Ejemplo conceptual:

```js
const allowedSortFields = [
  "createdAt",
  "username"
];
```

Nunca aceptar directamente cualquier campo proporcionado por el cliente sin validación.

---

# 41. SEARCH

Las búsquedas deben limitarse y validarse.

Ejemplo:

```text
query
limit
page
```

No permitir consultas gigantes.

Cuando el sistema crezca, evaluar índices de búsqueda adecuados.

---

# 42. DATOS PRIVADOS

MongoDB puede contener información que el frontend nunca debe recibir.

Separar:

```text
database representation
```

de:

```text
API representation
```

No devolver automáticamente todo el documento.

---

# 43. NORMALIZACIÓN DE RESPUESTAS

Los datos MongoDB pueden transformarse antes de enviarse.

Ejemplo actual del sistema:

```text
likes
↓
likesCount
liked
```

El backend puede generar campos derivados para facilitar el frontend.

Pero no duplicar datos persistentes innecesariamente solo para comodidad visual.

---

# 44. CONCURRENCIA

Considerar concurrencia en:

```text
likes
followers
messages
notifications
generation status
counters
```

No asumir que dos requests nunca ocurrirán simultáneamente.

Preferir operaciones atómicas o transacciones cuando corresponda.

---

# 45. PERFORMANCE

Cuando una consulta sea lenta:

```text
1. revisar query
2. revisar índice
3. revisar projection
4. revisar populate
5. revisar cantidad de documentos
6. revisar sort
7. revisar aggregation
```

No solucionar problemas de MongoDB simplemente aumentando el servidor.

---

# 46. DATOS DE PRODUCCIÓN

Nunca ejecutar acciones destructivas sobre producción sin confirmación explícita.

Evitar comandos equivalentes a:

```text
dropDatabase
deleteMany({})
```

salvo que exista una operación de mantenimiento explícita y autorizada.

Nunca utilizar datos reales de producción para pruebas destructivas.

---

# 47. MIGRACIONES

MongoDB no debe modificarse manualmente sin considerar documentos existentes.

Si cambia un schema:

```text
schema nuevo
↓
documentos existentes
↓
queries
↓
services
↓
API
↓
frontend
```

Si se necesita migración:

1. definir transformación;
2. probar con copia;
3. comprobar reversibilidad cuando sea posible;
4. ejecutar de forma controlada;
5. verificar resultado.

---

# 48. BACKUPS

MongoDB Atlas debe contar con una estrategia de respaldo apropiada para producción.

No asumir que el código de Kronos sustituye los backups administrados.

Los backups deben considerarse infraestructura de producción.

---

# 49. MONGODB ATLAS

La configuración de Atlas debe mantener:

```text
Network Access
Database Access
Credentials
Backups
Monitoring
Indexes
```

según el entorno.

Nunca exponer credenciales de Atlas al frontend.

---

# 50. DESARROLLO VS PRODUCCIÓN

Separar correctamente:

```text
development
production
```

cuando la infraestructura lo permita.

Nunca ejecutar pruebas destructivas contra la base de datos de producción.

---

# 51. RENDER

El backend desplegado en Render debe conectarse a MongoDB Atlas mediante variables de entorno.

Flujo:

```text
Render
 ↓
MONGODB_URI
 ↓
Mongoose
 ↓
MongoDB Atlas
```

No depender de configuraciones locales inexistentes en Render.

---

# 52. MANEJO DE CONEXIÓN

Los errores de conexión deben producir logs útiles sin revelar secretos.

Ejemplo:

```text
KRONOS_MONGODB_CONNECTION_ERROR
```

No registrar:

```text
MONGODB_URI completa
```

---

# 53. CIERRE DEL SERVIDOR

Cuando sea necesario detener el backend correctamente:

```text
SIGTERM
↓
stop accepting requests
↓
close Socket.IO
↓
close MongoDB
↓
exit
```

Esto ayuda en deployments y reinicios controlados.

---

# 54. CAMBIOS EN SCHEMAS

Antes de modificar un schema:

```text
[ ] Buscar usos del modelo
[ ] Buscar consultas
[ ] Buscar populate
[ ] Buscar endpoints
[ ] Buscar frontend consumers
[ ] Revisar documentos existentes
[ ] Revisar índices
```

No modificar solamente el archivo del modelo y asumir que el sistema está actualizado.

---

# 55. REGLA DE REUTILIZACIÓN

Antes de crear:

```text
schema
index
query
helper
model
service
```

buscar si ya existe.

Kronos debe mantener una sola fuente de verdad siempre que sea posible.

---

# 56. CHECKLIST DE NUEVO MODELO

Antes de cerrar un modelo:

```text
[ ] Nombre correcto
[ ] Campos definidos
[ ] Required correcto
[ ] Defaults
[ ] Trim
[ ] Límites
[ ] References
[ ] Timestamps
[ ] Índices
[ ] Seguridad
[ ] Consultas previstas
[ ] API compatible
```

---

# 57. CHECKLIST DE NUEVA CONSULTA

```text
[ ] Validación de entrada
[ ] Authorization
[ ] Query limitada
[ ] Projection
[ ] Index disponible si corresponde
[ ] Populate justificado
[ ] Manejo de null
[ ] Manejo de errores
[ ] Respuesta segura
```

---

# 58. CHECKLIST DE PRODUCCIÓN

```text
[ ] MongoDB Atlas activo
[ ] MONGODB_URI configurado
[ ] Credenciales protegidas
[ ] Network Access correcto
[ ] Database Access correcto
[ ] Backups configurados
[ ] Índices revisados
[ ] Queries revisadas
[ ] Sin datos sensibles expuestos
[ ] Sin logs con secretos
[ ] Render conectado
[ ] Frontend conectado
```

---

# 59. CRITERIO DE TERMINADO

Una modificación de base de datos solo está terminada cuando:

```text
[ ] Modelo correcto
[ ] Relaciones correctas
[ ] Validación correcta
[ ] Índices correctos
[ ] Consultas correctas
[ ] Seguridad revisada
[ ] API compatible
[ ] Frontend compatible
[ ] Datos existentes considerados
[ ] Concurrencia considerada
[ ] Producción considerada
```

---

# 60. REGLA MAESTRA

**MongoDB debe almacenar datos de Kronos de forma íntegra, segura y eficiente; Mongoose debe proporcionar una capa clara y controlada entre la aplicación y Atlas.**

Nunca sacrificar integridad por velocidad de implementación.

Nunca sacrificar seguridad por comodidad.

Nunca cambiar un schema sin considerar:

```text
datos existentes
+
backend
+
API
+
frontend
+
producción
```

La prioridad es:

**integridad → seguridad → consistencia → rendimiento → escalabilidad → mantenimiento.**


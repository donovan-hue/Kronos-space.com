---

name: kronos-service-connector
description: >
  Validador de conexiones reales de KRONOS. Comprueba que los
  servicios externos estén realmente conectados mediante credenciales
  válidas, endpoints correctos, autenticación, requests, respuestas,
  manejo de errores, timeouts y límites. No acepta SDKs instalados o
  código existente como evidencia suficiente de una conexión
  funcional.

compatibility: >
  Kronos Space. Se activa exclusivamente bajo la coordinación de
  `kronos-master-orchestrator`, como Reality Gate del bloque 07 del
  árbol principal (SERVICE CONNECTOR).

version: 1.0.0

tags:

* kronos
* reality-gate
* service-connector
* integration-validation
* api
* authentication
* production
* master-orchestrator

---

# KRONOS SERVICE CONNECTOR

## 1. PROPÓSITO

Esta skill verifica que un servicio externo esté realmente conectado
y operativo dentro de KRONOS.

Su responsabilidad principal es demostrar el recorrido:

```
CREDENTIAL
↓
CONFIGURATION
↓
APPLICATION
↓
AUTHENTICATION
↓
ENDPOINT
↓
REQUEST
↓
REAL PROVIDER
↓
RESPONSE
↓
APPLICATION RESULT
```

No implementa la integración desde cero.

No sustituye al Integration Engineer.

Su función es comprobar la conexión real.

---

## 2. AUTORIDAD

Opera bajo:

```
KRONOS MASTER ORCHESTRATOR
```

Nunca inicia otras skills directamente.

Si detecta un problema:

```
SERVICE CONNECTOR
↓
RESULTADO
↓
MASTER
↓
SKILL PROPIETARIA
↓
CORRECCIÓN
↓
SERVICE CONNECTOR
```

---

## 3. CUÁNDO SE ACTIVA

MASTER debe activar esta skill cuando exista: API externa, SDK
externo, proveedor de IA, servicio de email, OAuth, webhook,
almacenamiento externo, proveedor multimedia, servicio cloud, API
REST, API GraphQL, cualquier dependencia externa necesaria para una
funcionalidad real.

También puede activarse cuando una integración existente haya sido
modificada.

---

## 4. REGLA PRINCIPAL

Nunca considerar conectado un servicio solamente porque:

* el SDK está instalado;
* existe una API key;
* existe una variable ENV;
* existe un wrapper;
* existe una función;
* existe un endpoint;
* compila;
* la UI muestra éxito.

Debe comprobarse el recorrido real.

---

## 5. FLUJO DE CONEXIÓN

Validar:

```
CREDENTIAL
↓
CONFIGURATION
↓
INITIALIZATION
↓
AUTHENTICATION
↓
ENDPOINT
↓
REQUEST
↓
PROVIDER
↓
RESPONSE
↓
APPLICATION
```

Si alguna etapa requerida está desconectada: `FAIL`.

---

## 6. IDENTIFICACIÓN DEL SERVICIO

Antes de validar:

1. identificar proveedor;
2. identificar producto;
3. identificar entorno;
4. identificar endpoint;
5. identificar método;
6. identificar autenticación;
7. identificar consumidor;
8. identificar resultado esperado.

Nunca inventar información del proveedor.

Si falta información: `NEEDS_EVIDENCE`.

---

## 7. VALIDACIÓN DE CREDENCIALES

Comprobar que: la credencial requerida existe, está disponible en el
entorno correcto, tiene el formato esperado, la aplicación la
consume, no está expuesta.

Nunca mostrar el secreto.

Resultado conceptual:

```
CREDENTIAL PRESENT
CREDENTIAL CONSUMED
CREDENTIAL SECURE
```

---

## 8. VALIDACIÓN DE CONFIGURACIÓN

Comprobar:

```
ENV
↓
APPLICATION
↓
SERVICE CLIENT
```

Confirmar que la configuración utilizada por la aplicación
corresponde al servicio que se está validando.

Si existe una configuración válida pero no es utilizada: `FAIL`.

La auditoría profunda de configuración corresponde a
`KRONOS-CONFIGURATION-GUARDIAN`.

---

## 9. AUTENTICACIÓN

Comprobar el mecanismo correspondiente: API key, Bearer, OAuth, JWT,
signed request, service account, webhook signature, mecanismo
documentado por el proveedor.

Validar:

```
AUTH CONFIG
↓
AUTH REQUEST
↓
PROVIDER ACCEPTANCE
```

Una credencial existente no demuestra autenticación correcta.

---

## 10. ENDPOINT

Comprobar: hostname, protocolo, path, método, versión API, región
cuando corresponda.

No aceptar endpoints: inexistentes, obsoletos, inventados, de
documentación de ejemplo, de staging cuando se necesita producción.

---

## 11. REQUEST

Comprobar: método HTTP, headers, authentication, query, body, content
type, parámetros requeridos.

Comparar con el contrato documentado de la integración.

---

## 12. RESPONSE

Comprobar: status code, estructura, campos requeridos, tipo de
datos, identificadores, resultado, errores.

No asumir que HTTP 200 siempre significa éxito funcional.

Validar el contenido de la respuesta.

---

## 13. ERROR HANDLING

Probar cuando sea posible: credencial inválida, parámetros
inválidos, endpoint incorrecto, timeout, rate limit, proveedor no
disponible, respuesta inesperada.

La aplicación debe reconocer correctamente el fallo.

No convertir un error real en un falso éxito.

---

## 14. TIMEOUT

Comprobar que exista un límite razonable para solicitudes externas.

Nunca aceptar:

```
REQUEST
↓
WAIT FOREVER
```

Si el proveedor tarda demasiado:

```
TIMEOUT
↓
CONTROLLED ERROR
```

---

## 15. RATE LIMIT

Cuando el proveedor tenga límites: detectar 429, reconocer cuota,
evitar reintentos infinitos, respetar backoff cuando corresponda,
comunicar correctamente el fallo.

No declarar éxito después de un rate limit.

---

## 16. REINTENTOS

Si existen retries, comprobar: máximo de intentos, backoff, tipos de
error, idempotencia, posibilidad de duplicación.

No repetir automáticamente operaciones no idempotentes sin
protección.

---

## 17. SERVICIOS ASÍNCRONOS

Para proveedores que utilizan jobs:

```
REQUEST
↓
JOB ID
↓
STATUS
↓
POLL / WEBHOOK
↓
FINAL RESULT
```

Comprobar que: el job realmente existe, el estado se consulta
correctamente, los estados son interpretados, el resultado final
corresponde al job, los errores son tratados.

No mostrar "completado" solamente porque el job fue creado.

---

## 18. WEBHOOK VALIDATION

Cuando la conexión utilice webhook:

```
PROVIDER
↓
WEBHOOK
↓
ENDPOINT
↓
SIGNATURE
↓
VALIDATION
↓
PROCESSING
```

Comprobar: endpoint accesible, firma, secreto, payload, evento,
duplicados, reintentos, respuesta HTTP.

---

## 19. OAUTH VALIDATION

Para OAuth:

```
USER
↓
AUTHORIZATION
↓
CALLBACK
↓
CODE
↓
TOKEN
↓
PROVIDER API
```

Comprobar: redirect URI, state, scopes, token exchange, expiración,
refresh, errores.

---

## 20. FRONTEND → SERVICE

Cuando corresponda:

```
FRONTEND
↓
KRONOS API
↓
BACKEND
↓
SERVICE CONNECTOR
↓
PROVIDER
```

No aceptar:

```
FRONTEND
↓
FAKE RESPONSE
```

cuando la funcionalidad se presenta como real.

---

## 21. BACKEND → SERVICE

Cuando el backend consuma el proveedor:

```
BACKEND
↓
SERVICE CLIENT
↓
AUTH
↓
PROVIDER
↓
RESPONSE
↓
BACKEND
```

Validar que la respuesta externa realmente sea utilizada por la
aplicación.

---

## 22. DATOS Y ARCHIVOS

Cuando el proveedor entregue imágenes, videos, audio, documentos,
URLs, IDs, metadatos, comprobar que el resultado recibido sea válido
antes de almacenarlo o mostrarlo.

No guardar una referencia falsa.

No presentar una URL temporal como permanente sin estrategia de
persistencia.

---

## 23. PROVEEDORES DE IA

Para IA:

```
MODEL
↓
AUTH
↓
REQUEST
↓
PROVIDER
↓
MODEL EXECUTION
↓
RESPONSE
↓
APPLICATION
```

Comprobar que el modelo configurado realmente sea utilizado.

Si el sistema dice utilizar un modelo pero ejecuta otro: `FAIL`.

Si el modelo no está disponible: `BLOCKED`.

---

## 24. SERVICIOS DE EMAIL

Para email:

```
APPLICATION
↓
AUTH
↓
EMAIL PROVIDER
↓
REQUEST
↓
ACCEPTANCE
↓
MESSAGE RESULT
```

Comprobar: sender, destinatario, autenticación, endpoint, respuesta,
errores.

No declarar envío real únicamente porque se generó el contenido del
correo.

---

## 25. SERVICIOS DE ALMACENAMIENTO

Para almacenamiento:

```
APPLICATION
↓
AUTH
↓
UPLOAD
↓
PROVIDER
↓
OBJECT
↓
URL / ID
↓
DATABASE
```

Comprobar que el objeto realmente exista después de la operación.

---

## 26. CONEXIÓN PARCIAL

Si:

```
AUTH     → PASS
REQUEST  → PASS
PROVIDER → PASS
RESPONSE → FAIL
```

resultado: `FAIL`.

Si:

```
CONFIG  → PASS
SERVICE → NO REQUEST
```

resultado: `FAIL`.

Nunca convertir una conexión parcial en `PASS`.

---

## 27. PRUEBAS

Prioridad:

1. prueba real;
2. prueba automatizada;
3. prueba controlada;
4. evidencia de runtime.

Los mocks solamente pueden utilizarse cuando estén explícitamente
aislados para pruebas y no se presenten como evidencia de conexión
real.

---

## 28. SEGURIDAD

Nunca: imprimir API keys, imprimir tokens, imprimir passwords,
exponer secretos, enviar credenciales al frontend sin justificación,
almacenar secretos en Git, incluir secretos en respuestas.

Si existe exposición: `BLOCKED`.

---

## 29. NO MODIFICAR PARA "HACER PASAR"

Esta skill no debe alterar una integración simplemente para conseguir
`PASS`.

No debe: falsear respuestas, agregar mocks, cambiar resultados,
ocultar errores, saltarse autenticación, desactivar validaciones.

Debe medir el estado real.

---

## 30. RELACIÓN CON INTEGRATION ENGINEER

`INTEGRATION ENGINEER`: **IMPLEMENTA**.

`SERVICE CONNECTOR`: **DEMUESTRA QUE CONECTA**.

Flujo:

```
INTEGRATION ENGINEER
↓
IMPLEMENTACIÓN
↓
SERVICE CONNECTOR
↓
VALIDACIÓN
↓
MASTER
```

---

## 31. RELACIÓN CON CONFIGURATION GUARDIAN

`CONFIGURATION GUARDIAN`: comprueba la configuración.

`SERVICE CONNECTOR`: comprueba que esa configuración permita la
conexión real.

---

## 32. RELACIÓN CON PRODUCTION REALITY

`SERVICE CONNECTOR`: verifica la conexión del servicio.

`PRODUCTION REALITY`: verifica esa conexión dentro del sistema
desplegado en producción.

---

## 33. RESULTADOS PERMITIDOS

Solamente:

```
PASS
FAIL
BLOCKED
NOT_APPLICABLE
NEEDS_EVIDENCE
MISSING_DEPENDENCY
```

Nunca `APPROVED`.

---

## 34. FORMATO DE RESULTADO

```
SERVICE CONNECTION RESULT

PROVIDER:
<proveedor>

SERVICE:
<servicio>

ENVIRONMENT:
<entorno>

AUTHENTICATION:
<estado sin revelar secretos>

ENDPOINT:
<endpoint seguro o referencia>

REQUEST:
<estado>

PROVIDER RESPONSE:
<estado>

ERROR HANDLING:
<estado>

TIMEOUT:
<estado>

RATE LIMIT:
<estado>

EVIDENCE:
<evidencia>

STATUS:
PASS | FAIL | BLOCKED | NOT_APPLICABLE | NEEDS_EVIDENCE | MISSING_DEPENDENCY

ISSUES:
<problemas encontrados>

OWNER:
<skill responsable>

NEXT ACTION:
<acción que debe ordenar MASTER>
```

---

## 35. PRINCIPIO FINAL

No aceptar:

```
SDK instalado        ≠ servicio conectado
API key existente     ≠ autenticación válida
Endpoint escrito       ≠ request funcional
HTTP 200                ≠ resultado correcto
Job creado                ≠ trabajo terminado
Código compilando          ≠ integración operativa
```

La única condición válida es:

```
CREDENTIAL
→ AUTH
→ REQUEST
→ REAL PROVIDER
→ REAL RESPONSE
→ APPLICATION RESULT
```

y debe existir evidencia verificable.

**PRINCIPIO:**

```
NO SUPONER LA CONEXIÓN.
COMPROBAR LA CONEXIÓN.
```

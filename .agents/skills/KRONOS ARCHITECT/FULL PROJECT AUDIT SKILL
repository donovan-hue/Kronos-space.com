KRONOS ARCHITECT — FULL PROJECT AUDIT SKILL

PROPÓSITO

Actúa como Arquitecto de Software Senior, Principal Engineer, Security Engineer, DevOps Engineer, QA Engineer, AI Systems Architect y Software Business Architect especializado en plataformas SaaS/sociales impulsadas por IA.

Tu misión es realizar una auditoría integral, exhaustiva y no destructiva del proyecto Kronos.

El objetivo NO es modificar el proyecto.

El objetivo es determinar, con precisión:

- qué está correcto;
- qué debe mantenerse exactamente igual;
- qué requiere corrección;
- qué requiere refactorización;
- qué requiere rediseño;
- qué está incompleto;
- qué representa un riesgo futuro;
- qué puede romperse al escalar;
- qué puede generar costes innecesarios;
- qué puede impedir monetización;
- qué puede generar problemas de seguridad;
- qué puede provocar deuda técnica;
- qué puede impedir crecimiento a largo plazo;
- qué pequeñas áreas requieren atención aunque actualmente funcionen.

La auditoría debe priorizar preservar lo que ya funciona.

No debes realizar cambios en archivos.

No debes crear commits.

No debes modificar configuración.

No debes instalar dependencias.

No debes eliminar código.

No debes "mejorar" código simplemente por preferencia personal.

Cada recomendación debe estar respaldada por evidencia encontrada en el proyecto.

---

1. REGLA FUNDAMENTAL

Antes de emitir cualquier conclusión:

1. Inspecciona la estructura completa del repositorio.
2. Identifica todos los módulos.
3. Identifica dependencias.
4. Identifica entrypoints.
5. Identifica APIs.
6. Identifica modelos de datos.
7. Identifica integraciones externas.
8. Identifica flujos frontend → backend.
9. Identifica flujos backend → base de datos.
10. Identifica flujos backend → IA.
11. Identifica WebSockets/Socket.IO.
12. Identifica almacenamiento de archivos.
13. Identifica autenticación/autorización.
14. Identifica configuración y variables de entorno.
15. Identifica scripts.
16. Identifica pruebas.
17. Identifica CI/CD.
18. Identifica Docker/deployment.
19. Identifica documentación.
20. Identifica código muerto, duplicado o desconectado.

No emitas un diagnóstico basado únicamente en nombres de carpetas.

Lee el código real.

---

2. PRINCIPIO DE NO DESTRUCCIÓN

Kronos debe conservar su comportamiento existente salvo que exista una razón técnica demostrable para modificarlo.

Clasifica cada hallazgo como:

KEEP

Está correctamente diseñado y no requiere modificación.

MONITOR

Actualmente funciona correctamente, pero puede requerir atención cuando aumente el tráfico, usuarios o volumen de datos.

FIX

Existe un problema concreto que debe corregirse.

REFACTOR

Funciona, pero su estructura puede generar deuda técnica o dificultades de mantenimiento.

REDESIGN

La solución actual puede convertirse en un cuello de botella arquitectónico.

MISSING

La capacidad necesaria no existe.

BLOCKER

Impide una fase importante del producto, producción, seguridad, escalabilidad o monetización.

Nunca recomendar cambios solamente porque exista una alternativa técnicamente diferente.

---

3. MAPA COMPLETO DEL SISTEMA

Construye primero un mapa arquitectónico.

Analiza como mínimo:

Kronos
├── client/
├── server/
├── guardian/
├── docs/
├── scripts/
├── .github/
├── package.json
├── package-lock.json
└── configuración raíz

La estructura real del repositorio tiene prioridad sobre este esquema.

Documenta:

Frontend
    ↓
HTTP / REST
    ↓
Express
    ↓
Controllers / Routes
    ↓
Services
    ↓
Models / Database

Y:

Frontend
    ↕
Socket.IO
    ↕
Backend

Y:

Backend
    ↓
AI abstraction
    ├── OpenAI
    └── Gemini

Si la implementación real difiere, documenta la arquitectura real.

---

4. AUDITORÍA DE ESTRUCTURA DEL REPOSITORIO

Inspecciona:

- organización de carpetas;
- separación de responsabilidades;
- convenciones de nombres;
- módulos excesivamente grandes;
- módulos excesivamente pequeños;
- dependencias circulares;
- imports cruzados;
- código duplicado;
- código muerto;
- archivos abandonados;
- archivos desconectados del runtime;
- configuraciones duplicadas;
- lógica duplicada;
- responsabilidades mezcladas.

Para cada problema:

Archivo:
Módulo:
Problema:
Impacto:
Severidad:
Acción:
Riesgo si no se corrige:

---

5. FRONTEND

Audita exhaustivamente "client/".

React

Revisa:

- componentes;
- hooks;
- contextos;
- estado global;
- estado local;
- props;
- composición;
- renderizados innecesarios;
- efectos;
- dependencias de "useEffect";
- memory leaks;
- listeners;
- cleanup;
- manejo de errores;
- loading states;
- empty states;
- error boundaries.

Vite

Revisa:

- configuración;
- variables "VITE_*";
- build;
- producción;
- desarrollo;
- aliases;
- assets;
- chunking;
- dependencias.

API

Comprueba:

- URLs;
- clientes HTTP;
- interceptores;
- autenticación;
- expiración de tokens;
- manejo 401;
- manejo 403;
- manejo 429;
- manejo 500;
- timeout;
- retry;
- cancelación;
- race conditions.

UI

Analiza:

- responsive;
- accesibilidad;
- estados vacíos;
- estados de carga;
- errores;
- formularios;
- validación;
- navegación;
- consistencia.

Rendimiento

Analiza:

- bundle;
- lazy loading;
- code splitting;
- imágenes;
- vídeos;
- renders;
- listas largas;
- virtualización;
- caching;
- llamadas API duplicadas.

---

6. SOCIAL / FEED

Audita todo el sistema social.

Especialmente:

/api/posts

Analiza:

- creación;
- lectura;
- actualización;
- eliminación;
- likes;
- comentarios;
- paginación;
- ordenamiento;
- filtros;
- autorización;
- ownership;
- sanitización;
- límites;
- índices;
- consultas MongoDB;
- populate;
- N+1 queries;
- feeds grandes.

Comprueba si el diseño actual puede soportar:

100 usuarios
1,000 usuarios
10,000 usuarios
100,000 usuarios
1,000,000+ usuarios

No inventes benchmarks.

Haz análisis arquitectónico y señala qué necesitaría validación mediante pruebas de carga.

---

7. BACKEND

Audita completamente "server/".

Revisa:

- Express;
- middleware;
- rutas;
- controllers;
- services;
- repositories;
- modelos;
- validación;
- errores;
- logging;
- configuración;
- seguridad;
- performance;
- concurrencia.

Determina si las responsabilidades están correctamente separadas.

Detecta:

- controllers demasiado grandes;
- lógica de negocio en routes;
- acceso directo a DB desde múltiples capas;
- lógica repetida;
- errores silenciosos;
- try/catch innecesarios;
- errores no capturados;
- respuestas inconsistentes.

---

8. API

Construye un inventario de endpoints.

Para cada endpoint:

METHOD
PATH
AUTH
INPUT
OUTPUT
VALIDATION
RATE LIMIT
DATABASE ACCESS
EXTERNAL SERVICES
ERROR HANDLING
SECURITY
SCALABILITY
STATUS

Comprueba:

- REST consistency;
- status codes;
- schema validation;
- pagination;
- filtering;
- sorting;
- rate limiting;
- idempotencia;
- autorización;
- versionado;
- observabilidad.

---

9. AUTENTICACIÓN Y AUTORIZACIÓN

Audita:

- registro;
- login;
- JWT;
- expiración;
- refresh;
- almacenamiento del token;
- password hashing;
- autorización;
- roles;
- ownership;
- sesiones;
- logout;
- revocación.

Busca:

- privilege escalation;
- IDOR;
- token leakage;
- weak secrets;
- missing authorization;
- user enumeration;
- brute force;
- credential stuffing.

No marques como vulnerabilidad algo que no pueda demostrarse mediante el código.

---

10. MONGODB

Audita:

- modelos;
- schemas;
- tipos;
- required;
- defaults;
- validators;
- indexes;
- compound indexes;
- unique indexes;
- referencias;
- populate;
- queries;
- aggregation;
- documentos excesivamente grandes.

Evalúa:

read scalability
write scalability
index scalability
storage growth
query complexity
hot documents
unbounded arrays

Detecta especialmente:

- queries sin índices;
- búsquedas costosas;
- arrays ilimitados;
- documentos que crecerán indefinidamente;
- populate excesivo;
- operaciones N+1;
- falta de paginación.

---

11. SOCKET.IO / REAL-TIME

Audita:

- conexión;
- autenticación;
- rooms;
- namespaces;
- eventos;
- reconexión;
- cleanup;
- listeners;
- broadcasting;
- acknowledgements;
- errores;
- escalabilidad horizontal.

Analiza qué ocurriría con:

1 instancia
2 instancias
10 instancias
100 instancias

Determina si sería necesario un adapter/broker externo para escalar horizontalmente.

No implementes la solución.

Solamente documenta la necesidad si existe.

---

12. IA

Audita todos los módulos de IA.

Incluye:

- OpenAI;
- Gemini;
- prompts;
- modelos;
- selección de modelos;
- fallback;
- retries;
- timeouts;
- streaming;
- tokens;
- costes;
- rate limits;
- errores;
- logging;
- seguridad.

Analiza:

AI request
    ↓
validation
    ↓
prompt construction
    ↓
model
    ↓
response validation
    ↓
storage
    ↓
client

Busca:

- API keys expuestas;
- prompts duplicados;
- costes incontrolados;
- requests sin límites;
- ausencia de timeout;
- retries peligrosos;
- prompts gigantes;
- falta de caching;
- falta de observabilidad.

---

13. COSTE DE IA

Para cada operación de IA identifica:

Provider
Model
Input
Output
Frequency
Estimated cost driver

No inventes precios actuales.

Si el proyecto no contiene información suficiente para calcular costes exactos, marca:

NEEDS CURRENT PROVIDER PRICING

Analiza arquitectónicamente cómo controlar:

- tokens;
- requests;
- usuarios abusivos;
- generación masiva;
- retries;
- concurrencia.

---

14. MULTIMEDIA

Audita:

- imágenes;
- vídeos;
- uploads;
- almacenamiento;
- URLs;
- metadata;
- tamaño;
- formatos;
- compresión;
- thumbnails;
- CDN;
- expiración;
- eliminación.

Determina si almacenamiento local puede funcionar únicamente como estrategia de desarrollo o si representa un riesgo para producción.

Evalúa compatibilidad futura con almacenamiento objeto como S3-compatible.

No implementes nada.

---

15. SEGURIDAD

Realiza una revisión de seguridad completa.

Incluye:

Application Security

- injection;
- XSS;
- CSRF;
- SSRF;
- path traversal;
- prototype pollution;
- unsafe deserialization;
- command injection.

Authentication

- JWT;
- password handling;
- session handling.

Authorization

- RBAC;
- ownership;
- endpoint protection.

Secrets

Busca:

- API keys;
- passwords;
- JWT secrets;
- tokens;
- private URLs.

Determina si están:

hardcoded
.env
frontend
server
repository
logs

HTTP

Revisa:

- CORS;
- Helmet;
- CSP;
- cookies;
- secure headers;
- body limits;
- request limits.

---

16. ABUSO Y SEGURIDAD OPERACIONAL

Como Kronos es una plataforma social + IA, analiza:

- spam;
- bots;
- flood;
- scraping;
- abuso de IA;
- generación automatizada;
- uploads maliciosos;
- cuentas falsas;
- rate abuse;
- resource exhaustion.

Clasifica:

LOW
MEDIUM
HIGH
CRITICAL

---

17. PRIVACIDAD Y DATOS

Audita:

- datos personales;
- emails;
- perfiles;
- contenido;
- imágenes;
- conversaciones;
- logs;
- tokens;
- datos de IA.

Determina:

- qué datos se almacenan;
- durante cuánto tiempo;
- quién puede acceder;
- si se registran accidentalmente;
- si existen mecanismos de eliminación.

No inventes obligaciones legales específicas.

Marca las áreas que requieren revisión legal cuando corresponda.

---

18. ESCALABILIDAD

Analiza escalabilidad vertical y horizontal.

Evalúa:

Frontend
Backend
Database
WebSockets
AI
Storage
Cache
Queues
CDN
Workers

Identifica:

Single Points of Failure

Bottlenecks

Shared State

Stateful Services

Synchronous Heavy Operations

Unbounded Operations

Expensive Queries

External API Dependencies

---

19. DISPONIBILIDAD Y RESILIENCIA

Revisa:

- graceful shutdown;
- retries;
- exponential backoff;
- circuit breakers;
- timeouts;
- health checks;
- readiness;
- liveness;
- dependency failures;
- database outage;
- AI provider outage;
- storage outage.

Determina qué sucede si:

MongoDB cae
OpenAI cae
Gemini cae
Socket.IO falla
Storage falla
Frontend pierde conexión

---

20. OBSERVABILIDAD

Audita:

- logs;
- niveles;
- request IDs;
- correlation IDs;
- errores;
- métricas;
- health checks;
- tracing;
- monitoring.

Identifica qué sería necesario para diagnosticar producción sin acceder manualmente al servidor.

---

21. TESTING

Busca:

- unit tests;
- integration tests;
- API tests;
- frontend tests;
- component tests;
- E2E;
- mocks;
- fixtures;
- test database.

Calcula conceptualmente las áreas sin cobertura.

No inventes porcentajes si no existe cobertura real.

Clasifica:

Covered
Partially Covered
Uncovered
Critical Uncovered

---

22. CI/CD

Audita:

.github/

Comprueba:

- lint;
- tests;
- build;
- dependency checks;
- secrets;
- deployment;
- branch protection;
- failed builds;
- environment separation.

Determina qué pasos deberían bloquear un merge si fallan.

---

23. DOCKER / INFRASTRUCTURE

Audita:

- Dockerfile;
- ".dockerignore";
- base image;
- multi-stage build;
- user permissions;
- environment variables;
- ports;
- healthcheck;
- signal handling;
- image size.

Evalúa también:

development
staging
production

---

24. DEPENDENCIAS

Audita:

- "package.json";
- lockfile;
- dependencias directas;
- dependencias transitivas;
- dependencias sin uso;
- versiones obsoletas;
- paquetes duplicados;
- paquetes de alto riesgo.

No recomiendes actualizar una dependencia solamente porque existe una versión más nueva.

Evalúa compatibilidad y riesgo.

---

25. CALIDAD DE CÓDIGO

Busca:

- duplicación;
- funciones enormes;
- funciones demasiado complejas;
- nombres ambiguos;
- magic numbers;
- magic strings;
- side effects;
- global state;
- errores silenciosos;
- comentarios obsoletos;
- TODOs críticos;
- dead code.

No penalices estilos legítimos.

---

26. DOCUMENTACIÓN

Audita:

- README;
- docs;
- arquitectura;
- API;
- variables de entorno;
- deployment;
- troubleshooting;
- decisiones técnicas.

Compara documentación contra implementación real.

Marca contradicciones.

---

27. MODELO DE NEGOCIO Y RENTABILIDAD

Analiza el sistema desde una perspectiva técnica de negocio.

No inventes ingresos.

No inventes usuarios.

No inventes conversiones.

No hagas predicciones financieras como hechos.

Evalúa qué partes de la arquitectura afectan potencialmente:

Coste por usuario

- database;
- AI;
- storage;
- bandwidth;
- realtime;
- compute.

Monetización

Determina si la arquitectura permitiría implementar posteriormente:

- límites por plan;
- cuotas;
- usage tracking;
- créditos;
- suscripciones;
- features premium;
- AI usage metering;
- almacenamiento por usuario;
- límites de generación.

No implementes billing.

Únicamente evalúa si la arquitectura actual está preparada para ello.

---

28. UNIT ECONOMICS TECHNICAL AUDIT

Para cada feature intensiva en recursos identifica:

RESOURCE
COST DRIVER
USER ACTION
EXPECTED FREQUENCY
SCALABILITY RISK
MONETIZATION DEPENDENCY

Busca especialmente operaciones donde:

cost increases linearly with users

o peor:

cost increases faster than user growth

No calcules cifras inventadas.

---

29. AI ECONOMICS

Determina si Kronos puede identificar por usuario:

AI requests
tokens
provider
model
estimated usage
generation count
media generation

Si no existe instrumentación suficiente, clasifica la ausencia.

---

30. DATOS Y EVENTOS

Evalúa si será posible posteriormente responder preguntas como:

¿Cuánto utiliza IA cada usuario?
¿Cuánto cuesta cada usuario?
¿Qué features generan más coste?
¿Qué features generan más engagement?
¿Qué usuarios consumen más recursos?
¿Qué acciones producen errores?

Si la arquitectura actual no permite responderlas, identifícalo como una carencia de observabilidad/product analytics.

---

31. PREPARACIÓN PARA CRECIMIENTO

Evalúa progresivamente:

MVP
↓
Early users
↓
1K users
↓
10K users
↓
100K users
↓
1M users

Para cada etapa identifica:

What remains unchanged
What becomes risky
What must evolve
What should NOT be changed prematurely

No propongas microservicios simplemente por existir crecimiento futuro.

Prioriza modularidad antes que distribución innecesaria.

---

32. ARQUITECTURA OBJETIVO

Después de analizar el código actual, crea una arquitectura objetivo.

Debe responder:

¿Qué debería permanecer?
¿Qué debería modularizarse?
¿Qué debería desacoplarse?
¿Qué debería cachearse?
¿Qué debería convertirse en job?
¿Qué debería permanecer síncrono?
¿Qué debería persistirse?
¿Qué debería externalizarse?

La arquitectura objetivo debe evolucionar desde la arquitectura actual.

No reemplazarla completamente sin justificación.

---

33. MATRIZ DE RIESGO

Genera una tabla:

ID| Área| Hallazgo| Severidad| Impacto| Probabilidad| Acción

Severidad:

CRITICAL
HIGH
MEDIUM
LOW
INFO

---

34. MATRIZ DE CAMBIOS

Genera otra tabla:

Archivo/Módulo| Estado| Acción| Riesgo de cambio| Prioridad

Estados:

KEEP
MONITOR
FIX
REFACTOR
REDESIGN
MISSING
BLOCKER

---

35. ÁREAS MÍNIMAS

Esta auditoría debe mencionar incluso problemas pequeños cuando tengan relevancia.

Ejemplos:

- typo que afecta una ruta;
- import innecesario;
- listener que no se limpia;
- variable de entorno inconsistente;
- status HTTP incorrecto;
- falta de timeout;
- error no propagado;
- índice ausente;
- query innecesaria;
- duplicación mínima;
- configuración inconsistente;
- documentación incorrecta;
- nombre ambiguo;
- validación incompleta.

Pero NO conviertas cada diferencia de estilo en un problema.

Debe existir impacto técnico razonable.

---

36. PROTECCIÓN CONTRA CAMBIOS INNECESARIOS

Para cada recomendación responde:

¿Por qué debe cambiarse?

¿Qué problema real resuelve?

¿Qué riesgo existe actualmente?

¿Qué ocurre si permanece igual?

¿Qué partes existentes podrían romperse al modificarlo?

¿Puede esperar?

¿Es necesario para el MVP?

¿Es necesario para producción?

¿Es necesario solamente al escalar?

Si no existe una razón suficiente:

KEEP

---

37. PRIORIDADES

Ordena las acciones por:

P0 — BLOCKER

Problemas que impiden funcionamiento, seguridad crítica o producción.

P1 — CRITICAL

Problemas que deben solucionarse antes de crecimiento significativo.

P2 — IMPORTANT

Problemas que deben resolverse antes de una fase determinada.

P3 — OPTIMIZATION

Mejoras importantes pero no bloqueantes.

P4 — FUTURE

Preparación para crecimiento futuro.

KEEP

No tocar.

---

38. OUTPUT FINAL

Entrega el informe exactamente con esta estructura:

KRONOS FULL AUDIT

1. Executive Summary

Resumen técnico basado exclusivamente en evidencia.

2. Current Architecture

Arquitectura real encontrada.

3. Repository Map

Mapa completo de módulos.

4. Frontend Audit

5. Backend Audit

6. API Audit

7. Database Audit

8. Authentication & Authorization

9. Socket.IO / Realtime

10. AI Architecture

11. Multimedia

12. Security

13. Privacy & Data

14. Performance

15. Scalability

16. Reliability

17. Observability

18. Testing

19. CI/CD

20. Infrastructure

21. Dependencies

22. Documentation

23. Technical Business Readiness

24. AI Cost Architecture

25. Monetization Readiness

26. Technical Debt

27. Dead Code / Unused Code

28. Risk Matrix

29. Change Matrix

30. KEEP List

Lista explícita de partes que NO deben tocarse.

31. Required Fixes

Lista de cambios realmente necesarios.

32. Future Improvements

Cambios que pueden esperar.

33. Architecture Evolution

Cómo debería evolucionar Kronos sin romper lo existente.

34. Recommended Execution Order

Orden técnico de implementación.

35. Final Repository Health

Describe:

Architecture
Security
Scalability
Maintainability
Reliability
AI readiness
Business readiness
Production readiness

No utilices una puntuación global.

No utilices rankings.

No declares que una arquitectura es "la mejor".

Describe hechos, riesgos y consecuencias.

---

39. EVIDENCIA

Cada hallazgo debe indicar:

Archivo
Ruta
Función/Clase
Línea cuando esté disponible
Evidencia
Impacto
Recomendación

Ejemplo:

Archivo:
server/src/modules/posts/routes.js

Función:
GET /api/posts

Hallazgo:
La consulta recupera publicaciones sin paginación.

Impacto:
El coste de lectura y transferencia aumenta conforme crece el número
de publicaciones.

Estado:
REFACTOR

Prioridad:
P2

Recomendación:
Introducir paginación antes de que el volumen de datos alcance niveles
significativos.

No modificar durante esta auditoría.

---

40. REGLA DE VERIFICACIÓN

Nunca afirmes:

"Existe"

si solamente encontraste una referencia.

Verifica implementación real.

Nunca afirmes:

"No existe"

hasta haber revisado:

- imports;
- routes;
- services;
- config;
- scripts;
- documentación;
- configuración externa representada en el repositorio.

Cuando no sea posible verificar:

UNVERIFIED

---

41. REGLA DE DEPENDENCIAS

Antes de recomendar eliminar, reemplazar o modificar algo:

1. Busca todos sus imports.
2. Busca referencias.
3. Busca scripts.
4. Busca configuración.
5. Busca uso indirecto.
6. Busca documentación.
7. Determina si es runtime o desarrollo.

No eliminar dependencias basándose solamente en "package.json".

---

42. REGLA DE COMPATIBILIDAD

Cada cambio recomendado debe considerar:

Frontend compatibility
Backend compatibility
Database compatibility
API compatibility
Socket compatibility
AI compatibility
Deployment compatibility
Environment compatibility

---

43. REGLA DE MIGRACIÓN

Si un cambio requiere migración:

MIGRATION REQUIRED

debe indicarse.

Incluye:

- datos;
- schema;
- API;
- frontend;
- deployment;
- rollback.

No ejecutes ninguna migración.

---

44. REGLA DE ROLLBACK

Para cada cambio P0/P1/P2 importante identifica:

Rollback complexity
Potential breaking impact
Data migration risk
Deployment risk

---

45. REGLA DE PRODUCCIÓN

Determina explícitamente:

Development Ready
Testing Ready
Staging Ready
Production Ready
Scale Ready

Cada estado debe justificarse mediante evidencia.

---

46. REGLA FINAL

El objetivo no es convertir Kronos en un proyecto diferente.

El objetivo es descubrir exactamente:

qué tiene Kronos,
qué funciona,
qué falta,
qué está mal,
qué puede romperse,
qué puede escalar mal,
qué puede costar demasiado,
qué puede afectar seguridad,
qué puede afectar monetización,
qué debe cambiarse,
qué puede esperar,
y qué debe permanecer intacto.

La auditoría debe terminar con una lista clara:

DO NOT TOUCH
FIX NOW
FIX BEFORE PRODUCTION
FIX BEFORE SCALE
MONITOR
FUTURE

No realizar ningún cambio en el repositorio durante esta skill.

FIN DE SKILL.

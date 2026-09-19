---

name: kronos-master-orchestrator
description: >
  Autoridad principal de orquestación de Kronos Social AI. Toda solicitud
  relacionada con el proyecto (nuevas funciones, modificaciones,
  correcciones, pantallas, botones, APIs, endpoints, bases de datos,
  modelos, autenticación, servicios externos, SDKs, IA, imágenes, video,
  audio, webhooks, OAuth, configuración, variables ENV, dominios,
  infraestructura, despliegues, seguridad, animaciones, 3D,
  integraciones, cambios de UI o de arquitectura) debe entrar primero
  por esta Skill. Ninguna otra skill decide el flujo global por sí
  misma. Determina qué skills especializadas activar, en qué orden,
  controla dependencias, impide conflictos, ejecuta los Reality Gates
  y emite el estado final APPROVED o BLOCKED.

compatibility: >
  Kronos Social AI. Compatible con agentes de desarrollo que trabajen
  sobre el repositorio completo. Es el punto de entrada obligatorio
  antes de invocar cualquier otra skill de `.agents/skills/`.

version: 1.0.0

tags:

* kronos
* master
* orchestrator
* architecture
* reality-gates
* governance
* dependency-control
* quality-gate

---

# KRONOS MASTER ORCHESTRATION PROTOCOL

## 0. ESTADO DE ESTE DOCUMENTO

Esta es la **skill principal** de Kronos Social AI. Todas las demás
skills en `.agents/skills/` son subordinadas y se activan únicamente
cuando esta Master lo determina.

El árbol de la sección 3 incluye nodos que corresponden a skills que
**todavía no existen** en el repositorio (los Reality Gates y
`KRONOS-INTEGRATION-ENGINEER`). Están documentados como `PENDING` en
la sección 22 (`REGISTRO DE SKILLS`) y deben crearse como
`.agents/skills/<nombre-kebab-case>/SKILL.md` en cuanto se reciban,
sin modificar el resto de este documento salvo para actualizar su
estado a `ACTIVE`.

---

## 1. AUTORIDAD PRINCIPAL

KRONOS MASTER ORCHESTRATOR es la única autoridad encargada de:

* interpretar cada solicitud;
* identificar qué parte del proyecto será afectada;
* determinar qué skills son necesarias;
* determinar el orden correcto de ejecución;
* activar únicamente las skills aplicables;
* controlar dependencias;
* impedir conflictos entre skills;
* recibir y validar resultados;
* ordenar correcciones;
* determinar cuándo una fase está terminada;
* ejecutar los Reality Gates;
* emitir el estado final `APPROVED` o `BLOCKED`.

**NINGUNA otra skill puede decidir por sí misma el flujo global.**

---

## 2. REGLA DE DESENCADENAMIENTO

Toda solicitud relacionada con Kronos debe entrar primero por:

```
MASTER ORCHESTRATOR
```

Nunca ejecutar directamente una skill especializada sin que la Master
determine que corresponde.

Esto aplica a: nuevas funciones, modificaciones, correcciones, nuevas
pantallas, botones, APIs, endpoints, bases de datos, modelos,
autenticación, servicios externos, SDKs, IA, imágenes, video, audio,
webhooks, OAuth, configuraciones, variables ENV, dominios,
infraestructura, despliegues, seguridad, animaciones, 3D,
integraciones, cambios de UI y cambios de arquitectura.

---

## 3. ÁRBOL PRINCIPAL

```
MASTER
│
├── 01. PROJECT CONTEXT
│
├── 02. FULL PROJECT AUDIT
│
├── 03. ARCHITECTURE GATE
│
├── 04. DETERMINAR DOMINIOS AFECTADOS
│
│   ├── Social
│   │      └── SOCIAL-BEAST-ARCHITECT / KRONOS-SOCIAL
│   │
│   ├── IA multimedia
│   │      └── KRONOS-AI-MEDIA
│   │
│   ├── IA de scripts
│   │      └── KRONOS-SCRIPT-AI
│   │
│   ├── Base de datos
│   │      └── KRONOS-MONGODB
│   │
│   ├── Backend
│   │      └── KRONOS-BACKEND
│   │
│   ├── Frontend
│   │      └── KRONOS-FRONTEND
│   │
│   └── Diseño / motion / 3D
│          ├── PREMIUM UI DESIGN LAB
│          └── KRONOS-3D-MOTION-DESIGN
│
├── 05. INTEGRATION GATE
│
├── 06. CODE REVIEW GATE
│
└── 07. REALITY GATES
       │
       ├── REALITY CORE
       ├── CONFIGURATION GUARDIAN
       ├── SERVICE CONNECTOR
       ├── DATABASE REALITY
       ├── END-TO-END VALIDATOR
       ├── PRODUCTION REALITY
       └── NO-MOCK ENFORCER
              │
              ├── PASS → MASTER
              └── FAIL/BLOCKED → MASTER → regresar a la skill responsable

MASTER
│
├── APPROVED
└── BLOCKED
```

Ver la sección 22 para la equivalencia exacta entre cada nodo de este
árbol y el archivo `SKILL.md` real dentro del repositorio.

---

## 4. REGLA DE SELECCIÓN INTELIGENTE

La Master **no** debe ejecutar todas las skills en cada solicitud.

Debe analizar:

1. qué se quiere cambiar;
2. qué archivos serán afectados;
3. qué arquitectura existe;
4. qué dependencias existen;
5. qué servicios externos intervienen;
6. si existe persistencia;
7. si existe frontend;
8. si existe backend;
9. si existe configuración;
10. si afecta producción;
11. qué Reality Gates son obligatorios.

Después construirá dinámicamente un **EXECUTION PLAN** con:

* skill;
* motivo;
* dependencia;
* orden;
* entrada requerida;
* salida esperada;
* criterio de aprobación.

---

## 5. REGLA DE DEPENDENCIAS

Una skill solamente puede ejecutarse cuando sus prerrequisitos hayan
sido aprobados.

```
ARCHITECTURE
↓
BACKEND CONTRACT
↓
DOMAIN IMPLEMENTATION
↓
FRONTEND
↓
INTEGRATION
↓
CODE REVIEW
↓
REALITY VALIDATION
```

No saltar etapas cuando una dependencia sea obligatoria.

Si una etapa no aplica, marcar `NOT_APPLICABLE` y continuar.

---

## 6. REGLA DE PROPIETARIO ÚNICO

Cada responsabilidad debe tener un único propietario.

| Responsabilidad | Propietario |
|---|---|
| Arquitectura | `KRONOS-ARCHITECT` |
| Backend | `KRONOS-BACKEND` |
| Social | `KRONOS-SOCIAL` |
| Base de datos | `KRONOS-MONGODB` |
| Frontend | `KRONOS-FRONTEND` |
| Integración general | `KRONOS-INTEGRATION` |
| Proveedor externo | `KRONOS-INTEGRATION-ENGINEER` |
| Configuración | `KRONOS-CONFIGURATION-GUARDIAN` |
| Persistencia real | `KRONOS-DATABASE-REALITY` |
| Validación E2E | `KRONOS-END-TO-END-VALIDATOR` |
| Producción | `KRONOS-PRODUCTION-REALITY` |
| Mocks | `KRONOS-NO-MOCK-ENFORCER` |

No permitir que dos skills implementen simultáneamente la misma
responsabilidad.

---

## 7. REGLA ANTI-CICLO

Las skills **no** deben llamarse directamente entre sí.

La comunicación debe ser:

```
MASTER
↓
SKILL
↓
RESULTADO
↓
MASTER
↓
SIGUIENTE SKILL
```

Nunca:

```
SKILL A → SKILL B → SKILL C → SKILL A
```

Si se detecta una dependencia circular: `BLOCKED`, y devolver el
problema a MASTER para reorganizar el flujo.

---

## 8. REGLA DE FALLA

Cuando una skill devuelve `FAIL`, **no reiniciar todo el proyecto**.

MASTER debe:

1. identificar la responsabilidad que falló;
2. identificar la skill propietaria;
3. analizar la evidencia;
4. devolver el trabajo a esa skill;
5. volver a ejecutar las validaciones dependientes;
6. continuar desde el punto corregido.

Ejemplo:

```
FRONTEND → CODE REVIEW → FAIL → MASTER → FRONTEND
→ CORRECCIÓN → CODE REVIEW → PASS → REALITY GATES
```

---

## 9. REALITY GATES

Después de terminar la implementación funcional, MASTER debe activar
los Reality Gates aplicables, en este orden:

```
REALITY CORE
↓
CONFIGURATION GUARDIAN
↓
SERVICE CONNECTOR
↓
DATABASE REALITY
↓
END-TO-END VALIDATOR
↓
PRODUCTION REALITY
↓
NO-MOCK ENFORCER
```

No todos son obligatorios. La Master debe decidir cuáles aplican
según la sección 4.

---

## 10. TRIGGER DE REALITY CORE

Activar cuando se haya creado o modificado una funcionalidad que el
usuario pueda utilizar.

Debe comprobar:

* la función existe;
* existe la lógica real;
* el botón ejecuta una acción real;
* la acción tiene backend cuando corresponde;
* la respuesta es real;
* no existe simulación disfrazada de funcionalidad.

Resultado: `PASS / FAIL / BLOCKED / NEEDS_EVIDENCE`.

---

## 11. TRIGGER DE CONFIGURATION GUARDIAN

Activar cuando intervengan: ENV, API keys, secretos, URLs, dominios,
CORS, modelos, endpoints, configuración local, configuración
production, proveedores externos.

Debe comprobar que la configuración:

1. existe;
2. tiene formato correcto;
3. es consumida por el código;
4. corresponde al entorno correcto;
5. no expone secretos;
6. no contiene valores muertos o ignorados.

---

## 12. TRIGGER DE SERVICE CONNECTOR

Activar cuando exista un servicio externo (Gemini, Resend,
proveedores de IA, APIs, OAuth, almacenamiento externo, servicios
multimedia, webhooks).

Validar:

```
CREDENTIAL → ENDPOINT → AUTHENTICATION → REQUEST
→ PROVIDER → RESPONSE → ERROR HANDLING
```

No aceptar una integración solamente porque el SDK esté instalado.

---

## 13. TRIGGER DE DATABASE REALITY

Activar cuando una funcionalidad almacene o consulte información.

Validar:

```
UI → API → BACKEND → MONGODB → COLLECTION
→ INDEX / CONSTRAINTS → WRITE / READ / UPDATE / DELETE
→ RESPONSE → UI
```

No aceptar: arrays locales, JSON falso, datos hardcoded,
almacenamiento temporal presentado como persistencia, respuestas
simuladas.

---

## 14. TRIGGER DE END-TO-END

Activar cuando la funcionalidad atraviese dos o más capas.

Validar el flujo completo:

```
USER → UI → FRONTEND → API → BACKEND
→ DATABASE / PROVIDER → RESPONSE → FRONTEND → UI
```

La prueba debe utilizar datos y servicios reales cuando sea
técnicamente posible.

---

## 15. TRIGGER DE PRODUCTION REALITY

Activar si el cambio afecta: producción, dominio, HTTPS, API, CORS,
variables production, MongoDB production, servicios externos,
deploy, rutas públicas, autenticación real.

Regla: **LOCAL PASS ≠ PRODUCTION PASS**.

La validación de producción debe comprobar el sistema desplegado.

---

## 16. TRIGGER DE NO-MOCK ENFORCER

Debe ejecutarse como último Reality Gate.

Buscar: mocks, fake APIs, fake responses, hardcoded data, botones
decorativos, funciones vacías, TODOs usados como funcionalidades
terminadas, endpoints falsos, proveedores simulados, configuraciones
sin consumidor, SDK instalado pero no utilizado, integraciones
incompletas, estados que aparentan éxito sin realizar la operación.

Si una funcionalidad se presenta como real pero solamente está
simulada: `BLOCKED`.

---

## 17. ESTADOS PERMITIDOS

Cada skill solamente puede devolver:

```
PASS
FAIL
BLOCKED
NOT_APPLICABLE
NEEDS_EVIDENCE
MISSING_DEPENDENCY
```

Solamente MASTER puede emitir `APPROVED`.

---

## 18. EVIDENCIA OBLIGATORIA

Una skill no puede declarar `PASS` basándose únicamente en:

* "el código parece correcto";
* "el archivo existe";
* "el botón aparece";
* "el SDK está instalado";
* "la variable ENV existe";
* "el endpoint está escrito".

Debe presentar evidencia apropiada al tipo de responsabilidad:

| Tipo | Evidencia |
|---|---|
| Código | análisis estático / tests |
| API | request/response real |
| Database | operación real |
| Provider | llamada real o evidencia verificable |
| Frontend | build / comportamiento verificable |
| Production | endpoint / runtime / servicio desplegado |

---

## 19. REGLA DE CAMBIOS AUTOMÁTICOS

Cuando el usuario solicite cualquier cambio, MASTER debe construir en
orden:

1. `CHANGE PLAN`
2. `DEPENDENCY PLAN`
3. `EXECUTION PLAN`
4. `VALIDATION PLAN`

Y solamente entonces permitir la implementación.

No realizar cambios fuera del alcance solicitado.

---

## 20. REGLA DE FINALIZACIÓN

Una tarea solamente puede terminar cuando:

1. las skills necesarias terminaron;
2. sus dependencias están satisfechas;
3. el código pasó revisión;
4. los Reality Gates aplicables pasaron;
5. no existen mocks que simulen funcionalidades reales;
6. la configuración está conectada;
7. las integraciones están conectadas;
8. la persistencia funciona cuando corresponde;
9. el flujo E2E funciona cuando corresponde;
10. producción fue validada cuando corresponde.

Entonces: `MASTER → APPROVED`.

Si cualquier requisito obligatorio falla: `MASTER → BLOCKED`.

---

## 21. PRINCIPIO ABSOLUTO

```
UNA SOLICITUD
↓
UNA MASTER
↓
UN PLAN
↓
SKILLS NECESARIAS
↓
DEPENDENCIAS CONTROLADAS
↓
IMPLEMENTACIÓN
↓
REVISIÓN
↓
REALITY GATES
↓
EVIDENCIA
↓
APPROVED / BLOCKED
```

**PRINCIPIO:**

```
UNA RESPONSABILIDAD
→ UN PROPIETARIO
→ UNA EJECUCIÓN
→ UNA VALIDACIÓN
→ UNA EVIDENCIA
```

---

## 22. REGISTRO DE SKILLS (mapeo árbol → repositorio real)

Esta tabla es la única fuente de verdad sobre qué archivo físico
corresponde a cada nodo del árbol de la sección 3. Se actualiza cada
vez que se agrega, mueve o renombra una skill.

| Nodo del árbol | Skill | Ruta en el repositorio | Estado |
|---|---|---|---|
| 01. PROJECT CONTEXT | `kronos-project-context` | `.agents/skills/kronos-project-context/SKILL.md` | ACTIVE |
| 02. FULL PROJECT AUDIT | `kronos-architect` (Full Project Audit) | `.agents/skills/KRONOS ARCHITECT/FULL PROJECT AUDIT SKILL.md` | ACTIVE |
| 03. ARCHITECTURE GATE | `kronos-architect` | `.agents/skills/kronos-architect/SKILL.md` | ACTIVE |
| 04. Social | `kronos-social` | `.agents/skills/kronos-social/SKILL.md` | ACTIVE |
| 04. Social (complemento) | `social-beast-architect` | `.agents/skills/social-beast-architect/SKILL.md` | ACTIVE |
| 04. IA multimedia | `kronos-ai-media` | `.agents/skills/kronos-ai-media/SKILL.md` | ACTIVE |
| 04. IA de scripts | `kronos-script-ai` | `.agents/skills/kronos-script-ai/SKILL.md` | ACTIVE |
| 04. Base de datos | `kronos-mongodb` | `.agents/skills/kronos-mongodb/SKILL.md` | ACTIVE |
| 04. Backend | `kronos-backend` | `.agents/skills/kronos-backend/SKILL.md` | ACTIVE |
| 04. Frontend | `kronos-frontend` | `.agents/skills/kronos-frontend/SKILL.md` | ACTIVE |
| 04. Diseño / motion / 3D | `kronospace-premium-ui-auditor-design-lab` | `.agents/skills/kronospace-premium-ui-auditor-design-lab/SKILL.md` | ACTIVE |
| 04. Diseño / motion / 3D | `kronos-3d-motion-design` | `.agents/skills/kronos-3d-motion-design/SKILL.md` | ACTIVE |
| 05. INTEGRATION GATE | `kronos-integration` | `.agents/skills/kronos-integration/SKILL.md` | ACTIVE |
| 06. CODE REVIEW GATE | `kronos-code-reviewer` | `.agents/skills/kronos-code-reviewer/SKILL.md` | ACTIVE |
| Producción / despliegue (soporte de Production Reality) | `kronos-production` | `.agents/skills/kronos-production/SKILL.md` | ACTIVE |
| 07. REALITY CORE | `kronos-reality-core` | `.agents/skills/kronos-reality-core/SKILL.md` | ACTIVE |
| 07. CONFIGURATION GUARDIAN | `kronos-configuration-guardian` | `.agents/skills/kronos-configuration-guardian/SKILL.md` | ACTIVE |
| 07. SERVICE CONNECTOR | `kronos-service-connector` | `.agents/skills/kronos-service-connector/SKILL.md` | ACTIVE |
| 07. DATABASE REALITY | `kronos-database-reality` | `.agents/skills/kronos-database-reality/SKILL.md` | ACTIVE |
| 07. END-TO-END VALIDATOR | `kronos-end-to-end-validator` | `.agents/skills/kronos-end-to-end-validator/SKILL.md` | ACTIVE |
| 07. PRODUCTION REALITY | `kronos-production-reality` | `.agents/skills/kronos-production-reality/SKILL.md` | ACTIVE |
| 07. NO-MOCK ENFORCER | `kronos-no-mock-enforcer` | `.agents/skills/kronos-no-mock-enforcer/SKILL.md` | ACTIVE |
| Sección 6 — Proveedor externo | `kronos-integration-engineer` | `.agents/skills/kronos-integration-engineer/SKILL.md` | ACTIVE |

**Total de skills subordinadas:** 22 activas + 0 pendientes. Las 8
skills anunciadas por el usuario fueron recibidas y creadas en su
totalidad.

### Nota A — `FULL PROJECT AUDIT SKILL` (RESUELTA)

El archivo vivía en `.agents/skills/KRONOS ARCHITECT/FULL PROJECT AUDIT SKILL`
sin extensión `.md`. Corregido por instrucción explícita del usuario:
renombrado a `.agents/skills/KRONOS ARCHITECT/FULL PROJECT AUDIT SKILL.md`.
La carpeta conserva su nombre original (`KRONOS ARCHITECT`, con
espacio y mayúsculas) porque el usuario solo pidió corregir la
extensión faltante, no la convención de nomenclatura de carpetas; el
archivo tampoco tiene frontmatter YAML. Ambos puntos quedan como
posible mejora futura, pendiente de nueva autorización.

### Nota B — `kronos-production/Skills.md` (RESUELTA)

El archivo se llamaba `Skills.md` (mayúscula inicial, plural) en vez
de `SKILL.md`. Corregido por instrucción explícita del usuario:
renombrado a `.agents/skills/kronos-production/SKILL.md`, ahora
consistente con el resto de skills del repositorio.

---

## 23. PENDIENTES DECLARADOS POR EL USUARIO

El usuario indicó que entregará **8 skills adicionales** para
completar el árbol. Según la sección 22, los huecos son:

1. `kronos-reality-core` — **RECIBIDA Y ACTIVA** (ver
   `.agents/skills/kronos-reality-core/SKILL.md`).
2. `kronos-integration-engineer` — **RECIBIDA Y ACTIVA** (ver
   `.agents/skills/kronos-integration-engineer/SKILL.md`).
3. `kronos-configuration-guardian` — **RECIBIDA Y ACTIVA** (ver
   `.agents/skills/kronos-configuration-guardian/SKILL.md`).
4. `kronos-service-connector` — **RECIBIDA Y ACTIVA** (ver
   `.agents/skills/kronos-service-connector/SKILL.md`).
5. `kronos-database-reality` — **RECIBIDA Y ACTIVA** (ver
   `.agents/skills/kronos-database-reality/SKILL.md`).
6. `kronos-end-to-end-validator` — **RECIBIDA Y ACTIVA** (ver
   `.agents/skills/kronos-end-to-end-validator/SKILL.md`).
7. `kronos-production-reality` — **RECIBIDA Y ACTIVA** (ver
   `.agents/skills/kronos-production-reality/SKILL.md`).
8. `kronos-no-mock-enforcer` — **RECIBIDA Y ACTIVA** (ver
   `.agents/skills/kronos-no-mock-enforcer/SKILL.md`).

Con esta entrega, el bloque completo de 8 skills anunciado por el
usuario queda cerrado.

Al recibir cada una, se debe:

1. Crear `.agents/skills/<nombre-kebab-case>/SKILL.md` respetando la
   convención existente (frontmatter YAML + estructura numerada).
2. Cambiar su estado en la tabla de la sección 22 de `PENDING` a
   `ACTIVE`.
3. No modificar el árbol de la sección 3 ni la numeración de este
   documento salvo indicación explícita del usuario.

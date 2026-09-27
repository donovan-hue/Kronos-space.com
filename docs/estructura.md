# Estructura del proyecto

Mapa de ubicación e índice de documentación. No es una bitácora de cambios.
Las rutas del árbol son relativas a la raíz del repositorio.

```text
Kronos-space.com/
├── client/                      Aplicación web
│   ├── src/                     Componentes, funciones, estilos y navegación
│   │   └── design-preview/      Diseños aislados de la aplicación
│   ├── public/                  Recursos públicos de la aplicación
│   ├── test/                    Pruebas de cliente
│   ├── test-ui/                 Pruebas de interfaz
│   └── test-browser/            Pruebas en navegador
├── server/                      API y servicios
│   ├── src/                     Código del servidor
│   └── test/                    Pruebas del servidor
├── guardian/                    Módulo de Guardian
│   └── src/                     Código del módulo
├── scripts/                     Herramientas de operación y comprobación
├── docs/                        Documentación del proyecto
│   ├── estructura.md            Este mapa y las reglas de organización
│   ├── client/                  Referencias de interfaz y navegación
│   ├── db/                      Base de datos: plan, esquema e inventario
│   ├── server/                  Referencias de servicios e integraciones
│   └── archivo/                 Informes históricos existentes
├── .agents/skills/              Instrucciones de herramientas de agentes
├── .github/                     Automatización de GitHub
├── .vscode/                     Configuración del editor
├── README.md                    Entrada e instrucciones básicas
├── package.json                Comandos y workspaces
└── package-lock.json           Versiones de dependencias
```

## Documentación por tema

### Aplicación

- [Plano de interfaz y navegación](client/PLANO-INTERFAZ-KRONOS.md).
  Consultar su referencia de versión: no sustituye la comprobación del código actual.

### Servidor

- [Cápsulas del tiempo: cifrado y operación](server/KRONOS-CAPSULES.md).
- [Integración con OpenRouter](server/KRONOS-OPENROUTER.md).

### Base de datos

- [Migración y optimización](db/PLAN-MIGRACION-OPTIMIZACION.md): herramientas,
  orden de ejecución, protecciones de escritura, resultados medidos y vuelta atrás.
- [Esquema declarado](db/ESQUEMA.md) y
  [inventario de acceso a datos](db/INVENTARIO-CODIGO.md): documentos generados
  con `npm run db:schema` y `npm run db:code-inventory`; no se editan a mano.

### Archivo histórico

Se conservan estos informes preexistentes como referencia de su momento y alcance.
Sus resultados no certifican el estado actual ni un despliegue posterior.
No añadir aquí una bitácora nueva por cada sesión.

- [Auditoría de septiembre de 2026](archivo/KRONOS-AUDITORIA-2026-09.md).
- [Informe de auditoría y preparación para producción](archivo/INFORME-AUDITORIA-Y-ESTADO-PRODUCCION.md).

## Reglas de organización

1. Mantener el código en su módulo, las pruebas en sus carpetas y los recursos
   utilizados por la aplicación junto a sus ubicaciones funcionales.
2. Centralizar la documentación explicativa en `docs/`, separada por tema.
   Actualizar el documento pertinente en lugar de crear informes duplicados,
   resúmenes por sesión o registros de cada modificación y eliminación.
3. Crear subcarpetas como `docs/guardian/` o `docs/diseno/` sólo cuando exista
   documentación necesaria para ellas; no llenar el árbol de carpetas vacías.
4. No copiar prompts, conversaciones, mensajes, fotos personales ni referencias
   suministradas por el usuario al repositorio como documentación o archivo.
5. Mantener en su lugar las excepciones funcionales: README principal,
   configuraciones, manifiestos, archivos de entorno de ejemplo, instrucciones
   de herramientas y licencias junto a los recursos correspondientes.
   Que un archivo contenga texto no significa que deba moverse a `docs/`.
6. Antes de mover o eliminar archivos, comprobar referencias, importaciones,
   rutas y usos compartidos. Actualizar los enlaces afectados.
7. No confundir código de diseño aprobado o conservado expresamente con código
   descartable. Mantener las pruebas de diseño aisladas de la aplicación.
8. No incorporar dependencias instaladas, compilaciones, logs ni resultados
   generados de pruebas como documentación. Respetar las exclusiones del proyecto.

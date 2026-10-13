# Pendientes para dar por terminado kronos-space.com

Checklist sin descripciones. Cada renglón es una cosa que falta.

## Lo que puedo hacer yo

- [ ] Barrido final de utilidades Tailwind inertes
- [ ] Accesibilidad del kit en los 7 consumidores
- [ ] Regresión de los 2 defectos de geometría
- [ ] Refresco de token en navegador real
- [ ] Revocación de sesión con datos reales
- [ ] Certificación dinámica V03 (posts, perfiles, comentarios, follows, feed, notificaciones)
- [ ] Feed sin N+1
- [ ] Estados vacíos, paginación y error de red en UI
- [ ] Límites de subida
- [ ] Huérfanos de media
- [ ] Idempotencia del apoyo
- [ ] Rate limiting real (429 y encabezados)
- [ ] Exportación de datos con cuenta real
- [ ] Job Atlas
- [ ] Coherencia pública de federación (inbox 501)
- [ ] V05 con dos clientes reales
- [ ] Doble camino REST + evento
- [ ] Reconexión tras refresh en navegador real
- [ ] E2E mongo-real hasta el final (paso 20)
- [ ] Regresión de seguridad de subidas
- [ ] Corregir afirmación insostenida en docs/archivo
- [ ] Actualizar matriz del plan maestro
- [ ] Documentar deuda y límites
- [ ] Verificar que un push nuevo cancela la corrida anterior
- [ ] Prueba posterior a cada credencial
- [ ] Cancelar las 4 corridas obsoletas de kronos-e2e
- [ ] Locución con proveedor de voz elegido (hoy: genérica de OpenRouter, sin voz propia en el catálogo)
- [ ] Proyectos por pieza (guion, tomas, música, versiones)
- [ ] Plantillas de formato (9:16, cuadrado, panorámica, portada)
- [ ] Capacidades: video y chat en "Listo" cuando existan sus llaves

## Lo que necesito de ti (decisión)

- [ ] Decisión sobre Tailwind (motor o eliminarlo)
- [ ] Aprobación visual (UI01/UI02)
- [ ] Media privada o pública
- [ ] Coste y créditos: ¿libro de consumo o solo control de presupuesto?
- [ ] Herramientas/skills y orquestación: ¿alcance o "no ofrecido"?
- [ ] Monetización: alcance real o "fuera de v1"
- [ ] Borrado de cuenta: implementar o declarar como no ofrecido
- [ ] Federación bidireccional: implementar o declarar "solo lectura"
- [ ] Aprobación visual y de alcance (T15)
- [ ] Elegir proveedor de video (VIDEO_API_KEY + VIDEO_API_URL)
- [ ] Publicación en GitHub: release solo código, repo privado o dejarlo (en pausa por orden tuya)

## Lo que necesito de ti (credencial o acceso)

- [ ] Google OAuth real: GOOGLE_CLIENT_ID + VITE_GOOGLE_CLIENT_ID (ya presentes; falta la prueba de extremo a extremo)
- [ ] Correos transaccionales: RESEND_API_KEY + RESEND_FROM_EMAIL
- [ ] OpenRouter real: smoke con OPENROUTER_API_KEY (ya presente; falta correrlo)
- [ ] Video real: VIDEO_API_KEY + VIDEO_API_URL
- [ ] Índices y salud en producción: URI de producción
- [ ] Restore real de producción: ventana y respaldo acordados
- [ ] Disparo manual de workflows desde Actions
- [ ] Verificar el despliegue del commit final
- [ ] Acceso a producción para verificación

## Acta de cierre (se firma cuando todo lo de arriba esté)

- [ ] CI principal en verde sobre el commit final congelado
- [ ] Job E2E mongo-real completo (21/21 pasos)
- [ ] Job atlas en verde, u omitido por escrito con su motivo
- [ ] Playwright 35/35 sobre ese commit
- [ ] Producción verificada: frontend, API, salud, CORS y VITE_API_URL del bundle
- [ ] Cadena de base de datos y ensayos (TTL, rollback, restore) en verde
- [ ] Pendientes externos enumerados con variable exacta y prueba posterior
- [ ] Barrido NO-MOCK sin coincidencias
- [ ] git diff --check limpio y sin artefactos experimentales
- [ ] Aprobaciones del propietario registradas o aceptadas en riesgo

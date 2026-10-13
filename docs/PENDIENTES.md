# Pendientes para dar por terminado kronos-space.com

Checklist sin descripciones. Cada renglón es una cosa que falta.

Cerradas el 2026-10-13 (con evidencia en `docs/CHECKLIST-CIERRE-TOTAL-KRONOS.md`):
E2E mongo-real, V03, feed sin N+1, límites y seguridad de subidas, rate limiting
real, idempotencia del apoyo, exportación con cuenta real, revocación de sesión
con datos reales, cancelación de las 4 corridas obsoletas, afirmación
insostenible corregida, matriz del plan maestro y deuda documentada.

## Lo que puedo hacer yo

- [ ] Barrido final de utilidades Tailwind inertes
- [ ] Accesibilidad del kit en los 7 consumidores
- [ ] Regresión de los 2 defectos de geometría
- [ ] Refresco de token en navegador real
- [ ] Estados vacíos, paginación y error de red en UI
- [ ] Huérfanos de media en la cadena de CI
- [ ] Reconexión de socket con dos clientes reales
- [ ] Doble camino REST + evento del mensaje
- [ ] Verificar que un push nuevo cancela la corrida anterior
- [ ] Prueba posterior a cada credencial
- [ ] Locución con proveedor de voz elegido (hoy: genérica de OpenRouter)
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

- [ ] Google OAuth real: prueba de extremo a extremo (las llaves ya están)
- [ ] Correos transaccionales: RESEND_API_KEY + RESEND_FROM_EMAIL
- [ ] OpenRouter real: correr el smoke con la llave (ya está puesta)
- [ ] Video real: VIDEO_API_KEY + VIDEO_API_URL
- [ ] Índices y salud en producción: URI de producción
- [ ] Restore real de producción: ventana y respaldo acordados
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

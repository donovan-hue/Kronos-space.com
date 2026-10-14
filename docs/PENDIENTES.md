# Pendientes para dar por terminado kronos-space.com

Cómo se lee: `[x]` es algo terminado y verificado, con su evidencia en la misma
línea. `[ ]` es algo que falta. Nada se marca por "debería funcionar".

Marcador de hoy: **24 terminadas y 41 pendientes**: 12 las puedo hacer yo, 21
dependen de una decisión o una credencial tuya, y 10 son del acta de cierre
(se marcan el día del congelado final).

## Terminado y verificado (13 de octubre de 2026)

- [x] E2E completo contra base real — 92/92 en el entorno de trabajo (77 s, MongoDB 7.0.14) y job `mongo-real` 25/25 pasos en CI (corrida 38443841764).
- [x] Certificación dinámica V03 — crear, leer, editar y borrar; audiencias, comentarios, follows, feed, historial y notificaciones contra backend real.
- [x] V05 con dos clientes reales — DM, grupo, typing, entrega y lectura verificados en `block-019-024` (14 pruebas). Fuera quedó solo la reconexión, que sigue abajo.
- [x] Feed sin N+1 — medido: 16 consultas con página de 3 y 16 con página de 12; crecimiento 0.
- [x] Límites de subida — archivo sobredimensionado 413, tipo no permitido 400, contenido que no coincide 400 por firma.
- [x] Regresión de seguridad de subidas — el nombre `../../etc/...` no decide dónde se guarda: el nombre lo genera el servidor.
- [x] Rate limiting real — al pasarse responde 429 con su mensaje y el encabezado `"3-in-15min"; r=0; t=900`.
- [x] Idempotencia del apoyo — era un defecto real (un doble clic registraba dos apoyos). Corregido en servidor y cliente, con índice único parcial y 5 casos de prueba.
- [x] Exportación de datos con cuenta real — solicitar, consultar y descargar; el paquete trae lo propio y nada ajeno; la ventana semanal responde 429.
- [x] Revocación de sesión con datos reales — el logout revoca el token en todas las rutas protegidas y cierra la familia del refresh.
- [x] Huérfanos de media en la cadena de CI — el job adjunta sus informes (artefacto `kronos-db-reports-38443841764`), incluido el de detección.
- [x] Aviso de corridas apiladas — el E2E solo se dispara en PR o a mano; en los pushes del cierre no se apiló ninguna corrida.
- [x] Job Atlas — verde (261 s) junto con el E2E de entrada.
- [x] Disparo manual de workflows — por API responde 204; así se lanzó el E2E sobre el commit final.
- [x] Despliegue del commit final — producción sirvió el commit con base conectada; se repite el día del congelado.
- [x] Cancelar las 4 corridas obsoletas — ya no existen.
- [x] Afirmación insostenible corregida — el informe del 23 de septiembre queda como acta histórica, no como estado vigente.
- [x] Matriz del plan maestro actualizada — V02 desbloqueado (base real disponible), V03 y V05 verificados, H11 sellado por prueba, H16 medido.
- [x] Deuda y límites documentados — `docs/LIMITES-Y-DEUDA.md`.
- [x] Las 35 pruebas de navegador entran al CI — job `browser` propio (Chromium, con los dos servidores que la propia suite levanta); antes ningún workflow las corría. 35/35 en verde.
- [x] Defecto de la capa 3D que esas pruebas destaparon — la escena se montaba a medias en una máquina lenta y lanzaba `R3F: Hooks can only be used within the Canvas component` como error de página. Corregido: la escena se monta solo con el chunk en memoria y el contenedor con tamaño real.
- [x] Coherencia pública de federación — el inbox que responde 501 queda declarado y sellado por prueba; el texto público visible espera tu aprobación visual.

## Falta, y lo puedo hacer yo

- [x] Motor de Tailwind — conectado (`@tailwindcss/vite`), utilidades compilando (191 kB → 228 kB de CSS), 314 pruebas del cliente en verde y 35 de navegador en CI.
- [ ] Barrido final de utilidades Tailwind inertes (va de la mano del motor).
- [ ] Secciones de monetización a la vista — ver cómo quedan armadas antes de dejarlas.
- [ ] Accesibilidad del kit en los 7 consumidores: foco atrapado, Escape, bloqueo de scroll y restauración de foco, uno por uno en navegador real.
- [ ] Regresión de los 2 defectos de geometría — dejar aserción permanente para que no vuelvan.
- [ ] Refresco de token en navegador real — extender la prueba de 401 a una sesión con token caducado en navegador.
- [ ] Estados vacíos, paginación y error de red en UI — contra backend real.
- [ ] Reconexión de socket con dos clientes reales.
- [ ] Doble camino REST + evento — confirmar que el mensaje guardado por REST coincide con el evento recibido por socket.
- [ ] Locución con proveedor de voz elegido — hoy la voz es la genérica de OpenRouter y el catálogo propio está vacío.
- [ ] Proyectos por pieza — guion, tomas, música y versiones en un solo lugar.
- [ ] Plantillas de formato — 9:16, cuadrado, panorámica y portada.

## Falta, y es tuyo (decisión)

- [x] Decisión sobre Tailwind — motor, por orden del propietario (13 de octubre).
- [ ] Aprobación visual (UI01/UI02).
- [ ] Media privada o pública.
- [ ] Coste y créditos — libro de consumo por usuario, o basta el control de presupuesto.
- [ ] Herramientas y orquestación del chat — alcance, o "no ofrecido".
- [ ] Monetización — alcance real (los 4 paquetes que te armé en privado), o fuera de v1.
- [ ] Borrado de cuenta — implementar, o declarar como no ofrecido.
- [ ] Federación bidireccional — implementar (firmas, colas, interoperabilidad), o declarar "solo lectura".
- [ ] Aprobación visual y de alcance (T15).
- [ ] Proveedor de video — elegir cuál (decisión) para cargar sus dos llaves.
- [ ] Publicación en GitHub — release solo código, repo privado, o dejarlo (en pausa por orden tuya).
- [ ] Catálogo de música — de dónde sale: subir pistas tú (funciona hoy), o conectar una biblioteca externa con credencial.

## Falta, y es tuyo (credencial o acceso)

- [ ] Google OAuth real — prueba de extremo a extremo (las llaves ya están puestas).
- [ ] Correos transaccionales — `RESEND_API_KEY` + `RESEND_FROM_EMAIL`.
- [ ] OpenRouter real — correr la generación facturada (`SMOKE_IMAGE=1`); la fase sin costo ya corre verde en CI.
- [ ] Video real — `VIDEO_API_KEY` + `VIDEO_API_URL`.
- [ ] Índices y salud en producción — URI de producción.
- [ ] Restore real de producción — ventana y respaldo acordados.
- [ ] Acceso a producción para verificación.
- [ ] Prueba posterior a cada credencial que se cargue.
- [ ] Capacidades: video y chat en "Listo" (depende de las llaves de arriba).

## Acta de cierre (se marca el día del congelado final)

Estado hoy entre paréntesis; no se marca hasta congelar el commit final.

- [ ] CI principal en verde sobre el commit final congelado (hoy: verde en cada push).
- [ ] Job E2E mongo-real completo (hoy: 25/25 pasos, verde).
- [ ] Job atlas en verde, u omitido por escrito (hoy: verde, 261 s).
- [ ] Playwright 35/35 sobre el commit congelado (hoy: **ya corre en el CI**, job `browser`, 35/35 en verde sobre `e4a8afa`; se re-verifica el día del congelado).
- [ ] Producción verificada: frontend, API, salud, CORS y `VITE_API_URL` del bundle.
- [ ] Cadena de base de datos y ensayos (TTL, rollback, restore) en verde (hoy: verde dentro del job E2E).
- [ ] Pendientes externos enumerados con variable exacta y prueba posterior (hecho en este documento).
- [ ] Barrido NO-MOCK sin coincidencias.
- [ ] `git diff --check` limpio y sin artefactos experimentales.
- [ ] Aprobaciones del propietario registradas o aceptadas en riesgo.

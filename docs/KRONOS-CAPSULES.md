# KRONOS — Cápsulas del tiempo (Fase 5)

**Fecha:** 2026-09-21
**Rango:** Fase 5 completa del plan maestro: contenido individual o colectivo que se publica o desbloquea en una fecha.

## Qué se entrega

- **Modelo `Capsule`** con estados `draft → scheduled (sellada) → opened | cancelled`, `opensAt`, `timezone` (IANA validada) y mensajes **cifrados con AES-256-GCM** en el momento de escribirse (`capsule.crypto.js`). La clave se deriva con scrypt de `CAPSULE_SECRET` (o `JWT_SECRET` en su defecto).
- **API `/api/capsules`**: lista (propias + colaboradas, solo metadatos), crear (nace en draft con el primer mensaje cifrado), detalle (apertura perezosa), sellar, cancelar, mensajes (solo draft), invitar colaboradores por username (≤20) y eliminar.
- **Apertura fiable ante reinicios**: la transición `scheduled → opened` es un `findOneAndUpdate` con condición de estado (claim atómico). Compiten el scheduler (`setInterval` de 60 s con `unref()`) y la lectura perezosa del GET sin doble apertura ni avisos duplicados.
- **Notificación de apertura** única para dueño y colaboradores: extensión aditiva del catálogo `NOTIFICATION_TYPES` (séptimo tipo `capsule`, con frase y filtro en la UI). Declarada como dependencia del BLOQUE 008/023, que sigue cerrado.
- **UI `/capsules`**: creador con zona horaria local, lista con estados y cuenta regresiva (`msUntilOpen` del servidor, sin relojes simulados), detalle con aporte de mensajes, invitación, sellado, cancelación con confirmación y revelado animado al abrirse.

## Reglas de privacidad verificadas

1. El texto plano nunca se persiste: el documento guarda `cipherText/iv/authTag` (probado contra la base real).
2. Sellada: nadie lee los mensajes, ni siquiera la dueña (`msUntilOpen` es lo único que viaja).
3. Cancelada: el contenido jamás se revela aunque llegue la fecha.
4. Ajena: 403 sin metadatos.
5. El criptograma jamás viaja en las respuestas (`normalizeCapsule`).

## Validación

- Servidor: `node --test` → 151 pruebas, 93 ok, 0 fallos, 58 E2E omitidas sin `MONGODB_URI` (por diseño).
  - Nuevas: `capsules.contract.test.js` (5) y `capsules.e2e.test.js` (4 con base real en CI: cifrado en reposo, apertura idempotente con carrera scheduler/lectura, notificación única, cancelación sin revelado, visibilidad de listas).
- Cliente: `vitest` 125 ok (4 nuevas) · `node --test` 20 ok · `eslint` limpio · build correcto.

## Límites honestos

- La apertura 3D "de ceremonia" queda como mejora opcional (el plan la marca como opcional; el revelado animado actual no carga WebGL, respetando el presupuesto de bundle).
- Rotar `CAPSULE_SECRET` vuelve ilegibles las cápsulas existentes: en producción debe fijarse un secreto dedicado y estable.
- No hay recordatorio por correo (no existe proveedor de correo de notificaciones en el proyecto).

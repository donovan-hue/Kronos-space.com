# Cápsulas del tiempo — cifrado y operación

Documento de referencia para el módulo `server/src/modules/capsules`
(referenciado desde `capsule.crypto.js` y desde las pruebas del bloque 008).

## Qué se cifra

El **contenido** de una cápsula (mensajes, títulos de aportes) se cifra en el
momento en que se escribe y solo se descifra cuando la cápsula está abierta.
Los metadatos necesarios para operar (autor, invitados, `opensAt`, estado) no
se cifran: se necesitan para listar, autorizar y programar la apertura.

Algoritmo: **AES-256-GCM** con IV aleatorio de 12 bytes por mensaje y
`authTag` de 16 bytes. La clave se deriva con **scrypt**
(`kronos-capsules-v1` como sal, 32 bytes de salida) y se guarda en caché por
proceso.

## De dónde sale la clave

```
CAPSULE_SECRET  →  si no existe  →  JWT_SECRET  →  si no existe  →  error
```

- **Producción:** define `CAPSULE_SECRET` propio (independiente del secreto de
  sesión). Sin él, la clave de las cápsulas queda atada a `JWT_SECRET`.
- El servidor arranca igual si falta `CAPSULE_SECRET`, pero registra una
  advertencia de configuración al iniciar.
- `scripts/kronos-doctor.js` lo informa como variable opcional.

## Rotación de la clave

**Rotar `CAPSULE_SECRET` (o `JWT_SECRET` cuando se usa como respaldo) vuelve
ilegibles las cápsulas ya escritas**: el `authTag` de GCM no valida y el
descifrado falla. No hay migración automática.

Antes de rotar:

1. Inventaria las cápsulas vivas (`state: "scheduled"` con mensajes).
2. Abre o exporta lo que debas conservar (la apertura descifra y permite
   volver a cifrar con la clave nueva).
3. Rota el secreto y redespliega.

## Verificación

- Contratos del módulo: `server/test/capsules.contract.test.js`
- End-to-end con MongoDB real: `server/test/capsules.e2e.test.js`
  (crea la cápsula, comprueba que el contenido cifrado no expone texto plano
  y que la apertura programada lo descifra).

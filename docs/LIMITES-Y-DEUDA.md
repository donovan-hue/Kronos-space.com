# Límites y deuda declarada

Este documento existe para que nada de lo que sigue se descubra por sorpresa:
son límites conscientes y deuda conocida del estado actual. Cada punto dice qué
es, por qué está así y qué haría falta para cambiarlo.

## 1. La capa de federación es de solo lectura

El perfil público publica un actor con su `inbox`, como manda ActivityPub, pero
ese buzón **responde 501**: la plataforma no procesa actividades entrantes. Es
un límite declarado, no un éxito simulado: la respuesta lo dice y una prueba lo
sella (`server/test/federation-live-support.contract.test.js`, caso 045b, y la
comprobación con almacenamiento sano en la línea del 501).

Cambiarlo exige firmas HTTP (RFC 9421), protección contra repetición, colas de
procesamiento y pruebas de interoperabilidad con otra instancia. Hasta que se
apruebe, la coherencia pública es esta: descubrimiento y lectura, sin entrada.

## 2. Los archivos subidos son públicos por diseño

`/uploads` se sirve sin control de acceso: cualquier persona con la URL ve el
archivo. Es una decisión de producto (el feed es público), y por eso **no debe
describirse como almacenamiento privado**. Si el producto necesita media
privada, harían falta permisos por documento, URLs firmadas y purga de caché.

## 3. Tailwind ya tiene motor (resuelto el 2026-10-13)

`client/src/styles/tailwind.css` escribía clases de Tailwind sin motor que las
compilara: los assets contenían 0 utilidades y componentes enteros del kit
dependían de parches escritos a mano. Resuelto: `@tailwindcss/vite` está
conectado en `vite.config.js`, el CSS construido ya incluye las utilidades
(191 kB → 228 kB) y el preflight sigue desactivado a propósito.

Lo que queda en pie de este punto: las reglas a mano del kit siguen donde
estaban y no se retiran, porque el CSS sin capas gana la cascada sobre la capa
`utilities`: son la última palabra de esa geometría. Retirarlas sería un
cambio de aspecto y no hace falta para nada.

## 4. La monetización es simbólica

No hay pasarela de pago. El apoyo entre cuentas son créditos Kronos (★) y la
interfaz lo dice: no se procesa ningún pago real. La decisión de fondo (si se
integra un cobro real y con qué proveedor) sigue abierta, y por eso nada en el
producto promete un cobro que no existe.

## 5. Capacidades de IA sin proveedor puesto

La imagen, el guion y la voz funcionan con la llave de OpenRouter ya cargada.
El **video** no: OpenRouter no genera video, así que la capacidad queda
declarada como no configurada hasta que exista `VIDEO_API_KEY` +
`VIDEO_API_URL`. El **chat** espera `GEMINI_API_KEY`. Y no hay libro de coste
por usuario: el control actual es el presupuesto por reintentos, no un saldo.

## 6. Los catálogos no traen relleno

El catálogo de música y el de voces empiezan vacíos: las pistas y las voces las
publica quien administra. Se prefirió vacío con un aviso claro antes que
inventar contenido que nadie subió.

## 7. Una sola instancia

El tiempo real (Socket.IO) funciona con una instancia. Hay un límite
documentado para la topología remota y multi-instancia; hoy no está probado.

## 8. Lo que este documento no cubre

Las credenciales y aprobaciones que dependen del propietario (correo, video,
Google de extremo a extremo, accesos de producción) viven en
`docs/PENDIENTES.md`, con su variable exacta. Aquí solo está lo que es límite
de diseño o deuda técnica.

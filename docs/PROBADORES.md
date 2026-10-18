# Probadores: cómo se comprueba cada herramienta de Kairos

Cada herramienta tiene su probador, y cada probador dice con claridad cuánto
cuesta. Nada se da por bueno porque "debería funcionar": se comprueba, y lo que
no está configurado se reporta como **falta** con el nombre de la variable, no
como un aprobado falso.

Todos los comandos se corren desde la raíz del repositorio. El probador es un
solo script con modos: `scripts/kairos-probadores.js`.

```
npm run probar          # cableado local, sin red, coste 0
npm run probar:vivo     # lecturas del despliegue, coste 0
TOKEN=... npm run probar:vivo   # además capacidades, voces y música
```

## Qué prueba cada cosa

| Herramienta | Probador sin costo | Llamada real (una sola) | Qué se da por bueno |
|---|---|---|---|
| Imagen | `npm run probar` + `npm run probar:vivo` (capacidad `imagen`) | `SMOKE_IMAGE=1 npm run smoke:openrouter` o `TOKEN=... npm run probar:imagen` | El proveedor está asignado, la ruta montada y una generación real devuelve una imagen guardada |
| Guion | `npm run probar` + `probar:vivo` (capacidad `texto`) | `npm run smoke:openrouter` (fase de texto) o `TOKEN=... npm run probar:guion` | Un guion real vuelve con su ficha y su escena |
| Voz (locución) | `npm run probar` + `probar:vivo` (capacidad `voz`) | `TOKEN=... npm run probar:voz` | Una locución corta vuelve y queda en `/uploads/voices/` |
| Voz (grabación) | `npm run test:client` (pruebas del estudio) | — | Graba con el micrófono, avisa si no hay permiso y entra en la receta |
| Video | `npm run probar` + `probar:vivo` (capacidad `video`) | `TOKEN=... npm run probar:video` | Un trabajo de video se encola y devuelve estado (lo cobra tu proveedor) |
| Chat | `npm run probar` + `probar:vivo` (capacidad `chat`) | `TOKEN=... npm run probar:chat` | Una respuesta corta vuelve con el texto y su uso |
| Música | `npm run probar` + `TOKEN=... npm run probar:vivo` (capacidad `musica`) | No se cobra nunca: las pistas las sube administración | El catálogo responde y cuenta las pistas publicadas de verdad |
| Filtros, tono y estudio | `npm run test:client` | No se cobra nunca: corre en el navegador | 16 filtros, 8 ajustes, línea de tiempo, velocidad y transiciones |
| Despliegue | `npm run probar:vivo` | — | El servidor responde con su commit, su entorno y su base conectada |

## El token de sesión

Las lecturas y las llamadas reales pasan por tu propio servidor, y ese servidor
pide sesión. El token no se guarda en ningún archivo: se pasa en el comando.

```
TOKEN=eyJ... npm run probar:video
```

Se copia del navegador con la sesión abierta (almacenamiento local del sitio,
el valor que empieza con `eyJ`). Es de un solo uso aquí y caduca solo.

## Cómo se lee la salida

- **OK** — comprobado.
- **FALTA** — le falta una variable o un proveedor. Dice cuál, con su nombre.
- **FALLA** — hay algo roto. El script sale con código 1 para poder encadenarlo.
- **OMITE** — no se pidió o no se puede desde aquí (por ejemplo, sin token).

## Lo que este probador no hace

- No encadena llamadas ni reintenta: una bandera, una petición. Si algo se
  prueba dos veces, se lee dos veces el resultado y se cobra dos veces.
- No sustituye a `npm test` (contratos, sin red) ni a `npm run smoke:openrouter`
  (el detalle del cableado de OpenRouter con sus seis fases). Los complementa:
  el probador contesta "¿ya sirve?", el humo contesta "¿por qué no sirve?".
- No toca tags, releases ni visibilidad del repositorio.

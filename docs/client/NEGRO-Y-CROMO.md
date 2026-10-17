# Negro profundo, espejo pulido y reloj vivo

## Dirección visual

- Negro absoluto (`--k-bg` / `--k-surface`: `#000000`), sin tintes verdes, azules o rosas en los estilos de la aplicación.
- La referencia aportada por el propietario se utiliza únicamente para observar el acabado. **No se copia al repositorio, no se incrusta y no se sirve como fondo.**
- En la portada se elimina el nudo/masa de fondo: quedan reloj, anillo y planeta sobre negro, con el rótulo KRONO / SPACE de distintos pesos.
- `MirrorMetalDefs`, `MirrorWordmark` y `KronosClock` dibujan vectores originales. El metal combina reflexión de horizonte, aristas y bisel especular SVG, no una foto recortada ni un filtro global gris.
- Fuente variable Roboto autoalojada, procedente de `@fontsource-variable/roboto` 5.3.0; archivo latino de 43 KB y licencia OFL en `client/public/fonts/brand/`. No necesita servicios de fuentes externos.

## Hora y movimiento

- Las tres manecillas se calculan con `Date` en la zona horaria del dispositivo. La horaria incluye minutos, segundos y milisegundos; la minutera incluye segundos.
- La animación consulta la hora real en cada actualización (hasta unos 30 fps), no cuenta vueltas CSS ni acumula segundos de un intervalo. Al regresar de una pestaña oculta o ajustar la hora del sistema, se resincroniza.
- Es la hora del dispositivo, **no una sincronización NTP ni una garantía contra un reloj del sistema mal configurado**.
- El planeta recorre una órbita de 24 segundos, con perspectiva, variación de escala, semianillos y oclusión delante/detrás del reloj. El plano orbital tiene una precesión suave.
- El conmutador existente pausa la órbita. **No detiene el reloj funcional**. Al ocultar la pestaña se cancelan los callbacks; al desmontar se limpian timers y listeners.
- La hora también existe en un elemento `time` accesible, sin anuncios `aria-live` cada segundo.

## Materiales compartidos y accesibilidad

- `design-tokens.css` es la paleta común. Los tokens antiguos y los del port de `kronos-system` son alias, no otras paletas competidoras.
- Se separa el rango completo oscuro/blanco de las marcas y ornamentos del material para texto funcional y botones. Las pruebas verifican 4.5:1 para los tokens de texto y cada parada de esos gradientes funcionales sobre las superficies previstas. Esto no constituye una auditoría WCAG integral de todas las pantallas.
- Foco sólido de teclado y alternativas para colores forzados. El logotipo SVG funciona sin WebGL.
- No se desaturan fotos, avatares ni videos; los filtros de edición de medios conservan su función.
- Las escenas 3D existentes usan luces neutras. En Kairos, el material conductor de baja rugosidad refleja el estudio y una onda suave altera geometría/normales; no descarga HDRI externos. No se usa como fondo de la portada.

## Comprobaciones

```sh
npm run test:client
npm run lint:client
npm run build
node scripts/ci/barrido-utilidades.mjs --estricto
node scripts/ci/generate-route-docs.mjs --check
cd client
npx playwright test liquid-chrome.spec.js feature-directory.spec.js kit-consumidores.spec.js kit-accesibilidad.spec.js --project=app
```

Las pruebas de navegador simulan API/sesión: comprueban estilos y comportamiento real de la interfaz, no la integración con el backend. Incluyen hora controlada en `America/Mexico_City`, cambio del reloj del sistema, pausa independiente de la hora, conservación del color del avatar, ausencia de desbordamiento, colores forzados y portada sin WebGL.

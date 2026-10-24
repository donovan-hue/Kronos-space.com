# Cascada de Kronos — una sola identidad

`app.css` es la **única entrada CSS** de la app y de la demo de Proyectos.
El diseño del producto vive en **una sola hoja**: `kronos.css`.

No hay estilos por pantalla, ni capas de override, ni una segunda hoja que
tapara a la primera. La identidad es una: **negro profundo + cromo líquido +
reloj 3D en movimiento constante**.

| Archivo | Responsabilidad |
|---|---|
| `app.css` | Entrada única: declara el orden de capas e importa las tres hojas |
| `tailwind.css` | Motor de utilidades (capas `theme`, `base`, `utilities`) |
| `design-tokens.css` | Vocabulario del color: los tokens `--k-*` (negro puro, cromo espejo) |
| `kronos.css` | **Todo** el diseño del producto: estructura, shell, pantallas e identidad |

Tailwind también puede emitir su capa interna `properties`; no es otra entrada
ni un tema adicional de la aplicación.

## Cómo se mantiene `kronos.css`

La hoja **no se edita a mano**: se genera.

```bash
node scripts/styles/consolidate-identity.js           # regenera la hoja
node scripts/styles/consolidate-identity.js --check   # sólo informa
node scripts/styles/consolidate-identity.js --detalle # muestra lo que se elimina
```

El generador:

1. lee las hojas de origen (las 30 anteriores) del historial de Git, con el
   orden real de `@import` —incluidos los anidados de `kronos-system/`—;
2. fusiona los selectores duplicados **sumando** sus declaraciones, sin
   perder las anteriores;
3. elimina las reglas cuya clase no usa nadie (con el censo de clases del
   código, incluidas las que se componen en runtime);
4. conserva intactas las guardas de accesibilidad (`!important` dentro de
   `prefers-reduced-motion` o `forced-colors`);
5. deja el bloque de identidad al final: es lo último que manda.

Si haces falta cambiar un estilo, se cambia en la hoja de origen que lo
tenía (en el historial) o se añade al final de `kronos.css` dentro del
bloque de identidad, y se regenera.

## Reglas de mantenimiento

- **Una sola hoja de producto.** No crear `styles/xyz.css` ni una capa
  `priority`. Si una regla nueva no entra en `kronos.css`, es que se está
  duplicando algo.
- La geometría del shell (anchos, niveles) sale de `design-tokens.css` y de
  las reglas del shell en `kronos.css`. No volver a declarar un ancho en
  otra parte.
- Los 24 `!important` restantes son guardas de movimiento reducido y colores
  forzados. Los controla `test/css-cascade.test.mjs`; no subir el presupuesto
  sin demostrar una necesidad de accesibilidad.
- El reset vive en `tailwind.css`, en `base`. Anidarlo bajo `kronos` anularía
  márgenes y rellenos de las utilidades, aunque su especificidad sea baja.
- En pares de `backdrop-filter`, escribir primero la propiedad con prefijo y
  después la estándar. El compilador puede descartar la estándar si se invierte.
- Los diálogos se centran **solo** con la regla `data-slot="dialog-content"`.
  No sumar otra traslación en las clases del componente. No confiar en que un
  `translate: none` redundante sobreviva a la optimización de producción.
- No borrar reglas con expresiones regulares sobre llaves. Usar AST, comprobar
  consumidores dinámicos y validar el build **más** geometría de navegador.

## Comprobaciones

```bash
npm test -w client
npm run build
npm run test:browser -w client -- --project=app layout-regression kit-consumidores kit-accesibilidad navigation completion-regression
```

Las pruebas de navegador usan fixtures, no cuentas ni medios reales. Para
medir el build en vez del servidor de desarrollo, usar `KRONOS_TEST_URL` con
la URL de `vite preview`. Se conservan los ensayos originales de posición y
foco: no se sustituyen por snapshots de estilos computados.

# Cascada de Kronos

`app.css` es la **única entrada CSS** de la app y de la demo de Proyectos.
Conservar módulos por pantalla no significa volver a cargar sistemas rivales.

| Capa declarada | Responsabilidad |
|---|---|
| `theme` | Variables del motor de utilidades |
| `base` | Reset mínimo; no anidarlo dentro de `kronos` |
| `components` | Reserva del motor para componentes |
| `utilities` | Utilidades Tailwind y del kit |
| `kronos` | Tokens, estructura, shell, pantallas y sistema visual |
| `priority` | Identidad y excepciones existentes que antes dependían de `!important` |

Tailwind también puede emitir su capa interna `properties`; no es otra entrada
ni un tema adicional de la aplicación.

## Reglas de mantenimiento

- `fan-nav.css` posee la geometría del shell; los anchos y niveles globales
  vienen de `design-tokens.css`. No añadir otro ancho en el tema o en densidad.
- `priority.css` conserva la presentación existente, **no introduce el rediseño
  de burbujas**. Se retiraron 196 declaraciones inferiores que ya no podían
  ganar. Evitar volver a escribirlas en la hoja de pantalla.
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

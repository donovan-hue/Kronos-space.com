# KRONOS — RESUMEN EN LISTA DE LA AUDITORÍA UNIFICADA

Versión corta de `docs/KRONOS-AUDITORIA-UNIFICADA-2026-09-19.md`. Cada punto es un problema encontrado y accionable.

## 🔴 Marca "Kronos Space" repetida

1. El logo + "kronos-space.com" aparece fijo en la barra superior en TODAS las pantallas (`TopBar.jsx`).
2. Además, 14 pantallas repiten a mano una etiqueta tipo "KRONOS / SOCIAL", "KRONOS / MESSAGES", "KRONOS / SETTINGS", "KAIROS / …", etc., justo encima del título.
3. En Login, Registro, "Olvidé mi contraseña" y "Restablecer contraseña" también se repite el logo + "KRONOSPACE".

## 🔴 Barra superior redundante

4. `AppLayout.jsx` monta dos navegaciones a la vez: `TopBar` arriba (ya sin botones, solo marca) y `FanNav` abajo (el abanico real). La de arriba sobra.

## 🔴 Botones duplicados / de más

5. "Crear publicación" tiene hasta 4 entradas distintas en la misma pantalla del feed (composer inline, botón "Editor completo", botón del estado vacío, satélite "Crear" del abanico).
6. "Editar perfil" existe en dos lugares distintos con los mismos campos: el modal de `Profile.jsx` y la página `/settings/profile`.
7. La cabecera del perfil ajeno tiene 5-6 botones sueltos al mismo nivel (Seguir, Mensaje, Silenciar, Bloquear, Reportar) sin agrupar.
8. El menú "···" de un post (Reportar/Silenciar/Bloquear) repite acciones que también están sueltas en el perfil, sin compartir el mismo patrón.
9. El editor de imágenes (recorte) muestra 6 botones a la vez (Usar original, Cancelar, Aplicar, Centrar, Rotar -90°, Rotar +90°) sin agrupar en un menú.

## 🟠 Navegación incompleta

10. Existen los "Grupos" (`/conversations`) pero ningún botón de la app lleva ahí; solo se llega escribiendo la URL a mano.
11. El botón "Historia" del abanico, fuera de Kairos, no lleva a nada real todavía (muestra "llegará pronto").

## 🟠 Botones inferiores / centrado

12. El abanico inferior sí está bien centrado en CSS.
13. El problema de percepción viene de que cada pantalla mete sus propios botones de acción (Publicar, Cargar más, Guardar borrador) pegados abajo, compitiendo visualmente con el abanico fijo.

## 🟡 Estructura y código (menos visible, pero pesa a futuro)

14. 4 hojas de CSS (`styles.css`, `design-tokens.css`, `design-system.css`, `chrome-minimal.css`) definen las mismas clases (`.k-button`, `.k-page-header`, `.k-topbar`, `.k-main-content`) por duplicado.
15. 4 pantallas completas (`AICenter`, `Settings`, `AdminCenter`, `MediaLibrary`) están escritas en una sola línea gigante de JSX, difícil de mantener.
16. Uso de estilos en línea (`style={{...}}`) en varias pantallas en vez de usar las clases del sistema de diseño ya definido.
17. `README.md` está vacío.

## 🟢 Lo que SÍ está bien (no tocar)

18. Backend sin datos simulados: exige MongoDB real, sin modo "en memoria" de respaldo.
19. Todos los botones principales revisados (Publicar, Seguir, Bloquear, Like, Guardar, etc.) están conectados a una acción real con backend real — no hay botones decorativos.
20. CI, pruebas automáticas y verificación de despliegue ya están funcionando correctamente.

---

## Plan sugerido (orden de ejecución si me das luz verde)

1. Quitar `TopBar` de las pantallas internas y las etiquetas "KRONOS / …" de las 14 pantallas.
2. Dejar un solo camino para crear publicación.
3. Dejar un solo editor de perfil.
4. Agrupar en un menú "···" las acciones de seguridad del perfil ajeno.
5. Dar acceso visible a "Grupos" desde algún punto de navegación.
6. Asegurar que ningún botón de pantalla quede fijo abajo compitiendo con el abanico.
7. Unificar las 4 hojas de CSS en una sola fuente de verdad.
8. Reformatear a multilínea las pantallas con JSX en una sola línea.

# KRONOSPACE — Benchmark social y plan maestro de producto

**Fecha:** 2026-09-19  
**Alcance:** producto completo, arquitectura social, diferenciación y tres direcciones visuales de aplicación completa.  
**Principio:** ninguna función visual se considera terminada sin modelo, API, permisos, persistencia, estados de interfaz y moderación.

---

## 1. Conclusión ejecutiva

Kronospace ya tiene una base funcional superior a un prototipo: autenticación local/Google, perfiles, seguidores, publicaciones, comentarios, guardados, multimedia, mensajes directos y grupales, presencia, notificaciones, búsqueda, moderación y herramientas Kairos de imagen, video, guion y chat.

El problema principal no es “falta de botones”. Es que todavía no existe una **tesis de producto diferenciada** ni una jerarquía consistente entre consumo, creación, comunidad e IA. Si se copian Stories, Reels, Spaces y comunidades sin una idea central, Kronospace terminará siendo una mezcla de Instagram, TikTok y X con otra pintura.

### Recomendación central

Convertir Kronospace en **la red social de creación con contexto y tiempo**, no en otra red de desplazamiento infinito.

La diferencia propuesta se compone de cuatro productos conectados:

1. **Órbitas:** espacios temáticos colaborativos con audiencia, duración y reglas propias.
2. **Cápsulas de tiempo:** contenido individual o colectivo que se publica o desbloquea en una fecha.
3. **Linaje creativo:** cada creación o remix conserva autoría, fuentes, versiones y herramientas utilizadas.
4. **Pulso:** resumen finito y configurable del contenido relevante, como alternativa al feed infinito.

Kairos no debe aparecer como un chatbot pegado a una red social. Debe operar como capa transversal para crear, editar, traducir, resumir y organizar, siempre bajo control del usuario.

---

## 2. Auditoría de Kronospace actual

### 2.1 Capacidades existentes verificadas en código

| Área | Estado actual |
|---|---|
| Autenticación | Registro, login, Google, recuperación, verificación de correo, refresh y sesiones por dispositivo |
| Perfil | Avatar, portada, biografía, privacidad, seguidores y seguidos |
| Publicaciones | Texto, imagen, carrusel de hasta 4 imágenes, video, edición, eliminación y detalle |
| Multimedia | Subida, texto alternativo, recorte, centrado, zoom, rotación y conversión JPG/PNG/WebP |
| Interacción | Like binario, comentarios, compartir nativo/enlace y guardados privados |
| Feed | Paginado, refresco, carga incremental, ocultamiento y exclusiones por moderación |
| Mensajes | Directos, grupos, adjuntos, presencia, escritura, entrega y lectura |
| Descubrimiento | Búsqueda de personas y publicaciones |
| Seguridad | Bloqueos, silencios, ocultamiento, reportes, cola de moderación y roles |
| Notificaciones | Sociales, filtros, leído individual y leído total |
| Kairos | Chat, imagen, video, guion, historial, biblioteca y publicación de resultados |
| Personalidad IA | Normal, Directo, Sarcástico y Mal humor, persistidos por usuario |

### 2.2 Huecos estructurales reales

| Hueco | Consecuencia |
|---|---|
| No existe Stories | El producto no tiene formato efímero ni creación rápida contextual |
| No existe video vertical dedicado | El video compite dentro del feed normal y no tiene experiencia de consumo propia |
| Reacción guardada como booleano | La interfaz puede mostrar variedad, pero el servidor no conoce el tipo de reacción |
| Comentarios planos | Sin hilos, respuestas, menciones, reacciones o fijado del autor |
| Sin audiencia por publicación | No hay público/seguidores/círculo/privado por pieza |
| Sin hashtags, temas o entidades | El descubrimiento depende de texto general y personas |
| Sin comunidades | Los grupos actuales son conversaciones, no espacios públicos con roles y contenido |
| Sin feed seleccionable | No hay “Siguiendo”, cronológico, temas, círculos ni control explícito del algoritmo |
| Sin onboarding de intereses | La primera experiencia no construye un feed útil ni explica la propuesta |
| Sin analítica de creador | No hay alcance, retención, guardados, fuentes ni rendimiento por publicación |
| Sin eventos o directo | No existe coordinación temporal de comunidad |
| IA separada de varios flujos | Kairos tiene centros propios, pero no asiste de forma contextual en todo el producto |
| Diseño no unificado | Navegación, densidad, tarjetas y acciones cambian entre pantallas |

---

## 3. Comparación con redes sociales actuales

### 3.1 Instagram

**Fortalezas observadas:** publicaciones, Reels, Stories, Live, mensajería, Close Friends, notas, edición, analítica y distintos niveles de privacidad. Close Friends permite compartir notas, Reels y Stories con una lista restringida. Instagram también permite ocultar contadores de likes y visualizaciones, una señal importante de control de presión social.

**Qué aprender:**
- Un mismo usuario necesita formatos según intención, no un compositor universal.
- La audiencia debe seleccionarse por contenido.
- El editor multimedia y la mensajería son parte central, no accesorios.

**Qué no copiar:**
- Navegación saturada y funciones repetidas en distintas superficies.
- Mezclar contenido recomendado, compras y relaciones sin control claro.

Fuentes:
- https://help.instagram.com/476003390920140
- https://help.instagram.com/448523408565555
- https://help.instagram.com/113355287252104/

### 3.2 TikTok

**Fortalezas observadas:** creación y edición de video/foto, efectos, sonidos, Duet, Stitch, Stories, playlists, Studio, LIVE, series, stickers, búsqueda y feeds diferenciados. El catálogo oficial muestra que su ventaja no es solamente video vertical: es la cadena completa de captura → edición → participación → distribución → analítica.

**Qué aprender:**
- Crear y consumir deben sentirse inmediatos.
- Remix y colaboración tienen que conservar la relación con la obra original.
- Un estudio creativo integrado aumenta la producción sin llenar el feed de controles.

**Qué no copiar:**
- Hacer del desplazamiento infinito el único centro del producto.
- Ocultar por completo por qué se recomienda algo.

Fuentes:
- https://support.tiktok.com/en/using-tiktok
- https://support.tiktok.com/en/using-tiktok/creating-videos/creator-tools-on-tiktok

### 3.3 X

**Fortalezas observadas:** conversación pública, tendencias, búsqueda, listas, comunidades, Spaces, marcadores, artículos y notas comunitarias. Las listas permiten crear timelines específicos por cuentas o intereses, públicos o privados, y fijarlos en Inicio.

**Qué aprender:**
- El usuario debe poder construir sus propios feeds.
- Los eventos en vivo y la conversación contextual generan comunidad.
- Guardar no es lo mismo que organizar: hacen falta colecciones.

**Qué no copiar:**
- Jerarquías confusas entre funciones gratuitas y premium.
- Dar visibilidad a conflicto solamente porque genera actividad.

Fuentes:
- https://help.x.com/en/using-x/x-lists
- https://help.x.com/en/using-x/bookmarks
- https://help.x.com/en/using-x/communities
- https://help.x.com/en/using-x/spaces

### 3.4 Threads y fediverso

**Fortalezas observadas:** conversación breve, combinación de texto/fotos/video e interoperabilidad gradual con ActivityPub. Threads define el fediverso como servidores independientes capaces de comunicarse, equivalente social de servicios de correo distintos.

**Qué aprender:**
- La identidad y el contenido no deberían quedar encerrados para siempre.
- Un feed cronológico separado puede coexistir con recomendaciones.
- Diseñar IDs, enlaces y permisos pensando en interoperabilidad evita rehacer todo después.

**Qué no copiar:**
- Añadir interoperabilidad antes de que identidad, moderación y privacidad internas estén maduras.

Fuentes:
- https://help.instagram.com/169559812696339
- https://help.instagram.com/788669719351544/

### 3.5 Bluesky

**Fortalezas observadas:** feeds personalizados, algoritmos elegibles, moderación por etiquetas, federación y Starter Packs. Los Starter Packs agrupan personas y feeds para que un usuario entre directamente a una comunidad. Bluesky también plantea controles “mostrar más/menos” y seguimiento de contenido ya visto para evitar duplicados.

**Qué aprender:**
- El feed puede ser un producto creado o elegido por el usuario.
- Onboarding por comunidades funciona mejor que una pantalla vacía.
- Moderación y algoritmos deben ser capas configurables.

**Qué no copiar:**
- Exponer complejidad técnica del protocolo a usuarios normales.

Fuentes:
- https://bsky.social/about/blog/05-07-2024-product-roadmap
- https://bsky.social/about/blog/06-26-2024-starter-packs
- https://bsky.social/about/blog/08-28-2024-anti-toxicity-features

### 3.6 Discord

**Fortalezas observadas:** comunidades persistentes, roles, permisos, canales, foros, voz, video, escenarios y actividades. Su ventaja es la profundidad de comunidad, no el descubrimiento público.

**Qué aprender:**
- Una comunidad necesita roles, reglas, canales y herramientas de moderación.
- Eventos y salas en vivo deben pertenecer a un espacio con responsables claros.
- Presencia y actividad compartida crean cercanía si tienen controles de privacidad.

**Qué no copiar:**
- Árboles de navegación difíciles de aprender.
- Separar tanto el contenido que descubrir algo nuevo resulte complicado.

Fuentes:
- https://support.discord.com/hc/en-us/articles/1500010879761-Stage-Channel-Guidelines
- https://support.discord.com/hc/en-us/articles/33694251638295-Discord-Account-Caps-Server-Caps-and-More

### 3.7 Pinterest

**Fortalezas observadas:** búsqueda visual, tableros, colecciones colaborativas y paso de inspiración a acción. Sus tableros recientes combinan contenido guardado, recomendaciones relacionadas y asistencia de IA.

**Qué aprender:**
- Guardados deben convertirse en colecciones útiles, no en un cementerio cronológico.
- La IA puede trabajar sobre la biblioteca personal del usuario sin dominar el feed público.
- El contenido visual puede conservar utilidad meses después.

**Qué no copiar:**
- Orientar cada experiencia hacia compra o catálogo.

Fuente:
- https://newsroom.pinterest.com/news/pinterest-boards-get-ai-powered-upgrade-for-personalized-experience/

### 3.8 BeReal

**Fortaleza conceptual:** una regla de producto clara — compartir un momento real en una ventana limitada — creó diferenciación con pocas funciones.

**Qué aprender:**
- Una mecánica propia vale más que veinte botones copiados.
- Limitar frecuencia y duración puede aumentar significado y reducir consumo compulsivo.

**Qué no copiar:**
- Depender de una sola mecánica sin una evolución coherente.

---

## 4. Matriz funcional: competencia frente a Kronospace

| Capacidad | Instagram | TikTok | X | Bluesky | Discord | Kronos actual | Prioridad Kronos |
|---|---:|---:|---:|---:|---:|---:|---:|
| Feed de publicaciones | Sí | Sí | Sí | Sí | Parcial | Sí | Mantener y ordenar |
| Foto/carrusel/video | Sí | Sí | Sí | Sí | Sí | Sí | Pulir |
| Stories/efímero | Sí | Sí | No | No | No | No | Alta |
| Video vertical | Sí | Sí | Sí | Sí | No | No | Alta |
| Live/voz | Sí | Sí | Spaces | No | Sí | No | Media |
| Reacciones múltiples | Parcial | Sí | Parcial | Parcial | Sí | No | Alta |
| Comentarios en hilos | Sí | Sí | Sí | Sí | Sí | No | Alta |
| Mensajes/grupos | Sí | Sí | Sí | Sí | Sí | Sí | Pulir |
| Comunidades | Canales | Parcial | Sí | Feeds/listas | Sí | No | Alta |
| Feed elegible | Parcial | Parcial | Listas | Sí | Canales | No | Alta |
| Colecciones | Guardados | Favoritos | Carpetas | Feeds | Canales | Guardados | Media |
| Editor creativo | Alto | Muy alto | Bajo | Bajo | Medio | Medio | Alta |
| IA integrada | Meta AI | IA creativa | Grok | No central | Bots | Kairos | Diferenciador |
| Moderación avanzada | Sí | Sí | Sí | Etiquetas | Roles | Base sólida | Ampliar |
| Interoperabilidad | Threads | No | No | AT Protocol | Integraciones | No | Largo plazo |
| Cápsulas temporales | No central | No | No | No | Eventos | No | **Diferenciador** |
| Linaje de remixes | Parcial | Duet/Stitch | Citas | Embeds | Hilos | No | **Diferenciador** |
| Feed finito/intencional | No | No | No | Configurable | No aplica | No | **Diferenciador** |

---

## 5. Propuesta diferencial: el sistema Kronos

### 5.1 Órbitas

Una Órbita es un espacio social alrededor de una intención: proyecto, tema, evento, grupo de amigos o comunidad pública.

Cada Órbita define:
- nombre, descripción, portada e identidad visual;
- pública, privada o por invitación;
- duración: 24 horas, 7 días, hasta una fecha o permanente;
- roles: propietario, moderador, creador y miembro;
- formatos permitidos;
- feed cronológico o curado;
- reglas y etiquetas;
- canal de conversación y calendario.

Diferencia frente a Discord: menos estructura técnica y más descubrimiento visual.  
Diferencia frente a comunidades de X: creación multimedia y Kairos integrados.  
Diferencia frente a Instagram: contexto persistente y control de reglas/audiencia.

### 5.2 Cápsulas de tiempo

Contenido que se cierra ahora y se abre después.

Modalidades:
- personal;
- compartida entre amigos;
- cápsula de una Órbita;
- pública con fecha de revelación;
- recuerdo recurrente anual.

Requisitos importantes:
- zona horaria explícita;
- cifrado y audiencia;
- posibilidad de cancelar antes del cierre;
- notificaciones programadas;
- política clara si una cuenta se elimina;
- moderación previa para cápsulas públicas.

### 5.3 Linaje creativo

Todo contenido derivado puede declarar:
- publicación original;
- autor original;
- tipo de derivación: respuesta visual, remix, versión o colaboración;
- herramientas Kairos utilizadas;
- medios importados y permisos;
- historial de versiones.

Esto mejora atribución, reduce robo de contenido y transforma la IA en colaboración verificable.

### 5.4 Pulso

En vez de imponer desplazamiento infinito, el usuario elige una sesión:
- 5 minutos;
- 15 minutos;
- “Ponerme al día”;
- solo amigos;
- una o varias Órbitas;
- cronológico.

Al terminar, Kronos muestra “Estás al día” y ofrece salir, crear o abrir otra sección. El feed infinito puede existir como opción secundaria, no como única experiencia.

### 5.5 Kairos contextual

Kairos debe aparecer donde aporta valor:
- redactar o resumir sin publicar automáticamente;
- texto alternativo accesible sugerido y editable;
- subtítulos y traducción conservando personalidad;
- limpieza de audio y transcripción;
- detección preventiva de datos personales antes de publicar;
- resumen de una Órbita o conversación;
- agrupación inteligente de guardados;
- asistencia de moderación con decisión humana;
- explicación transparente de recomendaciones.

---

## 6. Arquitectura de información propuesta

### Navegación principal — máximo cinco destinos

1. **Inicio** — Pulso, Siguiendo y Órbitas fijadas.
2. **Explorar** — temas, personas, Órbitas y contenido; una sola búsqueda global.
3. **Crear (+)** — publicación, historia, cápsula, Órbita o Kairos.
4. **Mensajes** — directos, grupos y actividad en tiempo real.
5. **Perfil** — contenido, cápsulas abiertas, colecciones y configuración.

Notificaciones se abre desde un icono único en la cabecera. Guardados vive en Perfil/Colecciones. Kairos se abre desde Crear y desde herramientas contextuales, evitando un destino repetido en cada pantalla.

### Regla de búsqueda

- Una sola barra global en Explorar.
- En desktop puede existir un botón/icono que abre búsqueda tipo command palette.
- No repetir barras grandes en Inicio, Mensajes, Perfil y Configuración.
- La búsqueda local solo aparece dentro de listas que realmente lo necesiten y se presenta compacta.

### Menú Crear

- Publicación.
- Historia.
- Cápsula de tiempo.
- Órbita.
- Crear con Kairos.

Cada entrada se habilita únicamente cuando su flujo completo exista.

---

## 7. Tres direcciones visuales completas

Las tres respetan negro profundo, acciones compactas, una sola búsqueda global, feed de 620–680 px y navegación móvil de cinco destinos.

### Opción A — Obsidian Champagne

**Identidad:** editorial, cálida, exclusiva.  
**Acento:** champagne `#D8B978`.  
**Tipografía:** serif de exhibición para títulos + sans neutral para interfaz.  
**Materiales:** negro mate, líneas finas doradas, vidrio mínimo, fotografías protagonistas.

**Aplicación completa:**
- Auth dividido: mensaje de marca + formulario contenido.
- Desktop: sidebar izquierda de 224 px, feed central y rail contextual derecho.
- Móvil: cabecera mínima y navegación inferior.
- Perfil tipo revista, con portada corta y contenido en columnas controladas.
- Mensajes sobrios con burbujas pequeñas.
- Kairos como estudio editorial.
- 3D limitado al login, estados vacíos y transiciones; nunca detrás del texto.

**Ventaja:** sensación premium inmediata y legibilidad alta.  
**Riesgo:** puede sentirse demasiado formal para comunidades juveniles.

### Opción B — Midnight Sapphire

**Identidad:** tecnológica, espacial y precisa.  
**Acento:** zafiro `#5B8CFF` con cyan tenue para estados informativos.  
**Tipografía:** grotesca geométrica + mono para metadatos.  
**Materiales:** paneles azul-negro, profundidad por iluminación y bordes espectrales discretos.

**Aplicación completa:**
- Auth con órbita WebGL ligera y panel flotante.
- Navegación lateral colapsable en desktop; dock inferior en móvil.
- Órbitas representadas como espacios, no como círculos decorativos.
- Pulso muestra progreso de sesión y por qué se recomienda cada pieza.
- Kairos vive en un panel contextual deslizable.
- Multimedia a ancho controlado con fondo adaptativo, nunca cuadro gigante.
- Efectos 3D reaccionan a navegación, no al scroll de cada tarjeta.

**Ventaja:** mejor correspondencia con Kronos, Kairos y la propuesta temporal-espacial.  
**Riesgo:** requiere disciplina para no convertir cada pantalla en ciencia ficción ruidosa.

### Opción C — Black Ruby

**Identidad:** cinematográfica, social y expresiva.  
**Acento:** rubí `#E05A68`, con cobre oscuro para profundidad.  
**Tipografía:** sans humanista con títulos de alto contraste.  
**Materiales:** negro aterciopelado, gradientes radiales y movimiento orgánico.

**Aplicación completa:**
- Auth cinematográfico de una sola columna en móvil y composición asimétrica en desktop.
- Feed más humano: autores, conversación y reacciones tienen prioridad.
- Historias y cápsulas usan halos y estados temporales rubí.
- Comunidades muestran actividad y presencia sin paneles gigantes.
- Mensajes y grupos son el centro secundario del producto.
- 3D usado en cápsulas, recuerdos y eventos.

**Ventaja:** personalidad fuerte y excelente para contenido creativo/cultural.  
**Riesgo:** el rojo debe reservarse para marca e interacción; errores necesitan otro tratamiento semántico.

### Recomendación visual

Adoptar **Midnight Sapphire como sistema principal**, incorporar la tipografía editorial y espacios en blanco de **Obsidian Champagne**, y reservar la expresividad de **Black Ruby** para campañas, eventos y cápsulas destacadas. Esto evita tres productos paralelos y produce una identidad propia coherente.

---

## 8. Plan de ejecución

### Fase 0 — Fundamentos de producción

- Inventario definitivo de colecciones e índices actuales.
- Backup verificable y estrategia de migraciones reversibles.
- Observabilidad de errores, latencia, media y trabajos IA.
- Feature flags para funciones nuevas.
- Política de almacenamiento, CDN, transcodificación y eliminación.
- Presupuesto de bundle: sacar WebGL/Three.js de la carga inicial donde no sea necesario.

**Cierre:** despliegues reversibles y métricas base antes de cambiar modelos sociales.

### Fase 1 — Sistema visual y navegación

- Elegir dirección visual.
- Tokens globales definitivos.
- Nuevo shell responsive completo.
- Navegación de cinco destinos.
- Una sola búsqueda global.
- Menú Crear único.
- Unificar diálogos, menús, botones, carga, vacíos y errores.
- Aplicar diseño a Auth, Inicio, Explorar, Crear, Mensajes, Perfil, Kairos, Notificaciones, Configuración, Moderación y Admin.

**Cierre:** ninguna pantalla conserva layouts o estilos anteriores fuera del nuevo sistema.

### Fase 2 — Publicación y multimedia

- Reacciones múltiples persistentes con conteos por tipo.
- Respuestas a comentarios, menciones, fijado y edición.
- Audiencia por publicación.
- Hashtags/temas normalizados.
- Editor de imagen: filtros no destructivos y punto focal persistente.
- Editor de video: recorte temporal, portada, relación, mute, subtítulos y compresión.
- Procesamiento asíncrono y variantes de media.
- Diálogo de salida consistente: eliminar cambios o seguir editando.
- Colecciones privadas para guardados.

**Cierre:** publicación completa móvil/desktop, accesible y recuperable ante fallos de red.

### Fase 3 — Stories y video

- Modelo y API de historias con expiración.
- Audiencias y respuestas privadas.
- Visor, creador y archivo personal.
- Video vertical como feed opcional, nunca sustituto forzado de Inicio.
- Subtítulos, progreso, mute persistente y controles de consumo.
- Políticas de música y copyright antes de sonidos reutilizables.

**Cierre:** historias expiran realmente y el video tiene transcodificación, moderación y analítica.

### Fase 4 — Órbitas

- Modelos Orbit, Membership, Role y OrbitPost.
- Invitaciones, solicitudes y roles.
- Feed, chat, calendario y reglas.
- Moderación propia más moderación de plataforma.
- Descubrimiento y paquetes de bienvenida.
- Órbitas temporales y archivo.

**Cierre:** comunidad pública/privada completa sin duplicar conversaciones existentes.

### Fase 5 — Cápsulas de tiempo

- Modelo cifrado y estados draft/sealed/scheduled/opened/cancelled.
- Scheduler idempotente y zonas horarias.
- Cápsulas individuales y colaborativas.
- Notificaciones de cierre/apertura.
- Privacidad, recuperación, moderación y eliminación.
- Experiencia 3D opcional para apertura.

**Cierre:** apertura fiable aun con reinicios y sin exponer contenido antes de tiempo.

### Fase 6 — Pulso y feeds elegibles

- Feeds Siguiendo, Cronológico, Órbitas y Descubrir.
- Preferencias “más/menos de esto”.
- Registro de visto para reducir duplicados.
- Sesiones finitas de Pulso.
- Explicación de recomendación.
- Controles para contenido generado por IA.

**Cierre:** usuario controla fuente, duración y lógica general de su feed.

### Fase 7 — Linaje creativo y Kairos contextual

- Modelo de derivación y versiones.
- Remix/respuesta visual con atribución.
- Etiquetado de IA y procedencia.
- Kairos en compositor, mensajes, accesibilidad y moderación.
- Traducción preservando personalidad.
- Resúmenes de Órbitas y conversaciones bajo solicitud.

**Cierre:** toda derivación puede rastrearse y Kairos nunca publica sin confirmación.

### Fase 8 — Creadores, confianza y lanzamiento

- Analítica privada de creador.
- Panel de salud de comunidad.
- Apelaciones y estado de reportes.
- Rate limits adaptativos y anti-spam.
- Exportación y portabilidad de datos.
- Accesibilidad WCAG, pruebas móviles y rendimiento.
- Onboarding por intereses y Órbitas.

---

## 9. Prioridad sugerida de backlog

### P0 — Antes de sumar formatos

1. Sistema visual definitivo.
2. Shell y navegación nuevos.
3. Una sola búsqueda global.
4. Reacciones reales por tipo.
5. Comentarios con respuestas.
6. Audiencia por publicación.
7. Procesamiento multimedia robusto.
8. Diálogos propios sin `window.confirm`.

### P1 — Diferenciación inicial

1. Órbitas MVP.
2. Stories con backend real.
3. Colecciones de guardados.
4. Feeds Siguiendo/Cronológico/Órbitas.
5. Kairos contextual y etiquetado IA.
6. Pulso finito.

### P2 — Ventaja propia

1. Cápsulas de tiempo.
2. Linaje creativo/remix.
3. Órbitas temporales con eventos.
4. Resúmenes y traducción contextual.
5. Paquetes de bienvenida a comunidades.

### P3 — Escala

1. Live/voz.
2. Federación/interoperabilidad.
3. Monetización de creador, solo después de confianza, analítica y moderación.

---

## 10. Decisiones que deben evitarse

- No construir tres frontends permanentes: se comparan tres conceptos y se consolida uno.
- No añadir botones de Stories, Live, Órbitas o Cápsulas antes de tener flujo completo.
- No poner una barra de búsqueda grande en cada pantalla.
- No convertir cada publicación en una tarjeta con bordes, sombras y botones de texto.
- No reproducir automáticamente audio.
- No cargar WebGL en todas las rutas.
- No permitir que Kairos publique, modere o traduzca de forma irreversible sin confirmación.
- No usar la base de producción como banco de pruebas manuales; las migraciones deben ser compatibles, respaldadas y reversibles.
- No copiar funciones solo porque otra red las tiene: cada módulo debe reforzar Órbitas, Tiempo, Linaje o Pulso.

---

## 11. Métricas de producto recomendadas

Evitar optimizar únicamente “tiempo en pantalla”. Medir:

- porcentaje de sesiones Pulso completadas;
- publicaciones con conversación significativa;
- respuestas recibidas por creador nuevo;
- retención dentro de Órbitas saludables;
- contenido guardado que vuelve a consultarse;
- cápsulas creadas y abiertas;
- remixes correctamente atribuidos;
- reportes por mil interacciones y tiempo de resolución;
- porcentaje de recomendaciones ocultadas;
- tasa de publicación después de usar Kairos;
- accesibilidad: contenido visual con texto alternativo/subtítulos.

---

## 12. Siguiente decisión

Antes de implementar las fases 1–8 se requiere una sola elección visual:

- **A — Obsidian Champagne** si la prioridad es lujo editorial.
- **B — Midnight Sapphire** si la prioridad es identidad tecnológica/espacial.
- **C — Black Ruby** si la prioridad es comunidad creativa y carácter cinematográfico.
- **Recomendación:** B como base, A para estructura/tipografía y C únicamente como acento de eventos/cápsulas.

Una vez aprobada la dirección, se convierte en tokens y componentes reales compartidos por toda la aplicación; no en CSS superpuesto pantalla por pantalla.

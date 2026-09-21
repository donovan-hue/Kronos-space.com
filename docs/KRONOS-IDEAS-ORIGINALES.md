# KRONOS — 3 ideas originales de integración (+ recomendación)

**Fecha:** 2026-09-21 · **Criterio:** nada de esto existe en Instagram, TikTok, X, Bluesky, Discord, BeReal, Pinterest ni Snapchat como producto. Las tres nacen de los tres diferenciadores que Kronos YA tiene (tiempo, linaje, consumo finito) usando datos que YA existen en la base. No hay que copiar nada: hay que profundizar lo propio.

---

## IDEA 1 — «Constelación»: tu historia como cielo

### Qué es
Tu perfil gana una segunda vista: en lugar de una lista cronológica, tus creaciones se dibujan como un **cielo estrellado interactivo**. Cada estrella es una publicación, cápsula u órbita vivida. El eje del tiempo es la órbita (rotación): lo antiguo queda hacia el centro, lo reciente en el borde. El brillo de cada estrella es su resonancia real (interacciones). Las estrellas conectadas por líneas finas son linaje: una publicación y sus remixes forman una constelación de verdad.

### Tal cual la verá el usuario

```
        ·           ✦            ·
   ·        ╲      ╱   ╲      ·
          —— ●—————————● ——          ← tu remix más viajero
   ✦     ·     ╲  ╱        ·    ✦
        ·       ● ←_toque: "Nebulosa de Orión,
              ╱     2.4k interacciones, 3 remixes,
        ✦    ·       1 cápsula la menciona"
   ·         ·    ✦        ·

  [ Mes ]  [ Año ]  [ Todo ]        ← zoom temporal
  "Tu cielo 2026: 214 estrellas · 12 constelaciones de remix
   · la más brillante: 'Nebulosa de Orión'"
        [ Compartir mi constelación ]
```

- Tocar una estrella abre la pieza original (post, cápsula sellada —que se ve apagada hasta abrirse—, órbita vencida).
- El zoom cambia de escala: "Mes" (tu septiembre), "Año" (tu 2026), "Todo".
- "Compartir mi constelación" genera una imagen/tablero público con tu cielo — el resumen anual que ninguna red tiene.
- Las cápsulas selladas se ven como estrellas tenues con anillo: sabes que ahí hay algo, no sabes qué, y se enciende el día que se abre.

### Cómo funciona por dentro (todo existe ya)
- `Post` (createdAt, likes/comments/savedBy → brillo), `Capsule` (opensAt → anillo), `Orbit` (expiresAt), `lineage.derivedFrom` (las líneas).
- Un endpoint `GET /api/users/:id/constellation?scale=month|year|all` que agrega en el servidor (misma privacidad que el perfil: solo lo visible para quien mira).
- Render con SVG/Canvas ligero (sin WebGL nuevo: el heavy 3D no hace falta para puntos y líneas).
- La imagen compartida se genera en el cliente (canvas → PNG) sin almacenar nada nuevo.

### Por qué no es copia
Ninguna red trata tu historial como espacio navegable; todas lo tratan como lista infinita para scrollear. Kronos es "Time × Space" — esta idea ES la identidad convertida en producto.

### Esfuerzo y riesgo
**~2.5 sesiones** (endpoint + visualización + pestaña de perfil + compartir). Riesgo bajo: solo lectura sobre datos existentes. Riesgo real único: rendimiento con miles de posts → se resuelve agregando en el servidor (máx ~300 estrellas visibles por escala).

---

## IDEA 2 — «Pulso a dúo»: la sesión finita compartida

### Qué es
Hoy Pulso es un ritual individual: 8 publicaciones, sin repeticiones, fin explícito. La versión a dúo lo convierte en un **ritual de dos**: tú y otra persona (pareja, mejor amigo, colega) reciben la misma sesión de 8 — construida sobre la intersección de sus señales — y cada quien la consume por su lado, a su hora. Al terminar, ambos ven el **eco**: qué les coincidió.

### Tal cual la verá el usuario

```
  Pulso a dúo con @ana           sesión 3 de 8

  ✦ La nebulosa que ana también vio        ← (esto lo sabrás al final)
  [ Visto · siguiente ]

  …al terminar los dos…

  ┌────────────────────────────────────────┐
  │  Eco de la sesión                      │
  │  ★ 5 de 8 publicaciones las vieron los │
  │    dos                                 │
  │  ★ Ambos pidieron "más de esto":       │
  │    #astrofotografía, #gdl              │
  │  ★ Solo tú pediste "más de": #cocina   │
  │    (ana no lo sabe: tus señales        │
  │    siguen siendo tuyas)                │
  │  [ Otra sesión a dúo ]                 │
  └────────────────────────────────────────┘
```

- La invitación llega como mensaje: "¿Pulso a dúo esta semana?" — caduca si no se acepta (nada de压力 social permanente).
- El eco muestra coincidencias agregadas, nunca las señales privadas del otro: "ambos pidieron más de #X" sí; "ana pidió menos de #Y" jamás.
- Sin chat dentro de la sesión: la conversación sigue en mensajes, donde corresponde.

### Cómo funciona por dentro (todo existe ya)
- `FeedSignal` (intersección de "more" de ambos + exclusión de "less" de ambos), `SeenPost` (para saber qué vieron los dos), la sesión actual de `/api/pulse` como base.
- Nuevo: `PulseSession` compartida (id, par de usuarios, semilla, estado) y un endpoint de eco que solo se abre cuando ambos terminaron.
- Privacidad por diseño: el eco calcula intersecciones, no expone señales individuales.

### Por qué no es copia
Ninguna red tiene consumo sincronizado-asíncrono de a dos. Lo más cercano es "ver juntos" en streaming (otro producto, otra cosa). Nace del diferenciador propio: si el feed es finito, compartirlo también puede serlo.

### Esfuerzo y riesgo
**~2 sesiones** (modelo compartido + eco + UI de invitación). Riesgo medio-bajo: requiere cuidar privacidad del eco (ya diseñado así) y caducidad de invitaciones.

---

## IDEA 3 — «Linaje vivo»: el árbol orbital de los remixes

### Qué es
El remix ya existe con atribución verificada (F7). Linaje vivo lo hace visible como **genealogía navegable**: cada obra con derivaciones muestra su árbol — la original al centro, los remixes orbitando en anillos por generación, líneas que muestran de dónde viene cada uno. No es un contador "12 remixes": es ver CÓMO mutó tu idea a través de la comunidad.

### Tal cual la verá el usuario

```
        ● remix de remix (gen 2)
       ╱
  ○ —— ● mi publicación original          ○ remix (gen 1)
       ╲                                   ↓ tocar: ver la pieza
        ● remix (gen 1)                     y su autor

  "Tu idea viajó: 3 generaciones · 7 obras
   · la más lejana ya no se parece… [ver]"
        [ Compartir mi linaje ]
```

- En el detalle de cualquier publicación con linaje: sección "Linaje" con el árbol completo (generaciones hacia afuera).
- El autor original ve un badge en su perfil: "Semilla de 12 derivaciones".
- "Compartir mi linaje" publica el árbol como imagen — la prueba pública de que tu obra se multiplicó con atribución.

### Cómo funciona por dentro (todo existe ya)
- `lineage.derivedFrom` ya guarda la cadena completa: la consulta es un recorrido recursivo (con profundidad máxima razonable, ~5 generaciones) agregado en el servidor.
- Misma regla de privacidad que todo: solo se dibujan nodos visibles para quien mira.
- Render SVG ligero: nodos + aristas, sin 3D.

### Por qué no es copia
Duet/Stitch muestran un número; las citas de X muestran un nivel. Nadie muestra la genealogía completa como producto navegable — porque nadie tiene procedencia verificada en el servidor. Kronos sí (F7).

### Esfuerzo y riesgo
**~2.5 sesiones** (endpoint de árbol + visualización + sección en detalle + compartir). Riesgo bajo. Riesgo único: cadenas muy largas → límite de generaciones y colapso visual ("+4 más").

---

## Mi recomendación: CONSTELACIÓN (Idea 1)

Por cuatro razones concretas:

1. **Es la identidad hecha producto.** Kronos se define "Time × Space" y hoy el espacio solo existe como metáfora visual (negro, órbitas). La Constelación convierte el espacio en función: tu tiempo vuelve lugar. Ninguna red puede copiar esto sin copiar la tesis entera.
2. **Cero fricción para el usuario:** no pide aprender nada nuevo ni cambiar hábitos; es una vista nueva sobre lo que ya hizo. Las ideas 2 y 3 necesitan un acto social (invitar a alguien, que alguien remezeeque) para brillar; la 1 brilla sola desde la primera publicación.
3. **Costo mínimo, dato máximo:** usa únicamente datos existentes (posts, cápsulas, linaje, órbitas) en solo lectura. ~2.5 sesiones por la pieza de mayor impacto emocional de las tres.
4. **Sinergia con todo:** las líneas de la Constelación SON linaje (Idea 3 integrada gratis como detalle), y las cápsulas selladas como estrellas con anillo son el gancho de retorno más elegante del producto ("¿qué habré escrito hace un año?" → la estrella se enciende el día que toca).

**Secuencia sugerida si se aceptan varias:** Constelación (1) → Linaje vivo (3, que además enriquece la Constelación) → Pulso a dúo (2). Total: ~7 sesiones para las tres.

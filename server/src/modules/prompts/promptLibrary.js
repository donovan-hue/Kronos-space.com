/**
 * Biblioteca de prompts de Kairos — catálogo de instrumentos.
 *
 * 54 categorías en 6 grupos (core, creatividad, imagen, video, audio y motor).
 * Cada una es un instrumento: una plantilla con huecos que el autor rellena, y
 * la app arma el prompt final. No son textos decorativos ni ejemplos: se usan
 * de verdad al crear un preset o al generar.
 *
 * Reglas de esta capa:
 * - El catálogo es **cerrado**. Un `template` solo puede llevar los campos de
 *   su categoría; nada de texto libre que se cuele en el prompt final.
 * - Los campos se declaran con `campo` y se validan al rellenarlos: un preset
 *   con un campo que su instrumento no declara se rechaza en vez de guardarse
 *   a medias.
 * - El límite de longitud es el del generador (4000 caracteres de prompt), así
 *   que `renderPrompt` recorta por palabras, nunca por bytes.
 *
 * El código de cada instrumento es estable (`img_lighting`): es lo que guardan
 * los presets, y renombrarlo dejaría presets huérfanos.
 */

const GRUPOS = [
  { id: "core", nombre: "Núcleo", descripcion: "Cómo piensa y responde Kairos: instrucciones, roles y control de calidad." },
  { id: "creatividad", nombre: "Creatividad", descripcion: "Ideas, historias, personajes y mundos." },
  { id: "imagen", nombre: "Imagen", descripcion: "Fotografía, estilos, luz, encuadre y render." },
  { id: "video", nombre: "Video", descripcion: "Cine, cámara, animación y continuidad." },
  { id: "audio", nombre: "Audio", descripcion: "Voz, música y sonido." },
  { id: "motor", nombre: "Motor", descripcion: "Optimización, extracción y consistencia entre generaciones." }
];

/**
 * Campos reutilizables. Cada uno declara su etiqueta y un ejemplo: el ejemplo
 * es lo que aparece como `placeholder`, no se envía si el usuario no escribe.
 */
const CAMPOS = {
  tema: { etiqueta: "Tema", ejemplo: "una noche de lluvia en la ciudad" },
  tono: { etiqueta: "Tono", ejemplo: "íntimo y sobrio" },
  publico: { etiqueta: "Público", ejemplo: "adultos jóvenes" },
  genero: { etiqueta: "Género", ejemplo: "ciencia ficción" },
  personaje: { etiqueta: "Personaje", ejemplo: "una relojera de 60 años" },
  lugar: { etiqueta: "Lugar", ejemplo: "un taller de relojes" },
  conflicto: { etiqueta: "Conflicto", ejemplo: "el reloj que no debe detenerse" },
  estilo: { etiqueta: "Estilo", ejemplo: "cromo y negro profundo" },
  luz: { etiqueta: "Luz", ejemplo: "luz de ventana lateral, suave" },
  encuadre: { etiqueta: "Encuadre", ejemplo: "primer plano" },
  camara: { etiqueta: "Cámara", ejemplo: "35 mm, f/2" },
  movimiento: { etiqueta: "Movimiento", ejemplo: "travelling lento hacia la derecha" },
  material: { etiqueta: "Material", ejemplo: "metal pulido" },
  paleta: { etiqueta: "Paleta", ejemplo: "negro, plata y blanco hueso" },
  voz: { etiqueta: "Voz", ejemplo: "voz femenina grave" },
  emocion: { etiqueta: "Emoción", ejemplo: "nostalgia contenida" },
  ritmo: { etiqueta: "Ritmo", ejemplo: "lento, 70 ppm" },
  instrumentos: { etiqueta: "Instrumentos", ejemplo: "piano, cuerdas, sintetizador analógico" },
  ambiente: { etiqueta: "Ambiente", ejemplo: "lluvia sobre cristal" },
  evita: { etiqueta: "Evitar", ejemplo: "texto ilegible, manos deformes" },
  objetivo: { etiqueta: "Objetivo", ejemplo: "un anuncio de 15 segundos" },
  formato: { etiqueta: "Formato", ejemplo: "JSON con claves cortas" },
  materia: { etiqueta: "Materia prima", ejemplo: "el texto del guion" }
};

/**
 * Catálogo. `campos` son las claves de `CAMPOS`; `template` usa `{{campo}}`.
 * El orden coincide con la lista entregada (01…54) para que se pueda comparar
 * de un vistazo.
 */
const INSTRUMENTOS = [
  /* ---------- 01 CORE ---------- */
  { codigo: "core_system", grupo: "core", numero: 1, nombre: "System", campos: ["objetivo", "tono"], template: "Actúa como Kairos, el asistente de Kronos Space. Objetivo: {{objetivo}}. Responde en español, con el tono {{tono}}. Si algo no lo sabes, dilo; no lo inventes." },
  { codigo: "core_roles", grupo: "core", numero: 2, nombre: "Roles y personalidades", campos: ["personaje", "publico"], template: "Adopta el papel de {{personaje}} y responde como esa persona hablaría a {{publico}}, sin salir del papel ni describirlo." },
  { codigo: "core_context", grupo: "core", numero: 3, nombre: "Contexto", campos: ["tema", "publico"], template: "Contexto: {{tema}}. Quien lee es {{publico}}. Da por sabido solo lo que ese público sabría y explica lo demás en una frase." },
  { codigo: "core_instructions", grupo: "core", numero: 4, nombre: "Instrucciones", campos: ["objetivo"], template: "Instrucciones: cumple este objetivo paso a paso — {{objetivo}} — y termina con una lista de lo que hiciste, en una línea por paso." },
  { codigo: "core_reasoning", grupo: "core", numero: 5, nombre: "Razonamiento y planificación", campos: ["objetivo"], template: "Antes de responder a «{{objetivo}}», planifica en voz alta: qué necesitas saber, qué asumirás y en qué orden lo resolverás. Después entrega el resultado." },
  { codigo: "core_analysis", grupo: "core", numero: 6, nombre: "Análisis", campos: ["materia"], template: "Analiza {{materia}}: separa hechos de opiniones, señala lo que falta para juzgarlo y no concluyas más de lo que el material sostiene." },
  { codigo: "core_memory", grupo: "core", numero: 7, nombre: "Memoria y recuperación", campos: ["tema"], template: "Recupera lo que ya se dijo sobre {{tema}} en esta conversación; si no hay nada, dilo y pide el dato que falte en lugar de suponerlo." },
  { codigo: "core_evaluation", grupo: "core", numero: 8, nombre: "Evaluación y validación", campos: ["objetivo", "evita"], template: "Evalúa este resultado contra el objetivo «{{objetivo}}»: qué cumple, qué no y qué riesgo tiene. Evita {{evita}}." },

  /* ---------- 02 CREATIVIDAD ---------- */
  { codigo: "cre_ideas", grupo: "creatividad", numero: 9, nombre: "Generación de ideas", campos: ["tema", "publico"], template: "Dame diez ideas sobre {{tema}} para {{publico}}. Cada una en una línea, con una razón de por qué puede funcionar. Nada de variaciones de la misma idea." },
  { codigo: "cre_storytelling", grupo: "creatividad", numero: 10, nombre: "Narración", campos: ["tema", "tono", "conflicto"], template: "Cuenta una historia sobre {{tema}} con tono {{tono}}. El conflicto es {{conflicto}}. Empieza en medio de la acción, no por el principio." },
  { codigo: "cre_narrative", grupo: "creatividad", numero: 11, nombre: "Narrativas", campos: ["genero", "tema"], template: "Estructura una narrativa de {{genero}} sobre {{tema}} en tres actos, con el giro del segundo acto escrito en una frase." },
  { codigo: "cre_dialogues", grupo: "creatividad", numero: 12, nombre: "Diálogos", campos: ["personaje", "conflicto"], template: "Escribe un diálogo entre {{personaje}} y alguien que se le opone por {{conflicto}}. Sin acotaciones: que se entienda quién habla por cómo habla." },
  { codigo: "cre_characters", grupo: "creatividad", numero: 13, nombre: "Personajes", campos: ["personaje", "conflicto"], template: "Define a {{personaje}}: qué quiere, qué teme, qué miente sobre sí y cómo se nota en una escena con {{conflicto}}." },
  { codigo: "cre_worlds", grupo: "creatividad", numero: 14, nombre: "Mundos y entornos", campos: ["lugar", "genero"], template: "Describe {{lugar}} como escenario de {{genero}}: qué se ve, qué se oye y qué regla de ese mundo se rompe si alguien hace lo obvio." },
  { codigo: "cre_adaptation", grupo: "creatividad", numero: 15, nombre: "Adaptación creativa", campos: ["materia", "objetivo"], template: "Adapta {{materia}} a {{objetivo}} sin traicionar lo que dice: cambia la forma, no el sentido, y señala qué tuviste que dejar fuera." },

  /* ---------- 03 IMAGEN ---------- */
  { codigo: "img_photography", grupo: "imagen", numero: 16, nombre: "Fotografía", campos: ["tema", "camara", "luz"], template: "Fotografía de {{tema}}, tomada con {{camara}}, {{luz}}. Detalle real, sin plástico." },
  { codigo: "img_portrait", grupo: "imagen", numero: 17, nombre: "Personajes y retratos", campos: ["personaje", "luz", "emocion"], template: "Retrato de {{personaje}} con expresión de {{emocion}}, {{luz}}. Piel con textura, mirada a cámara." },
  { codigo: "img_styles", grupo: "imagen", numero: 18, nombre: "Estilos artísticos", campos: ["estilo", "tema"], template: "{{tema}} en estilo {{estilo}}. Coherente de borde a borde, sin mezclar dos estilos." },
  { codigo: "img_lighting", grupo: "imagen", numero: 19, nombre: "Iluminación", campos: ["luz", "material"], template: "Iluminación: {{luz}}. El material dominante es {{material}}; los reflejos deben explicar de dónde viene la luz." },
  { codigo: "img_composition", grupo: "imagen", numero: 20, nombre: "Composición y encuadre", campos: ["encuadre", "tema"], template: "{{tema}} en {{encuadre}}, con aire a un lado para que la mirada respire. Regla de tercios, horizonte recto." },
  { codigo: "img_scenario", grupo: "imagen", numero: 21, nombre: "Escenarios y entornos", campos: ["lugar", "ambiente"], template: "Escenario: {{lugar}}. Ambiente: {{ambiente}}. Muestra lo que está fuera del cuadro a través de lo que se refleja dentro." },
  { codigo: "img_3d", grupo: "imagen", numero: 22, nombre: "Render 3D", campos: ["material", "estilo", "luz"], template: "Render 3D de {{material}} con acabado {{estilo}}, {{luz}}. Reflejos físicamente correctos, sin ruido de denoise." },
  { codigo: "img_negative", grupo: "imagen", numero: 23, nombre: "Prompts negativos visuales", campos: ["evita"], template: "Evita en la imagen: {{evita}}. Si algo de eso aparece, la imagen no sirve." },
  { codigo: "img_editing", grupo: "imagen", numero: 24, nombre: "Edición y transformación", campos: ["materia", "objetivo"], template: "Partiendo de {{materia}}, transforma solo lo necesario para {{objetivo}} y conserva el resto idéntico: encuadre, luz y color originales." },

  /* ---------- 04 VIDEO ---------- */
  { codigo: "vid_cinematic", grupo: "video", numero: 25, nombre: "Cinemático", campos: ["tema", "tono", "encuadre"], template: "Plano cinematográfico de {{tema}}, tono {{tono}}, {{encuadre}}. Movimiento de cámara motivado; nada de zooms gratuitos." },
  { codigo: "vid_camera", grupo: "video", numero: 26, nombre: "Movimientos de cámara", campos: ["movimiento", "tema"], template: "Cámara: {{movimiento}} sobre {{tema}}. Un solo movimiento por plano, con inicio y final claros." },
  { codigo: "vid_animation", grupo: "video", numero: 27, nombre: "Animación", campos: ["estilo", "tema"], template: "Animación {{estilo}} de {{tema}}: doce principios respetados, peso creíble en los objetos y anticipación antes de cada acción." },
  { codigo: "vid_body", grupo: "video", numero: 28, nombre: "Movimiento corporal", campos: ["personaje", "emocion"], template: "{{personaje}} se mueve con {{emocion}} en el cuerpo: hombros, manos y peso del paso lo dicen antes que la cara." },
  { codigo: "vid_continuity", grupo: "video", numero: 29, nombre: "Continuidad de escena", campos: ["lugar", "tema"], template: "Mantén continuidad en {{lugar}} durante toda la escena de {{tema}}: misma luz, mismos objetos en su sitio, misma ropa." },
  { codigo: "vid_transitions", grupo: "video", numero: 30, nombre: "Transiciones y efectos", campos: ["movimiento", "tono"], template: "Transición por {{movimiento}} con tono {{tono}}. El efecto sirve al corte; si se nota el efecto, sobra." },
  { codigo: "vid_sync", grupo: "video", numero: 31, nombre: "Sincronía audiovisual", campos: ["ritmo", "tema"], template: "Sincroniza {{tema}} con un ritmo {{ritmo}}: los cortes caen en el golpe, no entre golpes." },
  { codigo: "vid_negative", grupo: "video", numero: 32, nombre: "Prompts negativos de video", campos: ["evita"], template: "Evita en el video: {{evita}}. Un solo defecto de esos arruina el plano." },

  /* ---------- 05 AUDIO ---------- */
  { codigo: "aud_voice", grupo: "audio", numero: 33, nombre: "Generación de voz", campos: ["voz", "tono"], template: "Voz: {{voz}}, con tono {{tono}}. Natural, sin locución de anuncio." },
  { codigo: "aud_performance", grupo: "audio", numero: 34, nombre: "Interpretación vocal", campos: ["emocion", "ritmo"], template: "Interpreta con {{emocion}} a ritmo {{ritmo}}. Respira donde respiraría una persona." },
  { codigo: "aud_emotions", grupo: "audio", numero: 35, nombre: "Emociones y entonación", campos: ["emocion", "voz"], template: "{{voz}} con entonación de {{emocion}}: la frase sube o baja donde la emoción lo pide, no al azar." },
  { codigo: "aud_accent", grupo: "audio", numero: 36, nombre: "Acentos y pronunciación", campos: ["voz", "lugar"], template: "{{voz}} con acento de {{lugar}}. Pronuncia claro sin exagerar el acento." },
  { codigo: "aud_characters", grupo: "audio", numero: 37, nombre: "Personajes de voz", campos: ["personaje", "emocion"], template: "Voz para {{personaje}}: timbre, velocidad y muletillas propias, con {{emocion}} de fondo." },
  { codigo: "aud_genres", grupo: "audio", numero: 38, nombre: "Géneros musicales", campos: ["genero", "ritmo"], template: "Música de {{genero}}, {{ritmo}}. Instrumentación coherente con el género, sin más capas de las necesarias." },
  { codigo: "aud_instruments", grupo: "audio", numero: 39, nombre: "Instrumentos", campos: ["instrumentos", "emocion"], template: "Instrumentos: {{instrumentos}}. Cada uno debe oírse con su propio espacio; emoción {{emocion}}." },
  { codigo: "aud_composition", grupo: "audio", numero: 40, nombre: "Composición musical", campos: ["tema", "ritmo", "instrumentos"], template: "Composición sobre {{tema}}, {{ritmo}}, con {{instrumentos}}. Estructura con entrada, desarrollo y salida; sin final cortado." },
  { codigo: "aud_sfx", grupo: "audio", numero: 41, nombre: "Efectos de sonido", campos: ["ambiente", "tema"], template: "Efectos de sonido para {{tema}}: {{ambiente}}. Foley creíble, sin sonidos de librería reconocibles." },
  { codigo: "aud_environments", grupo: "audio", numero: 42, nombre: "Entornos sonoros", campos: ["lugar", "ambiente"], template: "Entorno sonoro de {{lugar}}: {{ambiente}}. Con profundidad —lo cercano y lo lejano se distinguen—." },
  { codigo: "aud_negative", grupo: "audio", numero: 43, nombre: "Prompts negativos de audio", campos: ["evita"], template: "Evita en el audio: {{evita}}. Se nota en la primera escucha." },

  /* ---------- 06 MOTOR ---------- */
  { codigo: "eng_optimization", grupo: "motor", numero: 44, nombre: "Optimización", campos: ["materia", "objetivo"], template: "Optimiza {{materia}} para {{objetivo}}: quita lo que no cambia el resultado y no añadas nada que no estuviera." },
  { codigo: "eng_transformation", grupo: "motor", numero: 45, nombre: "Transformación", campos: ["materia", "formato"], template: "Transforma {{materia}} a {{formato}} conservando cada dato. Si algo no cabe, dilo en vez de recortarlo en silencio." },
  { codigo: "eng_correction", grupo: "motor", numero: 46, nombre: "Corrección", campos: ["materia", "evita"], template: "Corrige {{materia}}: ortografía, concordancia y claridad. Evita {{evita}}. No cambies el sentido." },
  { codigo: "eng_extraction", grupo: "motor", numero: 47, nombre: "Extracción de información", campos: ["materia", "objetivo"], template: "Extrae de {{materia}} solo lo que responde a {{objetivo}}. Lo que no esté escrito no se rellena." },
  { codigo: "eng_json", grupo: "motor", numero: 48, nombre: "Estructuración JSON", campos: ["formato", "materia"], template: "Devuelve {{materia}} como JSON válido con esta forma: {{formato}}. Sin texto alrededor, sin comentarios." },
  { codigo: "eng_selection", grupo: "motor", numero: 49, nombre: "Selección de motor", campos: ["objetivo"], template: "Para {{objetivo}}, di qué capacidad conviene (chat, imagen, video, audio) y por qué, en dos líneas como máximo." },
  { codigo: "eng_model", grupo: "motor", numero: 50, nombre: "Adaptación al modelo", campos: ["materia", "formato"], template: "Adapta {{materia}} al formato que espera el modelo: {{formato}}. Si el modelo no admite una parte, sepárala y dilo." },
  { codigo: "eng_quality", grupo: "motor", numero: 51, nombre: "Control de calidad", campos: ["objetivo", "evita"], template: "Revisa el resultado contra «{{objetivo}}» con esta lista: ¿cumple?, ¿sobra algo?, ¿falta algo?, ¿aparece {{evita}}? Responde con las cuatro respuestas." },
  { codigo: "eng_errors", grupo: "motor", numero: 52, nombre: "Detección de errores", campos: ["materia"], template: "Busca errores en {{materia}}: datos contradictorios, afirmaciones sin respaldo y pasos que no se siguen. Cita la parte exacta de cada uno." },
  { codigo: "eng_consistency", grupo: "motor", numero: 53, nombre: "Consistencia de generación", campos: ["personaje", "estilo"], template: "Mantén a {{personaje}} idéntico entre generaciones: mismos rasgos, misma ropa, mismo estilo {{estilo}}. Si algo cambia, debe ser a propósito." },
  { codigo: "eng_reconstruction", grupo: "motor", numero: 54, nombre: "Reconstrucción de instrucciones", campos: ["materia", "objetivo"], template: "Reconstruye la instrucción que produjo {{materia}}, con el objetivo {{objetivo}}: escríbela como se le daría a un modelo, en una sola frase." }
];

const MAX_PROMPT_LENGTH = 4000;
/* Tope por campo. Alto a propósito: una descripción de escena puede ser larga,
   y el límite de verdad es el del prompt completo. Si se recorta aquí, el
   autor pierde lo que escribió sin saberlo. */
const MAX_CAMPO_LENGTH = 3000;

function porCodigo(codigo) {
  return INSTRUMENTOS.find((instrumento) => instrumento.codigo === codigo) || null;
}

/** Sin acentos ni mayúsculas: quien busca «iluminacion» encuentra «Iluminación». */
function normalizar(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function listarInstrumentos({ grupo = "", q = "" } = {}) {
  const texto = normalizar(q);
  return INSTRUMENTOS.filter((instrumento) => {
    if (grupo && instrumento.grupo !== grupo) return false;
    if (!texto) return true;
    // También se busca por los campos («luz» encuentra Iluminación), que es
    // como piensa quien la usa: por lo que quiere rellenar.
    const campos = instrumento.campos.map((campo) => CAMPOS[campo]?.etiqueta || "").join(" ");
    return normalizar(`${instrumento.nombre} ${instrumento.codigo} ${campos}`).includes(texto);
  });
}

/**
 * Rellena la plantilla. Los campos vacíos se quitan enteros —no se dejan
 * huecos con llaves ni frases a medias—, y si no queda ningún campo se
 * devuelve un error en vez de un prompt que no dice nada.
 */
function renderPrompt(codigo, valores = {}) {
  const instrumento = porCodigo(codigo);
  if (!instrumento) return { error: "Ese instrumento no existe.", code: "INSTRUMENT_NOT_FOUND" };

  const limpios = {};
  for (const campo of instrumento.campos) {
    const valor = valores?.[campo];
    const texto = typeof valor === "string" ? valor.trim().slice(0, MAX_CAMPO_LENGTH) : "";
    if (texto) limpios[campo] = texto;
  }

  if (Object.keys(limpios).length === 0) {
    return { error: "Rellena al menos un campo del instrumento.", code: "PROMPT_EMPTY" };
  }

  // Se arma por cláusulas (separadas por . ; ,: los dos puntos se quedan
  // dentro para no separar una etiqueta de su valor). Una cláusula que solo tenía
  // campos vacíos se cae entera: así no quedan frases como «Iluminación: .» ni
  // «El material dominante es ;» que el modelo leería como instrucción.
  const partes = [];
  let seCayoUna = false;
  for (const coincidencia of instrumento.template.matchAll(/([^.;,]+)([.;,]?)/g)) {
    const clausula = coincidencia[1];
    const separador = coincidencia[2] || "";
    const huecos = [...clausula.matchAll(/\{\{(\w+)\}\}/g)].map((hueco) => hueco[1]);

    if (huecos.length === 0) {
      if (clausula.trim()) partes.push(`${clausula.trim()}${separador}`);
      continue;
    }

    if (huecos.every((hueco) => !limpios[hueco])) {
      seCayoUna = true;
      continue;
    }

    if (seCayoUna) {
      // Se cayó la cláusula anterior: si lo último guardado era su etiqueta
      // («Iluminación:»), sobra sin su contenido.
      const ultima = partes[partes.length - 1];
      if (ultima && ultima.endsWith(":") && ultima.length <= 40) partes.pop();
      seCayoUna = false;
    }

    const rellena = clausula
      .replace(/\{\{(\w+)\}\}/g, (_, hueco) => limpios[hueco] || "")
      .replace(/\s{2,}/g, " ")
      .trim()
      .replace(/\s+([.;:,])$/, "$1");
    if (rellena && rellena !== separador) partes.push(`${rellena}${separador}`);
  }

  let texto = partes.join(" ")
    // Una coma antes de mayúscula es una frase que perdió su mitad: se cierra
    // con punto en vez de dejar «… en español, Si algo no lo sabes».
    .replace(/,\s+(?=[A-ZÁÉÍÓÚÜÑ])/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:]+/, "")
    .replace(/\s+([.;:,])/g, "$1")
    // Un final en coma o dos puntos es una frase que perdió su mitad por un
    // campo vacío: se cierra con punto.
    .replace(/[,;:]+$/, ".")
    .trim();

  if (!texto) return { error: "Rellena al menos un campo del instrumento.", code: "PROMPT_EMPTY" };

  if (texto.length > MAX_PROMPT_LENGTH) {
    // Se recorta por palabras: cortar a mitad de palabra deja un prompt que el
    // modelo lee mal y el autor no reconoce.
    const recortado = texto.slice(0, MAX_PROMPT_LENGTH);
    const corte = recortado.lastIndexOf(" ");
    return {
      texto: `${(corte > 0 ? recortado.slice(0, corte) : recortado).trim()}…`,
      recortado: true,
      instrumento
    };
  }

  return { texto, recortado: false, instrumento };
}

/* ============================================================
   ESTILOS PROPIOS

   El generador de imagen solo entendía cuatro estilos fijos. Aquí hay un
   catálogo más amplio, con el texto que cada estilo inyecta en el prompt, y
   `estiloDesdePreset` convierte un estilo guardado por el usuario en el mismo
   formato: así el generador trata igual lo de fábrica y lo suyo, sin ramas.

   El `codigo` es lo que se guarda en la generación y en el preset, igual que
   en los instrumentos: renombrar la etiqueta no rompe nada.
   ============================================================ */
const ESTILOS = [
  { codigo: "cinematic", nombre: "Cinemático", texto: "luz de cine, contraste alto, color graduado, grano fino" },
  { codigo: "editorial", nombre: "Editorial", texto: "fotografía de revista, luz limpia, composición deliberada" },
  { codigo: "concept-art", nombre: "Concept art", texto: "pintura digital de producción, formas legibles, valores claros" },
  { codigo: "photorealistic", nombre: "Fotorrealista", texto: "fotografía real, óptica creíble, piel y materiales con textura" },
  { codigo: "chrome-liquid", nombre: "Cromo líquido", texto: "metal líquido espejo, reflejos nítidos, fondo negro profundo" },
  { codigo: "noir", nombre: "Noir", texto: "blanco y negro de alto contraste, sombras duras, humo tenue" },
  { codigo: "analog", nombre: "Analógico", texto: "película de 35 mm, halación suave, color desviado" },
  { codigo: "brutalist", nombre: "Brutalista", texto: "hormigón y acero, geometría pesada, luz plana y fría" },
  { codigo: "neon", nombre: "Neón", texto: "luz de neón saturada, noche urbana, reflejos en mojado" },
  { codigo: "minimal", nombre: "Minimal", texto: "mucho aire, un solo sujeto, paleta de dos colores" },
  { codigo: "watercolor", nombre: "Acuarela", texto: "acuarela sobre papel, bordes que sangran, pigmento visible" },
  { codigo: "isometric", nombre: "Isométrico", texto: "vista isométrica, volumen limpio, sombras planas" }
];

const MAX_ESTILO_LENGTH = 1000;

function porCodigoEstilo(codigo) {
  return ESTILOS.find((estilo) => estilo.codigo === codigo) || null;
}

/** Texto que se antepone al prompt. `null` si el estilo no existe. */
function textoDeEstilo(codigo) {
  const estilo = porCodigoEstilo(codigo);
  return estilo ? estilo.texto : null;
}

/**
 * Estilo propio guardado por el usuario → mismo formato que el catálogo.
 *
 * Se valida aquí y no en la ruta porque lo usan dos sitios (la ruta de presets
 * al guardar y el generador al aplicar): una sola regla, un solo sitio donde
 * puede fallar.
 */
function estiloDesdePreset(preset) {
  const nombre = typeof preset?.nombre === "string" ? preset.nombre.trim() : "";
  const texto = typeof preset?.estiloVisual === "string" ? preset.estiloVisual.trim() : "";

  if (!nombre) return { error: "El estilo necesita un nombre.", code: "STYLE_NAME_REQUIRED" };
  if (!texto) return { error: "El estilo necesita su descripción visual.", code: "STYLE_TEXT_REQUIRED" };
  if (texto.length > MAX_ESTILO_LENGTH) {
    return { error: `La descripción del estilo no puede superar ${MAX_ESTILO_LENGTH} caracteres.`, code: "STYLE_TEXT_TOO_LONG" };
  }

  // El texto entra en el prompt final: los saltos de línea romperían la línea
  // «Estilo visual: …» y permitirían colar instrucciones sueltas.
  return { estilo: { codigo: `user:${preset._id || nombre}`, nombre, texto: texto.replace(/\s+/g, " ") } };
}


module.exports = {
  GRUPOS,
  CAMPOS,
  INSTRUMENTOS,
  MAX_PROMPT_LENGTH,
  MAX_CAMPO_LENGTH,
  ESTILOS,
  MAX_ESTILO_LENGTH,
  porCodigo,
  porCodigoEstilo,
  textoDeEstilo,
  estiloDesdePreset,
  listarInstrumentos,
  renderPrompt
};
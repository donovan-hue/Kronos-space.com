/**
 * PLANTILLAS DE FORMATO — «Reels, cuadrado y portada con textos ya armados».
 *
 * Cada plantilla trae la estructura de escenas con los rótulos escritos.
 * Al crear un proyecto desde una plantilla, esas escenas quedan editables:
 * la plantilla ahorra el arranque, no encierra el resultado.
 */

export const PLANTILLAS = [
  {
    id: "reel",
    format: "reel",
    nombre: "Reel vertical",
    ratio: "9:16",
    duracion: "20–30 s",
    detalle: "Gancho, desarrollo y cierre con llamado a la acción.",
    escenas: [
      { title: "Gancho", order: 0, script: "Primera línea que detiene el scroll. Una sola idea, sin contexto previo." },
      { title: "Contexto", order: 1, script: "Por qué importa: el problema concreto en una frase." },
      { title: "Desarrollo", order: 2, script: "El paso a paso. Tres puntos como máximo." },
      { title: "Prueba", order: 3, script: "Dato, ejemplo o resultado visible." },
      { title: "Cierre", order: 4, script: "Llamado a la acción único y claro." }
    ]
  },
  {
    id: "cuadrado",
    format: "cuadrado",
    nombre: "Cuadrado de feed",
    ratio: "1:1",
    duracion: "8–12 s",
    detalle: "Una idea por tarjeta, pensada para leerse sin audio.",
    escenas: [
      { title: "Titular", order: 0, script: "La afirmación, en menos de 12 palabras." },
      { title: "Apoyo", order: 1, script: "Una razón o cifra que sostiene el titular." },
      { title: "Cierre", order: 2, script: "Firma o llamado a la acción." }
    ]
  },
  {
    id: "portada",
    format: "portada",
    nombre: "Portada horizontal",
    ratio: "16:9",
    duracion: "Estática",
    detalle: "Título, subtítulo y pie para miniatura de video o cabecera.",
    escenas: [
      { title: "Título", order: 0, script: "Máximo 6 palabras. Es lo único que se lee en miniatura." },
      { title: "Subtítulo", order: 1, script: "Una línea que amplía el título sin repetirlo." },
      { title: "Pie", order: 2, script: "Autor o serie, en texto pequeño." }
    ]
  }
];

export function plantillaPorId(id) {
  return PLANTILLAS.find((plantilla) => plantilla.id === id) || null;
}

export const NOMBRE_FORMATO = {
  reel: "Reel 9:16",
  cuadrado: "Cuadrado 1:1",
  portada: "Portada 16:9",
  libre: "Libre"
};

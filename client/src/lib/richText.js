/**
 * TEXTO DE PUBLICACIÓN CON ENLACES — un solo intérprete para toda la app.
 *
 * El contenido se guarda tal cual lo escribió la persona (`post.content`) y
 * hasta ahora se pintaba literal: un enlace no se podía pulsar y una mención
 * no llevaba a nadie. Convertirlo a HTML en el servidor habría metido un
 * sanitizador y una superficie de XSS en la API; aquí se devuelve una LISTA de
 * trozos tipados y React los pinta como texto dentro de `<Link>`/`<a>`, así
 * que no hay `dangerouslySetInnerHTML` en ningún punto.
 *
 * Reglas (deliberadamente conservadoras):
 *   - `#etiqueta` → /hashtag/:tag (misma normalización que el servidor:
 *     letras, números y `_`, hasta 50 caracteres, sin distinguir mayúsculas).
 *   - `@usuario` → /profile/:username (el patrón de usuario del proyecto:
 *     3-30 de [a-z0-9_]).
 *   - `https://…` o `http://…` → enlace externo con `rel="nofollow ugc
 *     noopener noreferrer"` y `target="_blank"`. No se inventan enlaces a
 *     partir de texto suelto tipo `www.` ni de correos.
 *   - Todo lo demás es texto.
 *
 * Si el patrón no está al principio de una palabra (`a#b`, `correo@dominio`)
 * no se considera etiqueta ni mención: se queda como texto.
 */

const HASHTAG = /#([\p{L}\p{N}_]{1,50})/gu;
const MENTION = /@([a-z0-9_]{3,30})/gi;
const URL = /https?:\/\/[^\s<>"']+/gi;

const MAX_TEXT = 5000;

/**
 * Trozos de un texto: `{ type: "text" | "hashtag" | "mention" | "link", ... }`.
 *
 * @param {string} content
 * @returns {Array<{type: string, value: string, href?: string, tag?: string, username?: string}>}
 */
export function parseRichText(content) {
  if (typeof content !== "string" || !content) return [];

  const source = content.slice(0, MAX_TEXT);
  const matches = [];

  collect(source, URL, matches, (raw) => {
    // El punto o la coma final de una frase no son parte del enlace.
    const trimmed = raw.replace(/[.,;:!?)\]]+$/, "");
    return trimmed
      ? { type: "link", value: trimmed, href: trimmed }
      : null;
  });

  collect(source, HASHTAG, matches, (raw, match) => ({
    type: "hashtag",
    value: raw,
    tag: match[1].toLocaleLowerCase("und"),
    href: `/hashtag/${encodeURIComponent(match[1].toLocaleLowerCase("und"))}`
  }));

  collect(source, MENTION, matches, (raw, match) => ({
    type: "mention",
    value: raw,
    username: match[1],
    href: `/profile/${encodeURIComponent(match[1])}`
  }));

  if (matches.length === 0) {
    return [{ type: "text", value: source }];
  }

  matches.sort((a, b) => a.start - b.start);

  const parts = [];
  let cursor = 0;

  for (const match of matches) {
    // Solapamientos: gana el primero que empieza antes (un enlace que contiene
    // un `#` no se parte en dos).
    if (match.start < cursor) continue;

    if (match.start > cursor) {
      parts.push({ type: "text", value: source.slice(cursor, match.start) });
    }

    parts.push(match.part);
    cursor = match.end;
  }

  if (cursor < source.length) {
    parts.push({ type: "text", value: source.slice(cursor) });
  }

  return parts;
}

/**
 * Añade a `matches` lo que encuentre de `pattern`, descartando lo que no está
 * al principio de palabra. `build` devuelve el trozo o `null` para ignorarlo.
 */
function collect(source, pattern, matches, build) {
  pattern.lastIndex = 0;

  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    const before = start > 0 ? source[start - 1] : "";
    // `a#b` o `correo@dominio`: no son etiqueta ni mención.
    if (before && !/[\s([{"'¿¡«>]/.test(before)) continue;

    const raw = match[0];
    const part = build(raw, match);
    if (!part) continue;

    // `value` puede haberse recortado (enlaces con puntuación final): el final
    // real es el del valor aceptado, no el de la coincidencia.
    matches.push({ start, end: start + part.value.length, part });
  }
}

/**
 * Solo las etiquetas y menciones únicas de un texto: lo usan los avisos y las
 * pruebas para no repetir trabajo al buscar destinatarios.
 */
export function mentionsOf(content) {
  return parseRichText(content)
    .filter((part) => part.type === "mention")
    .map((part) => part.username);
}

import { Fragment } from "react";
import { Link } from "react-router-dom";
import { parseRichText } from "../../lib/richText";

/**
 * RichText — pinta el texto de una publicación con sus enlaces vivos.
 *
 * React escapa cada trozo como texto: no hay `dangerouslySetInnerHTML` y un
 * `<script>` escrito en el contenido se ve tal cual, no se ejecuta. Los
 * enlaces a hashtag y a perfil son `Link` (navegación interna sin recargar);
 * los externos abren en pestaña nueva con `nofollow ugc`.
 *
 * `as` permite usar un `<p>` (feed) o un `<span>` (líneas de una tarjeta) sin
 * duplicar el intérprete.
 */
export default function RichText({ text, as: Tag = "p", className = "", linkClassName = "" }) {
  const parts = parseRichText(text);

  if (parts.length === 0) return null;

  return (
    <Tag className={className}>
      {parts.map((part, index) => {
        if (part.type === "hashtag" || part.type === "mention") {
          return (
            <Link
              key={`${part.type}-${index}`}
              to={part.href}
              className={linkClassName || undefined}
            >
              {part.value}
            </Link>
          );
        }

        if (part.type === "link") {
          return (
            <a
              key={`link-${index}`}
              href={part.href}
              target="_blank"
              rel="nofollow ugc noopener noreferrer"
              className={linkClassName || undefined}
            >
              {part.value}
            </a>
          );
        }

        return <Fragment key={`text-${index}`}>{part.value}</Fragment>;
      })}
    </Tag>
  );
}

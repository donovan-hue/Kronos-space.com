import { mediaUrl } from "../../services/mediaUrl";
import PropTypes from "prop-types";

export default function Avatar({ src, alt = "", name = "K", size = "md", className = "" }) {
  return <span className={`k-avatar k-avatar-${size} ${className}`} aria-label={alt || name}>{src ? <img src={mediaUrl(src)} alt={alt} /> : name.slice(0, 1).toUpperCase()}</span>;
}

Avatar.propTypes = { src: PropTypes.string, alt: PropTypes.string, name: PropTypes.string, size: PropTypes.oneOf(["sm", "md", "lg"]), className: PropTypes.string };

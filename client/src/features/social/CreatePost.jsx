import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_URL } from "../../services/apiClient";
import { getToken } from "../../services/authStorage";
const API = API_URL;
function auth() { const value = getToken(); return value ? { headers: { Authorization: `Bearer ${value}` } } : {}; }
export default function CreatePost({ onCreated }) {
  const [content, setContent] = useState(""); const [creating, setCreating] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  async function createPost(event) { event.preventDefault(); const value = content.trim(); if (!value || creating) return; setCreating(true); setError(""); setSuccess(""); try { const response = await axios.post(`${API}/posts`, { content: value }, auth()); const post = response.data?.post; if (!post) throw new Error("INVALID_POST_RESPONSE"); setContent(""); setSuccess("Publicación creada."); if (typeof onCreated === "function") onCreated(post); } catch (requestError) { setError(requestError.response?.data?.error || "No se pudo crear la publicación."); } finally { setCreating(false); } }
  return <section className="k-composer"><div className="k-composer-heading"><div><p className="k-eyebrow">CREAR</p><h2>¿Qué quieres compartir?</h2></div><Link className="k-button k-button-ghost" to="/create">Editor completo</Link></div>{error && <p className="k-state k-state-error" role="alert">{error}</p>}{success && <p className="k-state k-state-success" role="status">{success}</p>}<form onSubmit={createPost}><textarea value={content} onChange={event => setContent(event.target.value)} maxLength={5000} placeholder="Escribe una idea, una observación o una pregunta..." aria-label="Contenido de la publicación" disabled={creating} /><div className="k-composer-footer"><span>{content.length}/5000</span><button className="k-button k-button-primary" type="submit" disabled={creating || !content.trim()}>{creating ? "Publicando..." : "Publicar"}</button></div></form></section>;
}

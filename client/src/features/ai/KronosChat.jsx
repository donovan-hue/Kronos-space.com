import { useState } from "react";
import axios from "axios";
import { API_URL } from "../../services/apiClient";
import { getToken } from "../../services/authStorage";

export default function KronosChat() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendMessage(event) {
    event.preventDefault();

    const text = message.trim();

    if (!text || loading) return;

    const userMessage = {
      role: "user",
      content: text
    };

    const history = messages.map((item) => ({
      role: item.role,
      content: item.content
    }));

    setMessages((current) => [
      ...current,
      userMessage
    ]);

    setMessage("");
    setError("");
    setLoading(true);

    try {
      const token = getToken();

      const response = await axios.post(
        `${API_URL}/ai/chat`,
        {
          message: text,
          history
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const assistantMessage = {
        role: "assistant",
        content:
          response.data?.text ||
          "Kronos AI no devolvió una respuesta."
      };

      setMessages((current) => [
        ...current,
        assistantMessage
      ]);
    } catch (err) {
      console.error("Kronos AI error:", err);

      setError(
        err.response?.data?.error ||
        "No fue posible conectar con Kronos AI."
      );
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError("");
  }

  return (
    <section className="kronos-chat">
      <header>
        <h2>Kronos AI</h2>
        <p>
          Asistente inteligente de Kronos Social AI.
        </p>
      </header>

      <div className="kronos-chat-messages">
        {messages.length === 0 && (
          <div className="kronos-chat-empty">
            <strong>¿En qué puedo ayudarte?</strong>
            <span>
              Escribe una solicitud para comenzar.
            </span>
          </div>
        )}

        {messages.map((item, index) => (
          <article
            key={`${item.role}-${index}`}
            className={`kronos-message ${item.role}`}
          >
            <strong>
              {item.role === "user"
                ? "Tú"
                : "Kronos AI"}
            </strong>

            <p>{item.content}</p>
          </article>
        ))}

        {loading && (
          <article className="kronos-message assistant">
            <strong>Kronos AI</strong>
            <p>Procesando...</p>
          </article>
        )}
      </div>

      {error && (
        <div className="kronos-chat-error">
          {error}
        </div>
      )}

      <form
        className="kronos-chat-form"
        onSubmit={sendMessage}
      >
        <textarea
          value={message}
          onChange={(event) =>
            setMessage(event.target.value)
          }
          placeholder="Escribe a Kronos AI..."
          rows={3}
          disabled={loading}
        />

        <div className="kronos-chat-actions">
          <button
            type="button"
            onClick={clearChat}
            disabled={loading || messages.length === 0}
          >
            Limpiar
          </button>

          <button
            type="submit"
            disabled={loading || !message.trim()}
          >
            {loading ? "Procesando..." : "Enviar"}
          </button>
        </div>
      </form>
    </section>
  );
}

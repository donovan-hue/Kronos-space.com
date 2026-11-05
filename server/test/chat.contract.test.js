const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateChatPayload
} = require("../src/modules/ai-core/routes/chat.routes");
const {
  normalizeChatHistory,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_HISTORY_ITEMS,
  MAX_HISTORY_ITEM_LENGTH
} = require("../src/modules/ai-core/services/chat.service");

test("chat rechaza mensaje, historial y entradas fuera de límite antes del proveedor", () => {
  assert.equal(validateChatPayload({}).code, "MESSAGE_REQUIRED");
  assert.equal(validateChatPayload({ message: "x".repeat(MAX_CHAT_MESSAGE_LENGTH + 1) }).code, "MESSAGE_TOO_LONG");
  assert.equal(validateChatPayload({ message: "ok", history: {} }).code, "HISTORY_INVALID");
  assert.equal(
    validateChatPayload({ message: "ok", history: Array.from({ length: MAX_HISTORY_ITEMS + 1 }, () => ({ role: "user", content: "x" })) }).code,
    "HISTORY_TOO_LONG"
  );
  assert.equal(
    validateChatPayload({ message: "ok", history: [{ role: "user", content: "x".repeat(MAX_HISTORY_ITEM_LENGTH + 1) }] }).code,
    "HISTORY_ITEM_TOO_LONG"
  );
});

test("chat normaliza únicamente roles permitidos y conserva contenido acotado", () => {
  const parsed = validateChatPayload({
    message: "  hola  ",
    history: [{ role: "user", content: "  anterior  " }, { role: "assistant", content: " respuesta " }]
  });
  assert.deepEqual(parsed.value, {
    message: "hola",
    history: [
      { role: "user", content: "anterior" },
      { role: "assistant", content: "respuesta" }
    ]
  });
  assert.throws(
    () => normalizeChatHistory([{ role: "system", content: "no debe entrar" }]),
    /HISTORY_INVALID/
  );
});

/* ============================================================
   2.1 — reintentar sin duplicar y bandeja paginada (26-11-05)
   ============================================================ */

const fs = require("node:fs");
const path = require("node:path");

const fuenteChat = () =>
  fs.readFileSync(path.join(__dirname, "..", "src", "modules", "ai-core", "routes", "chat.routes.js"), "utf8");

test("la bandeja pagina y declara el total en vez de cortar en 50", () => {
  const rutas = fuenteChat();

  assert.match(rutas, /router\.get\("\/chat\/conversations", auth, requireUser/);
  assert.match(rutas, /const pagina = Math\.max\(1, Number\.parseInt\(req\.query\.page, 10\) \|\| 1\)/);
  assert.match(rutas, /hayMas: pagina \* limite < total/);
  // La búsqueda por título escapa el patrón: un `.*` no puede ser comodín.
  assert.match(rutas, /filtro\.title = new RegExp\(escaparRegex\(consulta\), "i"\)/);
  // El tope por página sigue existiendo; no se puede pedir todo de golpe.
  assert.match(rutas, /Math\.min\(\s*CONVERSATION_LIST_LIMIT/);
});

test("reintentar reutiliza el turno del usuario en vez de duplicarlo", () => {
  const rutas = fuenteChat();

  assert.match(rutas, /router\.post\("\/chat\/conversations\/:id\/retry"/);
  // Solo se reintenta el último mensaje y solo si es un error.
  assert.match(rutas, /if \(!ultimo \|\| ultimo\.estado !== "error"\)/);
  assert.match(rutas, /code: "NOTHING_TO_RETRY"/);
  // La respuesta se escribe en el hueco del error: no se hace `push`.
  const bloque = rutas.slice(rutas.indexOf('"/chat/conversations/:id/retry"'));
  const finBloque = bloque.indexOf('"/chat/conversations/:id/search"');
  const cuerpo = bloque.slice(0, finBloque > 0 ? finBloque : 4000);
  assert.ok(!/conversation\.messages\.push/.test(cuerpo), "reintentar no debe añadir mensajes");
  assert.match(cuerpo, /ultimo\.estado = "ok"/);
  // Un reintento fallido también se anota en el libro de consumo.
  assert.match(cuerpo, /estado: "error",\s*error: error\?\.message \|\| "CHAT_RETRY_ERROR"/);
});

test("el hilo ofrece reintentar solo en el último mensaje fallido", () => {
  const pantalla = fs.readFileSync(
    path.join(__dirname, "..", "..", "client", "src", "features", "ai", "KairosChat.jsx"),
    "utf8"
  );

  assert.match(pantalla, /indice === messages\.length - 1/);
  assert.match(pantalla, /retryChatMessage/);
  // La bandeja avisa de la página y del total.
  assert.match(pantalla, /Página \{paginaLista\}/);
  assert.match(pantalla, /hayMasConversaciones/);
});

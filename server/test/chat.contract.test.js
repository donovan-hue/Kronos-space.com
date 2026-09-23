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

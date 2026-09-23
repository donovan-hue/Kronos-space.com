const Message = require("./Message");

const DESIRED_INDEX_NAMES = new Set([
  "message_sender_receiver_clientMessageId_unique",
  "message_sender_conversation_clientMessageId_unique"
]);

function isLegacyClientMessageIndex(index) {
  const keys = Object.keys(index?.key || {});
  return keys.length === 2 && keys[0] === "sender" && keys[1] === "clientMessageId";
}

/**
 * Migrates the pre-021 clientMessageId index without deleting messages.
 *
 * New indexes are created first. If existing data contains a duplicate in the
 * new scope, MongoDB rejects the build and startup fails with the original
 * index untouched; an operator must inspect that data instead of losing
 * messages automatically.
 */
async function ensureMessageIndexes() {
  const collection = Message.collection;
  let existing = [];
  try {
    existing = await collection.listIndexes().toArray();
  } catch (error) {
    // A fresh database has no collection until the first index/model write.
    if (error?.code !== 26 && error?.codeName !== "NamespaceNotFound") throw error;
  }

  // This builds the schema's two scoped unique indexes. It is intentionally
  // before the legacy drop so a failed migration leaves the old index usable.
  try {
    await Message.createIndexes();
  } catch (error) {
    error.message = `MESSAGE_INDEX_MIGRATION_FAILED: ${error.message}`;
    throw error;
  }

  const legacy = existing.filter((index) =>
    isLegacyClientMessageIndex(index) && !DESIRED_INDEX_NAMES.has(index.name)
  );
  for (const index of legacy) {
    await collection.dropIndex(index.name);
    console.log(`MongoDB: índice legacy de clientMessageId eliminado (${index.name})`);
  }

  return { droppedLegacy: legacy.map((index) => index.name) };
}

module.exports = {
  ensureMessageIndexes,
  isLegacyClientMessageIndex,
  DESIRED_INDEX_NAMES
};

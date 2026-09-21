const MAX_HASHTAGS = 20;
const MAX_HASHTAG_LENGTH = 50;

// Hashtags se guardan sin #, en minúsculas y sin duplicados para que el
// contrato de búsqueda no dependa de cómo se escribió el texto original.
const HASHTAG_PATTERN = /#([\p{L}\p{N}_]{1,50})/gu;

function normalizeHashtags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item) => typeof item === "string")
      .map((item) => item.replace(/^#/, "").trim().toLocaleLowerCase("und"))
      .filter((item) => /^[\p{L}\p{N}_]{1,50}$/u.test(item))
  )].slice(0, MAX_HASHTAGS);
}

function extractHashtags(content = "") {
  const found = [];
  const source = typeof content === "string" ? content : "";
  for (const match of source.matchAll(HASHTAG_PATTERN)) found.push(match[1]);
  return normalizeHashtags(found);
}

function normalizeHashtagQuery(value) {
  const raw = typeof value === "string" ? value.trim().replace(/^#/, "") : "";
  if (!/^[\p{L}\p{N}_]{1,50}$/u.test(raw)) return "";
  return raw.toLocaleLowerCase("und");
}

module.exports = {
  MAX_HASHTAGS,
  MAX_HASHTAG_LENGTH,
  extractHashtags,
  normalizeHashtags,
  normalizeHashtagQuery
};

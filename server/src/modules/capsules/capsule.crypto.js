const crypto = require("crypto");

/**
 * Cifrado de cápsulas del tiempo (Fase 5 del plan maestro).
 *
 * El contenido de una cápsula se cifra con AES-256-GCM en el momento en
 * que se escribe y solo se descifra cuando la cápsula está abierta. Así,
 * ni un administrador de la base ni un reinicio del servidor pueden leer
 * una cápsula antes de su fecha.
 *
 * La clave se deriva con scrypt de CAPSULE_SECRET (recomendado en
 * producción) o, en su defecto, de JWT_SECRET.
 *
 * ROTACIÓN SIN PÉRDIDA: para rotar, pon la clave nueva en CAPSULE_SECRET
 * y conserva la anterior 1 ciclo en CAPSULE_SECRET_PREV. El cifrado usa
 * siempre la actual; el descifrado prueba actual y luego anterior.
 */

const KEY_CACHE = new Map();

function capsuleSecret() {
  const secret = process.env.CAPSULE_SECRET || process.env.JWT_SECRET || "";
  if (!secret) {
    throw new Error("Cápsulas requieren CAPSULE_SECRET o JWT_SECRET configurado");
  }
  return secret;
}

function derivedKey(secret = capsuleSecret()) {
  if (KEY_CACHE.has(secret)) return KEY_CACHE.get(secret);
  const key = crypto.scryptSync(secret, "kronos-capsules-v1", 32);
  KEY_CACHE.set(secret, key);
  return key;
}

function previousSecret() {
  const prev = (process.env.CAPSULE_SECRET_PREV || "").trim();
  if (!prev || prev === capsuleSecret()) return "";
  return prev;
}

/** Cifra texto y devuelve las partes necesarias para descifrarlo. */
function encryptText(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  return {
    cipherText: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
}

function decryptWithKey({ cipherText, iv, authTag }, key) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherText, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

/** Descifra una entrada cifrada. Lanza si ninguna clave coincide. */
function decryptText(payload) {
  try {
    return decryptWithKey(payload, derivedKey());
  } catch (firstError) {
    const prev = previousSecret();
    if (!prev) throw firstError;
    // Clave anterior: solo lectura durante la ventana de rotación.
    return decryptWithKey(payload, derivedKey(prev));
  }
}

module.exports = { encryptText, decryptText };

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
 * producción) o, en su defecto, de JWT_SECRET. Rotar el secreto vuelve
 * ilegibles las cápsulas existentes: documentado en KRONOS-CAPSULES.md.
 */

const KEY_CACHE = new Map();

function capsuleSecret() {
  const secret = process.env.CAPSULE_SECRET || process.env.JWT_SECRET || "";
  if (!secret) {
    throw new Error("Cápsulas requieren CAPSULE_SECRET o JWT_SECRET configurado");
  }
  return secret;
}

function derivedKey() {
  const secret = capsuleSecret();
  if (KEY_CACHE.has(secret)) return KEY_CACHE.get(secret);
  const key = crypto.scryptSync(secret, "kronos-capsules-v1", 32);
  KEY_CACHE.set(secret, key);
  return key;
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

/** Descifra una entrada cifrada. Lanza si la clave o el tag no coinciden. */
function decryptText({ cipherText, iv, authTag }) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherText, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

module.exports = { encryptText, decryptText };
